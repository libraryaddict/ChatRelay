import { decode, encode } from "html-entities";
import {
  FormattedMessage,
  KOLMessage,
  PublicMessageType,
  ServerSide
} from "./Typings";

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
  | { type: "link"; url: string }
  | { type: "emoji"; content: string }
  | { type: "decoration"; content: string };
const emojiReplacements: Record<string, string> = {
  "12x12skull.gif": ":skull:",
  "12x12heart.png": ":heart:",
  "12x12snowman.gif": ":snowman:"
};

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
} // Replace special images with emojis

export function stripInvisibleCharacters(str: string): string {
  // U+200B (Zero Width Space), U+200C (Zero Width Non-Joiner),
  // U+200D (Zero Width Joiner), U+FEFF (Zero Width No-Break Space / BOM),
  // U+2060 (Word Joiner), U+180E (Mongolian Vowel Separator),
  // U+2061-U+2064 (Invisible Operators), U+206A-U+206F (Formatting Inhibitors/Activators),
  // U+00AD (Soft Hyphen), U+061C (Arabic Letter Mark)
  const invisibleCharRegex =
    /&#8203;|&#x200B;|[\u200B-\u200D\uFEFF\u2060\u180E\u2061-\u2064\u206A-\u206F\u00AD\u061C]/g;

  return str.replace(invisibleCharRegex, "");
}

export function isRolloverMessage(message: KOLMessage): boolean {
  return (
    message.msg &&
    /^(The system will go down for nightly maintenance in \d+ minutes?|Rollover is over).$/.test(
      message.msg
    )
  );
}

export function isUpdateMessage(message: KOLMessage) {
  return (
    message.type == "system" &&
    message.msg ==
      "A new update has been posted. Use the /updates command to read it."
  );
}

