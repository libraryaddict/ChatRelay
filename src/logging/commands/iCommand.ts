import { MessageSource } from "../DiscordLoggingHandler";

export interface CommandInterface {
  /**
   * Get the help for this command
   * @param shortForm If we should give a very short description
   */
  getHelp(shortForm: boolean): string | string[];

  isCommand(message: string): boolean;

  runCommand(
    senderId: string,
    command: string,
    source?: MessageSource
  ): Promise<CommandResponse | CommandResponse[]>;
}

export interface CommandResponse {
  message: string;
  enforceKmail?: boolean; // If this must be sent via kmail
}
