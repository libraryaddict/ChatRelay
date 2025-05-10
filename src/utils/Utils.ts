import { decode, decodeEntity, encode } from "html-entities";
import { KOLMessage, PublicMessageType } from "./Typings";

/**
 * Start KoL's special encoding
 */
const SAFECHARS =
  "0123456789" + // Numeric
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ" + // Alphabetic
  "abcdefghijklmnopqrstuvwxyz" +
  "-_.!~*'()"; // RFC2396 Mark characters
const HEX = "0123456789ABCDEF";
const originalRollover = 1044847800;

export function encodeToKolEncoding(x: string): string {
  // The Javascript escape and unescape functions do not correspond
  // with what browsers actually do...

  const plaintext = x;
  let encoded = "";

  for (let i = 0; i < plaintext.length; i++) {
    const ch = plaintext.charAt(i);

    if (ch == "+") {
      encoded += "%2B";
    } else if (ch == " ") {
      encoded += "+"; // x-www-urlencoded, rather than %20
    } else if (SAFECHARS.indexOf(ch) != -1) {
      encoded += ch;
    } else {
      const charCode = ch.charCodeAt(0);

      if (charCode > 255) {
        /*  console.log(
          "Unicode Character '" +
            ch +
            "' cannot be encoded using standard URL encoding.\n" +
            "(URL encoding only supports 8-bit characters.)\n" +
            "A space will be substituted."
        );*/
        // Replace invalid chars with a question mark
        encoded += "%3F";
      } else {
        encoded += "%";
        encoded += HEX.charAt((charCode >> 4) & 0xf);
        encoded += HEX.charAt(charCode & 0xf);
      }
    }
  } // for

  return encoded;
}

