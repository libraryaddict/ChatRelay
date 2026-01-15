import { LoggingEditor, LoggingTarget } from "@prisma/client";
import { getKolDay } from "../../utils/Utils";
import { addUpdateEdit, getEdit, getLogging } from "../DiscordLoggingDatabase";
import { CommandInterface, CommandResponse } from "./iCommand";
import { postToWebhook, WebhookData } from "../WebhookManager";
import { DiscordLoggingHandler, ErrorResponse } from "../DiscordLoggingHandler";
import { APIEmbed, BaseMessageOptions } from "discord.js";
import axios from "axios";

interface DiscordAction {
  id?: string;
  title?: string;
  status: string;
  color?: string;
  editId?: string;
}

export class CommandRunLog implements CommandInterface {
  constructor(private discord: DiscordLoggingHandler) {}

  getAction(message: string): DiscordAction | null {
    const regex = message.match(
      /^(?:ID: ([^ ]+) )?(?:Color: ([a-zA-Z\d]{1,18}) )?(?:Edit: ([^ ]+) )?(?:Title: (.+) )?Status: (.+)$/s
    );

    if (regex == null) {
      return null;
    }

    let color = regex[2];

    if (color != null && color.length > 0) {
      color = this.colourNameToHex(color) ?? color;
    }

    let status = regex[5];

    while (status.includes("\\n")) {
      status = status.replace("\\n", "\n");
    }

    return {
      id: regex[1],
      title: regex[4],
      status: status,
      color: color,
      editId: regex[3]
    };
  }

  getHelp(shortForm: boolean): string {
    return "Please see the README";
  }

  isCommand(message: string): boolean {
    return this.getAction(message) != null;
  }

  async runCommand(
    sender: string,
    message: string
  ): Promise<CommandResponse | CommandResponse[]> {
    const action = this.getAction(message);

    if (action == null) {
      return { message: "Illegal format" };
    }

    const targetId = action.id ?? "default";

    const target = (await getLogging(parseInt(sender))).find(
      (t) => t.identifier == targetId
    );

    if (target == null) {
      if (targetId == "default") {
        return { message: "You didn't set up a 'default' logging target!" };
      }

      return {
        message: `Unable to find any logging target by the name '${targetId}'`
      };
    }

    action.status = action.status.replace(/< ?@(&?) ?(\d{18,})>/g, "<@$1$2>");

    return await this.sendMessage(
      target,
      action.editId as string,
      action.status,
      action.title,
      action.color ? parseInt(action.color, 16) : undefined
    );
  }

  async sendMessage(
    logging: LoggingTarget,
    editId: string | null,
    messageParam: string,
    titleParam?: string,
    colorParam?: number
  ): Promise<CommandResponse | CommandResponse[]> {
    const data: WebhookData = {
      url: logging.targetData,
      embedTitle: titleParam,
      color: colorParam,
      message: messageParam,
      avatar: logging.avatar,
      name: logging.displayname,
      errorOnRateLimit: true
    };

    const matches = messageParam.match(/<@(&?)?(\d{18,})>/g);

    if (matches != null && matches.length > 0) {
      const toPing: string[] = [];

      for (const m of matches) {
        if (toPing.includes(m)) {
          continue;
        }

        toPing.push(m);
      }

      if (toPing.length > 0) {
        data.contentMessage = "Pinging " + toPing.join(" ") + "!";
      }
    }

    let editSetting: LoggingEditor | null = null;

    if (editId != null) {
      data.wait = true;

      editSetting = await getEdit(logging.player, editId);

      if (
        editSetting != null &&
        (!editSetting.melting || editSetting.lastUse == getKolDay())
      ) {
        data.editMessage = editSetting.identifier;
      }
    }

    let res: string | null = null;

    if (logging.target == "dm") {
      res = await this.postToDiscord(logging, data);
    } else if (logging.target == "webhook") {
      try {
        res = await postToWebhook(data);
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 429) {
          throw new ErrorResponse(
            `Webhook hit rate limit, please try to keep it at 5 messages per 2 seconds (at most)`
          );
        }

        throw error;
      }
    } else {
      return { message: "I'm sorry, an invalid hook type was provided" };
    }

    if (editId != null && res != null) {
      if (editSetting == null) {
        editSetting = {
          id: null as any,
          player: logging.player,
          name: editId,
          identifier: res,
          created: getKolDay(),
          lastUse: getKolDay(),
          melting: true
        };

        await addUpdateEdit(editSetting);
      } else if (
        editSetting.lastUse != getKolDay() ||
        editSetting.melting ||
        editSetting.identifier != res
      ) {
        editSetting.lastUse = getKolDay();
        editSetting.identifier = res;

        if (editSetting.melting) {
          editSetting.identifier = res;
        }

        await addUpdateEdit(editSetting);
      }
    }

