import { decode, encode } from "html-entities";
import { KOLMessage, KolEffect, PublicMessageType } from "./Typings";

/**
 * Start KoL's special encoding
 */
let SAFECHARS =
  "0123456789" + // Numeric
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ" + // Alphabetic
  "abcdefghijklmnopqrstuvwxyz" +
  "-_.!~*'()"; // RFC2396 Mark characters
let HEX = "0123456789ABCDEF";
export function encodeToKolEncoding(x: string): string {
  // The Javascript escape and unescape functions do not correspond
  // with what browsers actually do...

  let plaintext = x;
  let encoded = "";
  for (var i = 0; i < plaintext.length; i++) {
    let ch = plaintext.charAt(i);
    if (ch == "+") {
      encoded += "%2B";
    } else if (ch == " ") {
      encoded += "+"; // x-www-urlencoded, rather than %20
    } else if (SAFECHARS.indexOf(ch) != -1) {
      encoded += ch;
    } else {
      let charCode = ch.charCodeAt(0);
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

  let openingTags: [number, string, string, string?][] = [];
  let closingTags: [number, string][] = [];

  while (
    (match = message.match(
      `^(.{` + startFrom + `}.*?)(<([^/> ]+)[^>]*?(?: title="([^">]*)")?[^>]*?>)`
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
    let [index, fullTag, name, title] = openingTags[0];

    let validClosing = closingTags.filter(([cInd, cName]) => cInd > index && cName == name);
    let confOpening = openingTags.filter(([ind, ful, nam]) => ind >= index && nam == name);

    openingTags.shift();

    let ind = 0;

    while (ind < validClosing.length) {
      if (confOpening.length > ind) {
        if (confOpening[ind][0] > validClosing[ind][0]) {
          ind++;
          continue;
        }
      }

      const between = title ?? message.substring(index + fullTag.length, +validClosing[ind][0]);
      const endFrom = validClosing[ind][0] + name.length + 3;
      const startFrom = index;

      message = message.substring(0, startFrom) + between + message.substring(endFrom);

      return stripHtml(message);
    }
  }

  while ((match = message.match(/<.*?>/)) != null) {
    let replaceWith = "";

    if (match[0].includes('12x12skull.gif"')) replaceWith = ":skull:";
    if (match[0].includes('12x12heart.png"')) replaceWith = ":heart:";
    if (match[0].includes('12x12snowman.gif"')) replaceWith = ":snowman:";

    message = message.replace(match[0], replaceWith);
  }

  return message.trim();
}

/**
 * Used to split a message to fit into KOL's message limits
 *
 * 260 is the rough limit, but given it injects spaces in 20+ long words. Lower that to 245
 */
export function splitMessage(message: string, limit: number = 245): string[] {
  // TODO Try to honor spaces
  let encodedRemainder = encode(message);
  let messages: string[] = [];

  if (encodedRemainder.length > limit) {
    let end = limit;
    let toSnip: string;

    // Make sure we don't leave html entities out
    while (
      !message.includes((toSnip = decode(encodedRemainder.substring(0, end)))) ||
      !message.includes(decode(encodedRemainder.substring(end)))
    ) {
      end--;
    }

    encodedRemainder = encodedRemainder.substring(end);
    messages.push(toSnip);
  }

  messages.push(decode(encodedRemainder));

  return messages;
}

export function isModMessage(message: KOLMessage): boolean {
  return (
    message.who != null &&
    (message.who.name === "Mod Announcement" || message.who?.name === "Mod Warning")
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

export function getPublicMessageType(message: KOLMessage): PublicMessageType | undefined {
  if (message.type != "public") return undefined;

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
