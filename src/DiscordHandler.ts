import {
  APIEmbed,
  Client,
  Message,
  OmitPartialGroupDMChannel,
  Partials,
  WebhookClient
} from "discord.js";
import { ChannelId, ChatChannel, ChatMessage } from "./utils/Typings";
import { ChatManager } from "./ChatManager";
import { unemojify } from "node-emoji";
import { Mutex } from "async-mutex";
import { basicSanitization } from "./utils/Utils";

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

      let rawMessage =
        message.discordMessage || basicSanitization(message.plaintextMessage);

      // Remove any special characteristics from the sender
      const sender = basicSanitization(message.sender);
      let senderName = sender;

      if (
        !senderName.startsWith("[") &&
        !senderName.endsWith("]") &&
        message.formatting != "mod announcement" &&
        message.formatting != "mod warning"
      ) {
        senderName = `[${sender}]`;
      }

      let msg = `**${senderName}** ${rawMessage}`;
      const embeds: APIEmbed[] = [];

      if (message.formatting == "emote") {
        // I believe this should always be true, but we check regardless
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
        if (withEmbeds) {
          embeds.push({
            title: "Mod Announcement by " + senderName,
            color: 0x2ca816,
            description: rawMessage
          });
          msg = ``;
        } else {
          msg = `:warning: ${msg}`;
        }
      } else if (message.formatting == "mod warning") {
        if (withEmbeds) {
          embeds.push({
            title: "Mod Warning by " + senderName,
            color: 0xff0008,
            description: rawMessage
          });
          msg = ``;
        } else {
          msg = `:no_entry_sign: ${msg}`;
        }
      } else if (message.formatting == "system") {
        if (withEmbeds) {
          embeds.push({
            title: "System",
            color: 0xff0008,
            description: rawMessage
          });
          msg = ``;
        } else {
          msg = `:loudspeaker: ${msg}`;
        }
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
          withEmbeds &&
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
        ["’", "'"],
        // eslint-disable-next-line no-irregular-whitespace
        ["@", "@\u200b"] // Zero width space (​), prevents @everyone from working.
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
        plaintextMessage: msg,
        formatting: format,
        encoding: "utf-8"
      });
    });
  }
}