export function cleanupKolMessage(
  msg: string,
  messageType: PublicMessageType | undefined,
  outputGoal: "plaintext" | "discord" = "plaintext",
  allowLinkPreviews = true, // Only used on discord
  source: ServerSide = "KoL"
): string {
  // Strip out zero-width space characters
  msg = stripInvisibleCharacters(msg);

  const segments: MessageSegment[] = [];
  let lastIndex = 0;

  // If html isn't possible, then the <> were sent via the user
  if (source == "KoL") {
    // Convert <br> to newlines
    msg = msg.replaceAll(/<br\/?>/gi, "\n");
    // Remove all <i title="real text">fake text</i> so they're parsed as text
    msg = msg.replaceAll(/<i title=["'](.+?)["']>.+?<\/i>/g, "$1");

    // Matches <a> tags, individual <b>, <i title=""> tags (opening/closing), and <img> tags
    const combinedRegex =
      /<a[^>]*?font-weight:\s*bold[^>]*>(.*?)<\/a>|<a [^>]*href=["'](http[^"']*)["'][^>]*>\s*<font color=blue>\s*\[link\]\s*<\/font>\s*<\/a>|(<\/?b>)|<\/?i title=['"]([^>]*)['"][^>]*>|<img [^>]*src=["']([^"']*)["'][^>]*\/?>/gi;
    let match: RegExpExecArray | null;

    while ((match = combinedRegex.exec(msg)) !== null) {
      // Add the plain text part that came before this match
      if (match.index > lastIndex) {
        const content = stripHtml(msg.substring(lastIndex, match.index), false);

        if (content.length > 0) {
          segments.push({
            type: "text",
            content: content
          });
        }
      }

      const [fullMatch, boldLinkText, fontLinkUrl, bold, italic, imgSrc] =
        match;

      if (boldLinkText) {
        // Matched a bold <a> tag
        segments.push({ type: "decoration", content: "**" });
        const content = stripHtml(boldLinkText, false);

        if (content.length > 0) {
          segments.push({
            type: "text",
            content: content
          });
        }

        segments.push({ type: "decoration", content: "**" });
      } else if (fontLinkUrl) {
        // Matched a <font...>[link]</font> </a> tag
        segments.push({ type: "link", url: fontLinkUrl });
      } else if (bold) {
        // Matched a <b> or </b> tag
        segments.push({ type: "decoration", content: "**" });
      } else if (italic) {
        // Matched an <i> or </i> tag
        // Emotes are italic by default
        if (messageType !== "emote") {
          // We don't use _ as it messes with search
          segments.push({ type: "decoration", content: "*" });
        }
      } else if (imgSrc) {
        // Matched an <img> tag, check for emoji replacement
        const filename = imgSrc.split("/").pop() || "";
        const emoji = emojiReplacements[filename];
        const content = emoji ? emoji : `(unhandled) ${filename}`;

        segments.push({ type: "emoji", content: content });
      }

      lastIndex = combinedRegex.lastIndex;
    }
  }

  // Add any remaining plain text after the last match
  if (lastIndex < msg.length) {
    const content = stripHtml(msg.substring(lastIndex), false);

    if (content.length > 0) {
      segments.push({
        type: "text",
        content: content
      });
    }
  }

  if (source === "KoL") {
    // Remove messages that are completely in bold, which currently extends to just pirate's bellow
    removeBellowBold(segments);
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

        if (outputGoal === "discord" && source !== "Discord") {
          return escapeSpecialCharacters(content);
        }

        return content;
      } else if (segment.type === "decoration") {
        if (outputGoal !== "plaintext") {
          return segment.content;
        }

        // Non-Discord don't get decorations
        return "";
      } else if (segment.type === "emoji") {
        return segment.content;
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

  // Collapse multiple spaces into a single space
  processedMsg = processedMsg.replaceAll(/ {2,}/g, " ");

  return processedMsg.trim();
}

function removeBellowBold(segments: MessageSegment[]) {
  const skullOffset = segments.findIndex(
    (s) => s.type === "emoji" && s.content === ":skull:"
  );

  // If it is the first segment, or not in
  // <b>:skull: message :skull:</b> - B tags wrap the skulls
  if (skullOffset <= 0) {
    return;
  }

  // If there are not enough segments
  if (segments.length <= skullOffset * 2) {
    return;
  }

  const firstEmoji = segments[skullOffset];
  const lastEmoji = segments[segments.length - (skullOffset + 1)];

  // This message starts and ends with skull emoji
  if (
    firstEmoji.type != "emoji" ||
    lastEmoji.type != "emoji" ||
    firstEmoji.content != ":skull:" ||
    lastEmoji.content != ":skull:"
  ) {
    return;
  }

  const firstBold = segments[skullOffset - 1];
  const lastBold = segments[segments.length - skullOffset];

  // If the above emoji was inside bold tags
  if (
    firstBold.type != "decoration" ||
    lastBold.type != "decoration" ||
    firstBold.content != "**" ||
    lastBold.content != "**"
  ) {
    return;
  }

  // Remove the first <b> and the last <b>
  segments.splice(skullOffset - 1, 1);
  segments.splice(segments.length - skullOffset, 1);
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
  // If the goal is discord, we try to escape only the formatting codes that would be used.
  // Some people do see the escape character as they have formatting turned off. So we want to avoid showing it if it would appear
  return text
    .replaceAll(/([\\@#*_])/gm, "\\$1") // Disable backslashes, mentions, channels, bold and italics (We add those ourselves and don't want trouble)
    .replaceAll(/(\[.*?)(\])/gm, "\\$1\\$2") // Prevent []
    .replaceAll(/(<.*?)(>)/gm, "\\$1\\$2") // Prevent <>
    .replaceAll(/([`])(?=.*?\1)/gm, "\\$1") // Formatting codes that requires a closing tag of the same symbol
    .replaceAll(/(:[^\s]+?)(:)/gim, "$1\\$2") // Prevent :emoji:
    .replaceAll(/([|~])(?=\1.*?\1\1)/gm, "\\$1") // Formatting codes that require two and a closing (spoiler and strike)
    .replaceAll(/([\r\n]+)([*>-])/g, "$1\\$2") // Formatting codes that need to be at the start of the line
    .replaceAll(/([\r\n]+\s*\d+)(\.)/g, "$1\\$2"); // Disable numbered lists
}

export function removeKolEmote(sender: string, msg: string): string {
  const pattern = `^(?:<b>|<i>|<(?:font|a) [^>]*>)+${sender}(?:</b>|</i>|</a>|</font>)+ `;

  const match = msg.match(new RegExp(pattern, "i"));

  if (match != null) {
    msg = msg.substring(match[0].length);
  }

  return msg;
}

/**
 * Converts the message
 * @param sender
 * @param message
 * @param type
 * @param goal
 */
export function formatMessage(
  sender: string,
  message: string,
  type: PublicMessageType,
  allowLinkPreviews: boolean,
  source: ServerSide
): FormattedMessage {
  const senderName = type === "system" ? "System" : sender;

  const kolMessage = cleanupKolMessage(
    message,
    type,
    "plaintext",
    allowLinkPreviews,
    source
  );
  let discordMessage = cleanupKolMessage(
    message,
    type,
    "discord",
    allowLinkPreviews,
    source
  );

  let senderNameBrackets = sender;

  if (!sender.startsWith("[") && !sender.endsWith("]")) {
    senderNameBrackets = `[${senderNameBrackets}]`;
  }

  let embedTitle: string;
  let embedColor: number;
  let embedDesc: string;
  let kolPrefix: string = senderNameBrackets + " ";

  if (type === "emote") {
    kolPrefix = `/me ${kolPrefix}`;
    // We use * instead of _ as _ interferes with discord search
    discordMessage = `***${senderNameBrackets}** ${discordMessage}*`;
  } else if (type === "mod announcement") {
    embedTitle = `Mod Warning by ${senderName}`;
    embedColor = 0x2ca816;
    embedDesc = discordMessage;

    discordMessage = `:warning: **${senderNameBrackets}** ${discordMessage}`;
    kolPrefix = `[Mod Announcement] ${kolPrefix}`;
  } else if (type === "mod warning") {
    embedTitle = `Mod Warning by ${senderName}`;
    embedColor = 0xff0008;
    embedDesc = discordMessage;

    discordMessage = `:no_entry_sign: **${senderNameBrackets}** ${discordMessage}`;
    kolPrefix = `[Mod Warning] ${kolPrefix}`;
  } else if (type === "system") {
    embedTitle = `System`;
    embedColor = 0xff0008;
    embedDesc = discordMessage;

    discordMessage = `:loudspeaker: **${senderNameBrackets}** ${discordMessage}`;
    kolPrefix = `[System] ${kolPrefix}`;
  } else {
    discordMessage = `**${senderNameBrackets}** ${discordMessage}`;
  }

  return {
    embedTitle: embedTitle,
    embedColor: embedColor,
    embedDescription: embedDesc,
    discordMessage: discordMessage,
    kolPrefix: kolPrefix,
    kolMessage: kolMessage
  };
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

const secondsInDay = 24 * 60 * 60;

export function getSecondsElapsedInDay(
  time: number = Math.round(Date.now() / 1000)
) {
  const secondsSinceOriginalTime = time - originalRollover;
  const secondsElapsedInDay = secondsSinceOriginalTime % secondsInDay;

  return secondsElapsedInDay;
}
