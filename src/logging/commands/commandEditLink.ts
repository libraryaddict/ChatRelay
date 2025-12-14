import { LoggingTarget } from "@prisma/client";
import {
  addUpdateLogging,
  getLogging,
  renameEdits
} from "../DiscordLoggingDatabase";
import { CommandInterface, CommandResponse } from "./iCommand";

export class CommandEditHook implements CommandInterface {
  getHelp(shortForm: boolean): string | string[] {
    return [
      `Call this to edit an existing link, eg to rename: 'edit game_channel name games_channel'`,
      `Only the name can be changed for dm type links, with webhooks you can also change 'target' (new webhook url), 'displayname' (user name to show for webhook) and 'avatar' (user pic to use)`,
      `Example: 'edit daily_run_channel displayname Daily Run Outcome'`
    ];
  }

  isCommand(message: string): boolean {
    return message.match(/^edit( |$)/i) != null;
  }

  async runCommand(
    senderId: string,
    command: string
  ): Promise<CommandResponse | CommandResponse[]> {
    const match = command.match(/^edit ([^ ]+)(?: ([^ ]+)(?: (.+)?)?)?$/i);

    if (match == null) {
      return {
        message: "Unknown usage of the edit command"
      };
    }

    const logger = (await getLogging(parseInt(senderId))).find(
      (l) => l.identifier == match[1]
    );

    if (logger == null) {
      return {
        message: `Unknown link '${match[1]}'`
      };
    }

    if (match[2].toLowerCase() == "name") {
      return await this.handleName(logger, match[3]);
    } else if (match[2].toLowerCase() == "displayname") {
      return await this.handleDisplayname(logger, match[3]);
    } else if (match[2].toLowerCase() == "avatar") {
      return await this.handleAvatar(logger, match[3] ?? "");
    } else if (match[2].toLowerCase() == "target") {
      return await this.handleTarget(logger, match[3] ?? "");
    } else {
      return {
        message: "Unknown setting '" + match[2] + "'"
      };
    }
  }

  async handleName(
    logger: LoggingTarget,
    newValue: string
  ): Promise<CommandResponse> {
    if (newValue == null || newValue.length == 0) {
      return {
        message:
          "A new name must be provided, 'default' can also be used to set as default link"
      };
    }

    if (newValue.match(/[^a-zA-Z\d_\-:]/) != null) {
      return {
        message:
          "Invalid characters in link name, please use only basic symbols for regex [a-zA-Z0-9_-:]"
      };
    }

    if (
      (await getLogging(logger.player)).some(
        (l) => l.identifier.toLowerCase() == newValue.toLowerCase()
      )
    ) {
      return {
        message:
          "Error! The new link name would conflict with an existing link by the same name"
      };
    }

    const oldName = logger.identifier;

    logger.identifier = newValue;

    await addUpdateLogging(logger);
    await renameEdits(logger.player, oldName, logger.identifier);

    return {
      message: `Success! Link ${oldName} has been updated to new name '${logger.identifier}'`
    };
  }

  async handleTarget(
    logger: LoggingTarget,
    newValue: string
  ): Promise<CommandResponse> {
    if (logger.target != "webhook") {
      return { message: "Target can only be changed on a webhook link" };
    }

    // (Invalid) hook example below
    // https://discord.com/api/webhooks/64364733745/uasdfhftjd6ujghjxfbKWk-6YJQZDSF3gdfehe5H4mHAoVEA_u1dHdfgk
    if (
      newValue == null ||
      newValue.match(
        /^https:\/\/discord.com\/api\/webhooks\/\d+\/[\da-zA-Z_-]+$/
      ) == null
    ) {
      return {
        message:
          "Illegal webhook received, expected a webhook from discord starting with https://discord.com/api/webhooks/ but instead got " +
          newValue +
          " - This could be a failure in the bot, may be worth reporting"
      };
    }

    logger.targetData = newValue;
    await addUpdateLogging(logger);

    return {
      message:
        "Success! The webhook for '" +
        logger.identifier +
        "' has successfully changed."
    };
  }

  async handleDisplayname(
    logger: LoggingTarget,
    newValue: string
  ): Promise<CommandResponse> {
    if (logger.target != "webhook") {
      return { message: "Displayname can only be changed on a webhook link" };
    }

    if (newValue == null || newValue.trim().length == 0) {
      newValue = null;
    }

    logger.displayname = newValue;
    await addUpdateLogging(logger);

    return {
      message: `Success! The displayname on ${logger.identifier} has been ${
        newValue == null ? "removed" : "updated to '" + newValue + "'"
      }`
    };
  }

  async handleAvatar(
    logger: LoggingTarget,
    newValue: string
  ): Promise<CommandResponse> {
    if (logger.target != "webhook") {
      return { message: "Avatar can only be changed on a webhook link" };
    }

    if (newValue == null || newValue.trim().length == 0) {
      newValue = null;
    } else {
      newValue = newValue.trim();

      if (
        newValue.match(
          /^(https?:\/\/)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(:\d+)?(\/.*)?$/
        ) == null
      ) {
        return {
          message: "Image link failed url validation! Url: " + newValue
        };
      }
    }

    logger.avatar = newValue;
    await addUpdateLogging(logger);

    return {
      message: `Success! The avatar on ${logger.identifier} has been ${
        newValue == null ? "removed" : "updated to '" + newValue + "'"
      }`
    };
  }
}
