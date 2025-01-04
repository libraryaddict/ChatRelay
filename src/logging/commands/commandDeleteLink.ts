import { getLogging, removeLogging } from "../DiscordLoggingDatabase";
import { CommandInterface, CommandResponse } from "./iCommand";

export class CommandDeleteHook implements CommandInterface {
  getHelp(shortForm: boolean): string {
    return "Delete a logging link, must provide 'default' or a specific link name. Eg, 'delete discord_error_channel'";
  }

  isCommand(message: string): boolean {
    return message.match(/^delete( |$)/i) != null;
  }

  async runCommand(
    senderId: string,
    command: string
  ): Promise<CommandResponse | CommandResponse[]> {
    const match = command.match(/^delete (.+)$/i);

    if (match == null) {
      return {
        message: `Invalid command syntax provided. Did you forget the link name?`,
      };
    }

    const active = await getLogging(parseInt(senderId));
    const matches = active.filter(
      (t) => t.identifier?.toLowerCase() == match[1].toLowerCase()
    );

    if (matches.length == 0) {
      return {
        message: `No link for that identifier was found. You have ${active.length} links active.`,
      };
    }

    for (const m of matches) {
      await removeLogging(m.id);
    }

    return {
      message: `Success! Deleted ${
        matches.length == 1 ? "" : matches.length + " "
      }link${matches.length > 1 ? "s" : ""}`,
    };
  }
}
