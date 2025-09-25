import { decode, encode } from "html-entities";
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
type MessageSegment =
  | { type: "text"; content: string }
  | { type: "link"; url: string };

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
  messageType: PublicMessageType | undefined,
  outputGoal: "plaintext" | "discord" = "plaintext",
  allowLinkPreviews = true // Only used on discord
): string {
  // Strip out zero-width space characters
  msg = msg.replaceAll(/(&#8203;)|(\u200B)/g, "");
  // Convert <br> to newlines
  msg = msg.replaceAll(/<br\/?>/gi, "\n");

  const segments: MessageSegment[] = [];
  // Finds all <a> and only matches on the href, don't care about anything else in that tag
  const linkRegex = /<a [^>]*href=["'](http[^"']*)["'][^>]*>.*?(?=<\/a>)/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(msg)) !== null) {
    // Add the plain text part that came before this link
    if (match.index > lastIndex) {
      segments.push({
        type: "text",
        content: stripHtml(msg.substring(lastIndex, match.index), false)
      });
    }

    // Add the link part
    segments.push({ type: "link", url: match[1] });
    lastIndex = linkRegex.lastIndex;
  }

  // Add any remaining plain text after the last link
  if (lastIndex < msg.length) {
    segments.push({
      type: "text",
      content: stripHtml(msg.substring(lastIndex), false)
    });
  }

  // Remove the plaintext links
  for (let i = 0; i < segments.length - 1; i++) {
    const currentSegment = segments[i];
    const nextSegment = segments[i + 1];

    removeLink(currentSegment, nextSegment);
  }

  // Build the final message string
  let processedMsg = segments
    .map((segment) => {
      if (segment.type === "text") {
        // For plain text, strip all HTML.
        const content = decode(segment.content);

        if (outputGoal === "discord") {
          return escapeSpecialCharacters(content);
        }

        return content;
      } else {
        // If we do not plan to modify the url displayed
        if (outputGoal === "plaintext" || allowLinkPreviews) {
          return segment.url;
        }

        // If on discord and not allowing link previews, wrap in <>
        return `<${segment.url}>`;
      }
    })
    .join("");

  if (
    messageType === "emote" &&
    sender != null &&
    sender.length > 0 &&
    processedMsg.startsWith(sender)
  ) {
    processedMsg = processedMsg.replace(sender, "");
  }

  // Collapse multiple spaces into a single space
  processedMsg = processedMsg.replaceAll(/ {2,}/g, " ");

  return processedMsg.trim();
}

function removeLink(
  currentSegment: MessageSegment,
  nextSegment: MessageSegment
) {
  // Check for a link segment followed by a text segment
  if (currentSegment.type !== "link" || nextSegment.type !== "text") {
    return;
  }

  const url = currentSegment.url;
  const textContent = nextSegment.content;
  let textScanIndex = 0;

  // Attempt to match each character of the URL in the text
  for (const char of url) {
    while (
      textScanIndex < textContent.length &&
      textContent[textScanIndex] != char &&
      /\s/.test(textContent[textScanIndex])
    ) {
      textScanIndex++;
    }

    let encodedChar: string;

    // Try to match the character
    if (textContent[textScanIndex] === char) {
      textScanIndex++;
      continue;
    } else if (
      textContent
        .substring(textScanIndex)
        .startsWith((encodedChar = encode(char)))
    ) {
      textScanIndex += encodedChar.length;
      continue;
    }

    // If the character doesn't match, check for a "..."
    if (textContent.substring(textScanIndex).startsWith("...")) {
      nextSegment.content = textContent.substring(textScanIndex + 3);
    }

    // It either failed, or it ended with a "..."
    return;
  }

  // As it didn't return, the url has a full match
  nextSegment.content = textContent.substring(textScanIndex);
}

function escapeSpecialCharacters(text: string): string {
  // If the goal is discord, allow some common characters and escape the rest
  // Technically, we can escape .,?!'" but they are common enough that it should never be an issue
  // Discord seemingly allows us to escape any character that's not a number/letter/space
  // https://github.com/discord/SimpleAST/blob/master/simpleast-core/src/main/java/com/discord/simpleast/core/simple/SimpleMarkdownRules.kt#L25
  return text.replaceAll(/([^\da-zA-Z\s\n.,?!'"])/g, "\\$1");
}

const linkRegex =
  /(https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\\+.~#?&//=]*))/g;

export function basicSanitization(text: string): string {
  // Remove all zero length spaces in the message
  text = text.replaceAll(/\u200B/g, "");
  // Escape characters
  text = escapeSpecialCharacters(text);

  text = text.replaceAll(linkRegex, "<$1>");

  return text;
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

export function stripHtml(message: string, shouldTrim: boolean = true): string {
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

      return stripHtml(newMessage, shouldTrim);
    }
  }

  // Replace special images with emojis
  const emojiReplacements: Record<string, string> = {
    "12x12skull.gif": "💀",
    "12x12heart.png": "❤️",
    "12x12snowman.gif": "⛄"
  };

  message = message.replace(
    /<img[^>]*?(12x12(?:skull\.gif|heart\.png|snowman\.gif))[^>]*>/gi,
    (_, filename) => emojiReplacements[filename] || ""
  );

  // Remove any remaining HTML tags
  message = message.replace(/<[^>]+>/g, "");

  if (shouldTrim) {
    return message.trim();
  }

  return message;
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