    return [];
  }

  async postToDiscord(
    logging: LoggingTarget,
    data: WebhookData
  ): Promise<string | null> {
    const user = await this.discord.discordHandler.client.users.fetch(
      logging.targetData
    );

    if (user == null) {
      return null;
    }

    const embed: APIEmbed = {};

    if (data.embedTitle) {
      embed.title = data.embedTitle;
    }

    if (data.message) {
      embed.description = data.message;
    }

    if (data.embedLines && data.embedLines.length > 0) {
      embed.fields = [];

      for (const line of data.embedLines) {
        embed.fields.push({ name: "\u200b", value: line, inline: true });
      }
    }

    const payload: BaseMessageOptions = {};

    if (Object.keys(embed).length > 0) {
      if (data.color != null) {
        embed.color = data.color;
      }

      if (data.image != null) {
        embed.thumbnail = { url: data.image };
      }

      payload.embeds = [embed];
    }

    if (data.contentMessage != null) {
      payload.content = data.contentMessage;
    }

    if (data.editMessage != null) {
      const message = await user.dmChannel?.messages.fetch(data.editMessage);

      if (message != null && message.editable) {
        const response = await message.edit(payload);

        if (response) {
          return response.id;
        }
      }
    }

    const response = await user.send(payload);

    if (!response) {
      return null;
    }

    return response.id;
  }

  colourNameToHex(colour: string): string {
    const colours = {
      aliceblue: "f0f8ff",
      antiquewhite: "faebd7",
      aqua: "00ffff",
      aquamarine: "7fffd4",
      azure: "f0ffff",
      beige: "f5f5dc",
      bisque: "ffe4c4",
      black: "000000",
      blanchedalmond: "ffebcd",
      blue: "0000ff",
      blueviolet: "8a2be2",
      brown: "a52a2a",
      burlywood: "deb887",
      cadetblue: "5f9ea0",
      chartreuse: "7fff00",
      chocolate: "d2691e",
      coral: "ff7f50",
      cornflowerblue: "6495ed",
      cornsilk: "fff8dc",
      crimson: "dc143c",
      cyan: "00ffff",
      darkblue: "00008b",
      darkcyan: "008b8b",
      darkgoldenrod: "b8860b",
      darkgray: "a9a9a9",
      darkgreen: "006400",
      darkkhaki: "bdb76b",
      darkmagenta: "8b008b",
      darkolivegreen: "556b2f",
      darkorange: "ff8c00",
      darkorchid: "9932cc",
      darkred: "8b0000",
      darksalmon: "e9967a",
      darkseagreen: "8fbc8f",
      darkslateblue: "483d8b",
      darkslategray: "2f4f4f",
      darkturquoise: "00ced1",
      darkviolet: "9400d3",
      deeppink: "ff1493",
      deepskyblue: "00bfff",
      dimgray: "696969",
      dodgerblue: "1e90ff",
      firebrick: "b22222",
      floralwhite: "fffaf0",
      forestgreen: "228b22",
      fuchsia: "ff00ff",
      gainsboro: "dcdcdc",
      ghostwhite: "f8f8ff",
      gold: "ffd700",
      goldenrod: "daa520",
      gray: "808080",
      green: "008000",
      greenyellow: "adff2f",
      honeydew: "f0fff0",
      hotpink: "ff69b4",
      indianred: "cd5c5c",
      indigo: "4b0082",
      ivory: "fffff0",
      khaki: "f0e68c",
      lavender: "e6e6fa",
      lavenderblush: "fff0f5",
      lawngreen: "7cfc00",
      lemonchiffon: "fffacd",
      lightblue: "add8e6",
      lightcoral: "f08080",
      lightcyan: "e0ffff",
      lightgoldenrodyellow: "fafad2",
      lightgrey: "d3d3d3",
      lightgreen: "90ee90",
      lightpink: "ffb6c1",
      lightsalmon: "ffa07a",
      lightseagreen: "20b2aa",
      lightskyblue: "87cefa",
      lightslategray: "778899",
      lightsteelblue: "b0c4de",
      lightyellow: "ffffe0",
      lime: "00ff00",
      limegreen: "32cd32",
      linen: "faf0e6",
      magenta: "ff00ff",
      maroon: "800000",
      mediumaquamarine: "66cdaa",
      mediumblue: "0000cd",
      mediumorchid: "ba55d3",
      mediumpurple: "9370d8",
      mediumseagreen: "3cb371",
      mediumslateblue: "7b68ee",
      mediumspringgreen: "00fa9a",
      mediumturquoise: "48d1cc",
      mediumvioletred: "c71585",
      midnightblue: "191970",
      mintcream: "f5fffa",
      mistyrose: "ffe4e1",
      moccasin: "ffe4b5",
      navajowhite: "ffdead",
      navy: "000080",
      oldlace: "fdf5e6",
      olive: "808000",
      olivedrab: "6b8e23",
      orange: "ffa500",
      orangered: "ff4500",
      orchid: "da70d6",
      palegoldenrod: "eee8aa",
      palegreen: "98fb98",
      paleturquoise: "afeeee",
      palevioletred: "d87093",
      papayawhip: "ffefd5",
      peachpuff: "ffdab9",
      peru: "cd853f",
      pink: "ffc0cb",
      plum: "dda0dd",
      powderblue: "b0e0e6",
      purple: "800080",
      rebeccapurple: "663399",
      red: "ff0000",
      rosybrown: "bc8f8f",
      royalblue: "4169e1",
      saddlebrown: "8b4513",
      salmon: "fa8072",
      sandybrown: "f4a460",
      seagreen: "2e8b57",
      seashell: "fff5ee",
      sienna: "a0522d",
      silver: "c0c0c0",
      skyblue: "87ceeb",
      slateblue: "6a5acd",
      slategray: "708090",
      snow: "fffafa",
      springgreen: "00ff7f",
      steelblue: "4682b4",
      tan: "d2b48c",
      teal: "008080",
      thistle: "d8bfd8",
      tomato: "ff6347",
      turquoise: "40e0d0",
      violet: "ee82ee",
      wheat: "f5deb3",
      white: "ffffff",
      whitesmoke: "f5f5f5",
      yellow: "ffff00",
      yellowgreen: "9acd32",
      darkgrey: "a9a9a9",
      darkslategrey: "2f4f4f",
      dimgrey: "696969",
      grey: "808080",
      lightgray: "d3d3d3",
      lightslategrey: "778899",
      slategrey: "708090"
    };

    return (colours as any)[colour.toLowerCase()];
  }
}