export function cleanupKolMessage(
  sender: string,
  msg: string,
  messageType: PublicMessageType | undefined
): string {
  const links: string[] = [];

  // Strip out zero length characters
  const zeroLengthChar = decodeEntity(`&ZeroWidthSpace;`);

  while (msg.includes("&#8203;") || msg.includes(zeroLengthChar)) {
    msg = msg.replace(/(&#8203;)+/, "").replace(zeroLengthChar, "");
  }

  msg = stripHtml(msg, true);

  for (const match of msg.matchAll(/<a [^><]*?href="([^"]*)"/g)) {
    links.push(match[1]);
  }

  for (const link of links) {
    const line = `<a target=_blank href="${link}">[link]</a>`;
    const index = msg.indexOf(line);

    if (index < 0) {
      continue;
    }

    const toLookFor =
      encode(link.substring(0, Math.min(link.length, 40))) +
      (link.length > 40 ? "..." : "");

    let dotIndex =
      msg.indexOf(toLookFor, index + line.length) + toLookFor.length;

    if (dotIndex <= index) {
      dotIndex = msg.indexOf(link, index + line.length);

      if (dotIndex >= index) {
        dotIndex += line.length;
      }
    }

    if (dotIndex <= index) {
      continue;
    }

    msg = msg.substring(0, index) + " " + link + " " + msg.substring(dotIndex);
  }

  msg = msg.replaceAll(/<[Bb][Rr]>/g, "\n");

  msg = stripHtml(msg);

  if (msg.trim().length == 0) {
    return msg;
  }

  msg = decode(msg);

  if (
    messageType == "emote" &&
    sender != null &&
    sender.length > 0 &&
    msg.startsWith(sender)
  ) {
    msg = msg.replace(sender, "").trim();
  }

  msg = msg.replaceAll(/ {2,}/g, " ");

  return msg;
}

export function getBadKolEffects(): string[] {
  return [
    "wanged",
    "Emotion Sickness",
    "Bruised Jaw",
    "So Much Holiday Fun!",
    "On Safari",
    "Harpooned and Marooned"
  ].map((s) => s.toLowerCase());
}

export function humanReadableTime(seconds: number): string {
  return `${Math.floor(seconds / 3600)}:${Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
}

export function stripHtml(
  message: string,
  skipUrlTags: boolean = false
): string {
  interface OpeningTag {
    index: number;
    fullTag: string;
    tagName: string;
    title?: string;
  }

  interface ClosingTag {
    index: number;
    tagName: string;
  }

  // Collect all opening tags with their metadata
  const openingTags: OpeningTag[] = [];
  const openingTagRegex = /<([^/>\s]+)(?:\s+([^>]*?))?>/g;
  let match: RegExpExecArray | null;

  while ((match = openingTagRegex.exec(message)) !== null) {
    const titleMatch = match[2]?.match(/title="([^"]*)"/);
    openingTags.push({
      index: match.index,
      fullTag: match[0],
      tagName: match[1].toLowerCase(),
      title: titleMatch?.[1]
    });
  }

  // Collect all closing tags
  const closingTags: ClosingTag[] = [];
  const closingTagRegex = /<\/([^>]+)>/g;

  while ((match = closingTagRegex.exec(message)) !== null) {
    closingTags.push({
      index: match.index,
      tagName: match[1].toLowerCase()
    });
  }

  // Process tags recursively
  for (const openingTag of openingTags) {
    const { index: openIndex, fullTag, tagName, title } = openingTag;

    if (skipUrlTags && tagName == "a") {
      continue;
    }

    const possibleClosings = closingTags.filter(
      (closing) => closing.tagName === tagName && closing.index > openIndex
    );

    const conflictingOpenings = openingTags.filter(
      (other) => other.tagName === tagName && other.index > openIndex
    );

    for (let i = 0; i < possibleClosings.length; i++) {
      const closingTag = possibleClosings[i];

      if (
        i < conflictingOpenings.length &&
        conflictingOpenings[i].index < closingTag.index
      ) {
        continue;
      }

      const content =
        title ?? message.slice(openIndex + fullTag.length, closingTag.index);

      const closingTagLength = closingTag.tagName.length + 3; // </tag>
      const newMessage =
        message.slice(0, openIndex) +
        content +
        message.slice(closingTag.index + closingTagLength);

      return stripHtml(newMessage, skipUrlTags);
    }
  }

  // Replace special images with emojis
  const emojiReplacements: Record<string, string> = {
    "12x12skull.gif": ":skull:",
    "12x12heart.png": ":heart:",
    "12x12snowman.gif": ":snowman:"
  };

  message = message.replace(
    /<img[^>]*?(12x12(?:skull\.gif|heart\.png|snowman\.gif))[^>]*>/gi,
    (_, filename) => emojiReplacements[filename] || ""
  );

  // Remove any remaining HTML tags
  if (!skipUrlTags) {
    message = message.replace(/<[^>]+>/g, "");
  }

  return message.trim();
}

/**
 * Used to split a message to fit into KOL's message limits
 *
 * 260 is the rough limit, but given it injects spaces in 20+ long words. Lower that to 245
 */
export function splitMessage(
  prefix: string,
  message: string,
  limit: number = 245
): string[] {
  limit -= encodeToKolEncoding(prefix).length;

  // TODO Try to honor spaces
  const remaining: [string, string][] = message
    .split("")
    .map((s) => [s, encodeToKolEncoding(s)]);

  const nextSpace = (): [number, number] => {
    let index = 0;
    let len = 0;

    for (; index < remaining.length; index++) {
      if (remaining[index][0] != " " && len < 20) {
        len += remaining[index][1].length;
        continue;
      }

      break;
    }

    return [index, len];
  };

  const messages: string[] = [];
  let currentString = "";
  let currentLength = 0;

  const resetString = () => {
    if (currentString.length == 0) {
      return;
    }

    messages.push(prefix + currentString.trim());
    currentString = "";
    currentLength = 0;
  };

  while (remaining.length > 0) {
    const [space, nextLen] = nextSpace();

    if (nextLen + currentLength > limit) {
      resetString();
    }

    currentLength += nextLen + 1;
    currentString += remaining
      .splice(0, space + 1)
      .map((s) => s[0])
      .join("");
  }

  resetString();

  return messages;
}

export function isModMessage(message: KOLMessage): boolean {
  return (
    message.who != null &&
    (message.who.name === "Mod Announcement" ||
      message.who?.name === "Mod Warning")
  );
}

export function isEventMessage(message: KOLMessage): boolean {
  return message.type === "event";
}

export function isPrivateMessage(message: KOLMessage): boolean {
  return message.type === "private";
}

export function isSystemMessage(message: KOLMessage): boolean {
  return message.type === "system";
}

export function isPublicMessage(message: KOLMessage): boolean {
  return message.type === "public";
}

export function getPublicMessageType(
  message: KOLMessage
): PublicMessageType | undefined {
  if (message.type != "public") {
    return undefined;
  }

  if (message.format == "0") {
    return "normal";
  } else if (message.format == "1") {
    return "emote";
  } else if (message.format == "2") {
    return "system";
  } else if (message.format == "3") {
    return "mod warning";
  } else if (message.format == "4") {
    return "mod announcement";
  } else if (message.format == "98") {
    return "event";
  } else if (message.format == "99") {
    return "welcome";
  }

  return undefined;
}

export function getKolDay(time: number = Math.round(Date.now() / 1000)) {
  const timeDiff = time - originalRollover;
  const daysSince = timeDiff / (24 * 60 * 60);

  return Math.floor(daysSince);
}
