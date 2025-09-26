import { LoggingTarget } from "@prisma/client";
import { addUpdateLogging, getLogging } from "../DiscordLoggingDatabase";
import { CommandInterface, CommandResponse } from "./iCommand";
import { cleanupKolMessage, getKolDay } from "../../utils/Utils";
import { DiscordLoggingHandler } from "../DiscordLoggingHandler";

export class CommandAddHook implements CommandInterface {
  constructor(private loggingHandler: DiscordLoggingHandler) {}

  getHelp(shortForm: boolean): string {
    return `Use 'add <name (optional)> <'webhook' or 'dm'> <webhook if selected> to add a logging link. Eg, 'add webhook www.discordwebhook.com' or 'add msg_via_discord dm'`;
  }

  isCommand(message: string): boolean {
    return message.match(/^add( |$)/i) != null;
  }

  async runCommand(
    senderId: string,
    command: string
  ): Promise<CommandResponse | CommandResponse[]> {
    const match = cleanupKolMessage(command, "normal").match(
      /add (?:(.{1,32}) )?(webhook|dm)(?: (.+))?$/i
    );

    if (match == null) {
      return { message: "Invalid syntax, was an invalid link type provided?" };
    }

    const identifier = match[1] ?? "default";
    const hookType = match[2].toLowerCase();
    const hookData = match[3];

    if (hookType == "dm") {
      if (hookData != null && hookData.length > 0) {
        return {
          message:
            "Invalid syntax, expected no data for link type to be provided."
        };
      }
    } else if (hookType == "webhook") {
      // (Invalid) hook example below
      // https://discord.com/api/webhooks/64364733745/uasdfhftjd6ujghjxfbKWk-6YJQZDSF3gdfehe5H4mHAoVEA_u1dHdfgk
      if (
        hookData.match(
          /^https:\/\/discord.com\/api\/webhooks\/\d+\/[\da-zA-Z_-]+$/
        ) == null
      ) {
        return {
          message:
            "Illegal webhook received, expected a webhook from discord starting with https://discord.com/api/webhooks/ but instead got " +
            hookData +
            " - This could be a failure in the bot, may be worth reporting"
        };
      }
    } else {
      return {
        message: `Unknown link type "${hookType}"`
      };
    }

    if (identifier.match(/[^a-zA-Z\d_\-:]/) != null) {
      return {
        message:
          "Invalid characters in link name, please use only basic symbols for regex [a-zA-Z0-9_-:]"
      };
    }

    //  Handle discord adding by telling them to send a unique code to DiscordChat bot within the next 10 minutes.
    // This way we can both identify who the discord is, and avoid bot contacting them first

    const existing = (await getLogging(parseInt(senderId))).find(
      (l) => l.identifier.toLowerCase() == identifier.toLowerCase()
    );

    if (existing != null) {
      return {
        message: `Error! The identifier "${identifier}" is already in use by type of '${existing.target}' with target '${existing.targetData}'! Delete the existing link or edit it!`
      };
    }

    const logging: LoggingTarget = {
      id: null as any,
      player: parseInt(senderId),
      identifier: identifier,
      target: hookType,
      targetData: hookData,
      created: getKolDay(),
      lastUse: 0,
      uses: 0,
      displayname: null,
      avatar: null
    };

    if (hookType == "dm") {
      const code = this.generateCode(8);

      this.loggingHandler.addAuth(code, logging);

      return {
        message: `Success! Just send the code '${code}' to the discord bot and the link will be set up. Expires in 15min`
      };
    }

    await addUpdateLogging(logging);

    return { message: "Success! New logging link created!" };
  }

  generateCode(length: number) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";

    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return result;
  }
}
