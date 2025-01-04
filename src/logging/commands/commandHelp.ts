import { DiscordLoggingHandler, MessageSource } from "../DiscordLoggingHandler";
import { CommandInterface, CommandResponse } from "./iCommand";

export class CommandHelp implements CommandInterface {
  constructor(private handler: DiscordLoggingHandler) {}

  getHelp(shortForm: boolean): string | string[] {
    return null;
  }

  isCommand(message: string): boolean {
    return message.match(/^help( |$)/i) != null;
  }

  async runCommand(
    senderId: string,
    command: string,
    source: MessageSource
  ): Promise<CommandResponse | CommandResponse[]> {
    const lines: CommandResponse[] = [];

    for (const command of this.handler.commands) {
      const cHelp = command.getHelp(source == "whisper");

      if (cHelp == null) {
        continue;
      }

      if (typeof cHelp == "string") {
        lines.push({ message: cHelp });
      } else {
        cHelp.forEach((s) => lines.push({ message: s }));
      }
    }

    lines.push({
      message:
        "Read more about this at https://github.com/libraryaddict/DiscordChat",
    });

    return lines;
  }
}
