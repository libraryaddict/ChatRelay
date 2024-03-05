import { decode, encode } from "html-entities";
import { KOLMessage, ModeratorName, PublicMessageType } from "./Typings";
import { existsSync } from "fs";

/**
 * Start KoL's special encoding
 */
const SAFECHARS =
  "0123456789" + // Numeric
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ" + // Alphabetic
  "abcdefghijklmnopqrstuvwxyz" +
  "-_.!~*'()"; // RFC2396 Mark characters
const HEX = "0123456789ABCDEF";

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

  for (const match of msg.matchAll(/href="([^"]*)"/g)) {
    links.push(decode(match[1]));
  }

  msg = msg.replaceAll(/<[Bb][Rr]>/g, "\n");

  const tempMsg = msg;
  msg = stripHtml(msg);

  if (msg.trim().length == 0) {
    msg = "RAW: " + tempMsg;
  }

  msg = decode(msg);

  if (messageType == "emote" && msg.startsWith(sender)) {
    msg = msg.replace(sender, "").trim();
  }

  for (const link of links) {
    let newMsg = "";
    let state = 0;
    let startAt = 0;

    for (let i = 0; i <= msg.length; i++) {
      if (state == 0 && i < msg.length) {
        if (
          msg.charAt(i) == " " ||
          !msg
            .substring(i)
            .replaceAll(" ", "")
            .startsWith("[link]" + link)
        ) {
          continue;
        }

        state = 1;
        startAt = i;
        newMsg = msg.substring(0, i) + link;
      } else if (state == 1) {
        if (msg.substring(startAt, i).replaceAll(" ", "") != "[link]" + link) {
          continue;
        }

        newMsg += msg.substring(i);
        state = 2;
        break;
      }
    }

    if (state == 2) {
      msg = newMsg;
    }
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
    "Harpooned and Marooned",
  ].map((s) => s.toLowerCase());
}

export function humanReadableTime(seconds: number): string {
  return `${Math.floor(seconds / 3600)}:${Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
}

// This is a bit messy, feel free to make your own.. Needs to basically know about child tags
export function stripHtml(message: string): string {
  let match;
  let startFrom = 0;

  const openingTags: [number, string, string, string?][] = [];
  const closingTags: [number, string][] = [];

  while (
    (match = message.match(
      `^(.{` +
        startFrom +
        `}.*?)(<([^/> ]+)[^>]*?(?: title="([^">]*)")?[^>]*?>)`
    )) != null
  ) {
    // Index, Full tag, tag name, title
    openingTags.push([match[1].length, match[2], match[3], match[4]]);

    startFrom = match[0].length;
  }

  startFrom = 0;

  while ((match = message.match(`^(.{` + startFrom + `}.*?)</([^>]*)>`))) {
    startFrom = match[0].length;
    closingTags.push([match[1].length, match[2]]);
  }

  while (openingTags.length > 0) {
    const [index, fullTag, name, title] = openingTags[0];

    const validClosing = closingTags.filter(
      ([cInd, cName]) => cInd > index && cName == name
    );
    const confOpening = openingTags.filter(
      ([ind, ful, nam]) => ind >= index && nam == name
    );

    openingTags.shift();

    let ind = 0;

    while (ind < validClosing.length) {
      if (confOpening.length > ind) {
        if (confOpening[ind][0] > validClosing[ind][0]) {
          ind++;
          continue;
        }
      }

      const between =
        title ??
        message.substring(index + fullTag.length, +validClosing[ind][0]);
      const endFrom = validClosing[ind][0] + name.length + 3;
      const startFrom = index;

      message =
        message.substring(0, startFrom) + between + message.substring(endFrom);

      return stripHtml(message);
    }
  }

  while ((match = message.match(/<.*?>/)) != null) {
    let replaceWith = "";

    if (match[0].includes('12x12skull.gif"')) {
      replaceWith = ":skull:";
    }

    if (match[0].includes('12x12heart.png"')) {
      replaceWith = ":heart:";
    }

    if (match[0].includes('12x12snowman.gif"')) {
      replaceWith = ":snowman:";
    }

    message = message.replace(match[0], replaceWith);
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
  let remaining: [string, string][] = message
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
    if (currentString.length == 0) return;

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
