import { getLogging } from "../DiscordLoggingDatabase";
import { DiscordLoggingHandler } from "../DiscordLoggingHandler";
import { CommandInterface, CommandResponse } from "./iCommand";

export class CommandList implements CommandInterface {
  constructor(private handler: DiscordLoggingHandler) {}

  getHelp(shortForm: boolean): string {
    return "Lists loggers you have active";
  }

  isCommand(message: string): boolean {
    return message.match(/^list( |$)/i) != null;
  }

  async runCommand(
    senderId: string,
    command: string
  ): Promise<CommandResponse | CommandResponse[]> {
    const targets = await getLogging(parseInt(senderId));

    if (targets.length == 0) {
      return { message: "You do not have any links active" };
    }

    const response: string[] = [];

    for (const logger of targets) {
      response.push(
        `Link: ${logger.identifier}, connected via '${
          logger.target
        }' with data '${logger.targetData}'${
          logger.displayname != null
            ? ` and displayname '${logger.displayname}'`
            : ""
        }${logger.avatar != null ? ` and avatar '${logger.avatar}'` : ""}`
      );
    }

    return {
      message: response.join("\n"),
      enforceKmail: response.length > 1,
    };
  }
}
