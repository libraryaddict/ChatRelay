import {
  ApplicationCommandOptionData,
  ApplicationCommandOptionType,
  ChatInputApplicationCommandData,
  Client,
  CommandInteraction,
} from "discord.js";
import { DiscordHandler } from "../DiscordHandler";

export interface Command extends ChatInputApplicationCommandData {
  /**
   * The subcommand action name
   */
  action(): string;

  run: (client: Client, interaction: CommandInteraction) => void;
}

export class ChatCommand {
  //implements Command {
  name = "chat";
  description = "Links KoL chat with Discord";
  options: ApplicationCommandOptionData[] = [
    {
      name: "action",
      type: ApplicationCommandOptionType.String,
      description: "Add or Remove a KoL channel",
      required: true,
      choices: [
        {
          name: "Add",
          value: "add",
        },
        {
          name: "Remove",
          value: "remove",
        },
      ],
    },
    {
      name: "channel",
      type: ApplicationCommandOptionType.String,
      description: "The kol channel to handle",
      required: true,
    },
  ];

  discordHandler: DiscordHandler;

  constructor(discord: DiscordHandler) {
    this.discordHandler = discord;

    // TODO Add choices for channels?
  }

  run(client: Client, interaction: CommandInteraction) {
    if (!interaction.isChatInputCommand()) {
      interaction.followUp({ content: "An error has occured, not a chat input command." });
      return;
    }

    const action = interaction.options.getString("action");

    if (action != "add" && action != "remove") {
      interaction.followUp({ content: "An error has occured, not a valid action" });
      return;
    }

    const channel = interaction.options.getString("channel");
  }
}
