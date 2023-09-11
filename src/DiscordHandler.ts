import { Client, TextBasedChannel, WebhookClient } from "discord.js";
import { Command } from "./discord/DiscordCommand";
import { ChannelId, ChatChannel, ChatMessage } from "./utils/Typings";
import { ChatManager } from "./ChatManager";
import { unemojify } from "node-emoji";
import { Mutex } from "async-mutex";

export class DiscordHandler implements ChatChannel {
  client: Client;
  commands: Command[];
  chatManager: ChatManager;
  token: string;
  mutex: Mutex = new Mutex();

  constructor(chatManager: ChatManager, token: string) {
    this.token = token;
    this.chatManager = chatManager;
  }

  isOwner(channelId: ChannelId): boolean {
    return channelId.side == "Discord";
  }

  async sendMessageToChannel(target: ChannelId, message: ChatMessage) {
    await this.mutex.runExclusive(async () => {
      if (this.client == null || !this.client.isReady()) {
        console.log(
          "Unable to send message to discord, discord ain't available"
        );

        return;
      }

      const guild = await this.client.guilds.fetch(target.holderId);

      if (guild == null) {
        console.log("Can't find guild");

        return;
      }

      const channel = await guild.channels.fetch(target.channelId as string);

      if (channel == null) {
        console.log("Can't find channel");

        return;
      }

      let rawMessage = message.message;
      rawMessage = rawMessage.replaceAll(
        /(?<!(?: |^)http[^ ]*)([*_~])/gi,
        "\\$1"
      );

      const sender = message.sender;
      let senderName = sender;

      if (!senderName.startsWith("[") && !senderName.endsWith("]")) {
        senderName = `[${sender}]`;
      }

      let msg = `**${senderName}** ${rawMessage}`;

      if (message.formatting == "emote") {
        if (
          rawMessage
            .trim()
            .toLowerCase()
            .startsWith(sender.toLowerCase() + " ")
        ) {
          rawMessage = rawMessage.trim().substring(sender.length + 1);
        }

        msg = `**${senderName}** ${rawMessage}`;
        msg = `*${msg}*`;
      } else if (message.formatting == "mod announcement") {
        msg = `:warning: ${msg}`;
      } else if (message.formatting == "mod warning") {
        msg = `:no_entry_sign: ${msg}`;
      } else if (message.formatting == "system") {
        msg = `:loudspeaker: ${msg}`;
      }

      if (target.webhook != null) {
        const webhook = new WebhookClient({ url: target.webhook });

        await webhook.send({
          username: message.from.name,
          avatarURL: message.from.icon,
          content: msg,
          options: {
            flags: ["SuppressEmbeds", "SuppressNotifications"],
            allowedMentions: {}
          }
        });
      } else {
        await (channel as TextBasedChannel).send({
          content: msg,
          options: {
            flags: ["SuppressEmbeds", "SuppressNotifications"],
            allowedMentions: {}
          }
        });
      }
    });
  }

  start() {
    console.log("Starting discord client..");

    this.client = new Client({
      intents: [
        "Guilds",
        "GuildMessages",
        "GuildMessageTyping",
        "GuildMembers",
        "GuildModeration",
        "MessageContent",
        "GuildWebhooks"
      ]
    });

    this.client.login(this.token);

    this.client.on("ready", () => {
      console.log("Client logged in!");
    });

    //  this.client.application?.commands.create();

    this.client.on("messageCreate", (message) => {
      // If not in guild, or is a bot
      if (message.member == null || !message.inGuild() || message.author.bot) {
        return;
      }

      let msg = message.cleanContent;

      if (msg.length <= 0) {
        return;
      }

      const channelId = this.chatManager.getChannelId(
        message.guildId,
        message.channelId
      );

      if (channelId == null) {
        return;
      }

      const format = msg.match(/^[_*].*[_*]$/) ? "emote" : "normal";

      if (format == "emote") {
        msg = msg.substring(1, msg.length - 1);
      }

      if (msg.length <= 0) {
        return;
      }

      for (const [p1, p2] of [
        ["“", '"'],
        ["”", '"'],
        ["‘", "'"],
        ["’", "'"]
      ]) {
        msg = msg.replaceAll(p1, p2);
      }

      // Convert emojis to their text equiv
      msg = unemojify(msg);
      // Convert discord's custom emoji to a simple :emoji:
      msg = msg.replaceAll(/<(:[a-zA-Z_]+:)\d+>/g, "$1");
      // Convert all double spaces to single spaces
      msg = msg.replaceAll(/ {2,}/g, " ");

      this.chatManager.onChat({
        from: channelId,
        sender: message.member.nickname ?? message.member.displayName,
        message: msg,
        formatting: format,
        encoding: "utf-8"
      });
    });
  }
}
