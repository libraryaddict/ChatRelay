import {
  APIEmbed,
  Client,
  Message,
  OmitPartialGroupDMChannel,
  Partials,
  WebhookClient
} from "discord.js";
import {
  ChannelId,
  ChatChannel,
  ChatMessage,
  PublicMessageType
} from "./utils/Typings";
import { ChatManager } from "./ChatManager";
import { unemojify } from "node-emoji";
import { Mutex } from "async-mutex";
import { formatMessage } from "./utils/Utils";

export class DiscordHandler implements ChatChannel {
  client: Client;
  chatManager: ChatManager;
  token: string;
  mutex: Mutex = new Mutex();
  noEmbeds: string[] = [];
  directMessageHandler: (
    message: OmitPartialGroupDMChannel<Message<boolean>>
  ) => void;

  constructor(chatManager: ChatManager, token: string) {
    this.token = token;
    this.chatManager = chatManager;
  }

  isOwner(channelId: ChannelId): boolean {
    return channelId.side == "Discord";
  }

  async sendMessageToChannel(
    target: ChannelId,
    message: ChatMessage,
    withEmbeds: boolean = true
  ) {
    // If this is exclusive, and it is not for discord
    if (message.exclusiveTo && message.exclusiveTo != "Discord") {
      return;
    }

    // A bit ugly eh
    if (
      (target.webhook != null && this.noEmbeds.includes(target.webhook)) ||
      (target.channelId != null && this.noEmbeds.includes(target.channelId))
    ) {
      withEmbeds = false;
    }

    await this.mutex.runExclusive(async () => {
      if (this.client == null || !this.client.isReady()) {
        console.log(
          `Unable to send message to discord, discord ain't available (
            ${
              this.client == null ? "null client" : "client says it isn't ready"
            }) - Try resetting bot token?`
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

      let msg = ``;
      const embeds: APIEmbed[] = [];

      const formatted = message.message;

      if (withEmbeds && (formatted.embedTitle || formatted.embedDescription)) {
        embeds.push({
          title: formatted.embedTitle,
          color: formatted.embedColor,
          description: formatted.embedDescription
        });
      } else {
        msg = formatted.discordMessage;
      }

      try {
        if (target.webhook != null) {
          const webhook = new WebhookClient({ url: target.webhook });

          await webhook.send({
            username: message.from.name,
            avatarURL: message.from.icon,
            content: msg,
            embeds: embeds,
            options: {
              allowedMentions: {}
            },
            allowedMentions: {}
          });
        } else if (channel.isSendable()) {
          await channel.send({
            content: msg,
            embeds: embeds,
            options: {
              allowedMentions: {}
            },
            allowedMentions: {}
          });
        } else {
          console.log(
            "Cannot send to " + channel + ", isSendable() reported false"
          );
        }
      } catch (e) {
        if (
          embeds.length > 0 &&
          e != null &&
          e.toString().includes("Missing Permissions")
        ) {
          if (target.webhook != null) {
            this.noEmbeds.push(target.webhook);
          } else if (target.channelId != null) {
            this.noEmbeds.push(target.channelId);
          }

          this.sendMessageToChannel(target, message, false);

          return;
        }

        throw e;
      }
    });
  }

  async start(): Promise<void> {
    console.log("Starting discord client..");

    this.client = new Client({
      intents: [
        "Guilds",
        "GuildMessages",
        "GuildMessageTyping",
        "GuildMembers",
        "GuildModeration",
        "MessageContent",
        "GuildWebhooks",
        "DirectMessages"
      ],
      partials: [Partials.Channel, Partials.Message]
    });

    this.client.on("ready", () => {
      console.log("Discord client logged in!");
    });
    this.client.on("warn", (msg) => console.log("Discord/WARN: " + msg));
    this.client.on("error", (msg) => console.log("Discord/ERROR: " + msg));

    console.log("Discord Client now logging in..");
    await this.client.login(this.token);

    //  this.client.application?.commands.create();

    this.client.on("messageCreate", (message) => {
      // If is a bot
      if (message.author.bot) {
        return;
      }

      let msg = message.cleanContent;

      if (msg.length <= 0) {
        return;
      }

      // If not in guild
      if (message.member == null || !message.inGuild()) {
        if (message.channel.isDMBased() && this.directMessageHandler != null) {
          this.directMessageHandler(message);
        }

        return;
      }

      const channelId = this.chatManager.getChannelId(
        message.guildId,
        message.channelId
      );

      if (channelId == null) {
        return;
      }

      const format: PublicMessageType = msg.match(/^[_*].*[_*]$/)
        ? "emote"
        : "normal";

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
      const sender = message.member.nickname ?? message.member.displayName;

      this.chatManager.onChat({
        from: channelId,
        sender: sender,
        message: formatMessage(sender, msg, format, true, "Discord")
      });
    });
  }
}
