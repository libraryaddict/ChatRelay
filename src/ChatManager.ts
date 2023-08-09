import { DiscordHandler } from "./DiscordHandler";
import { Settings } from "./Settings";
import { KoLClient } from "./utils/KoLClient";
import { ChannelId, ChatChannel, ChatMessage } from "./utils/Typings";

export class ChatManager {
  channels: ChatChannel[] = [];
  channelIds: ChannelId[];
  ignoredChatRelays: string[];
  responses: Map<string, string[]>;

  startChannels() {
    const sets = new Settings();
    const settings = sets.getAccountLogins();
    this.channelIds = sets.getChannelIds();
    this.ignoredChatRelays = (settings.ignoreChat ?? []).map((s) => s.toLowerCase());
    this.responses = sets.getResponses();

    if (settings.discordToken) {
      this.channels.push(new DiscordHandler(this, settings.discordToken));
    }

    const accounts: Map<string, ChannelId[]> = new Map();

    for (const channel of this.channelIds) {
      if (!accounts.has(channel.owningAccount)) {
        accounts.set(channel.owningAccount, []);
      }

      accounts.get(channel.owningAccount)?.push(channel);
    }

    for (const kolAccount of settings.kolLogins) {
      const channels = accounts.get(kolAccount.username);

      if (channels == null) {
        console.log(`Can't login to ${kolAccount.username}, no channels using it`);
        continue;
      }

      if (kolAccount.type == "IGNORE") {
        console.log(`Am ignoring the account ${kolAccount.username}`);
        continue;
      }

      accounts.delete(kolAccount.username);

      this.channels.push(
        new KoLClient(this, channels, kolAccount.username, kolAccount.password, kolAccount.type)
      );
    }

    for (const name of accounts.keys()) {
      console.log("No kol account found for " + name);
    }

    this.channels.forEach((c) => {
      const run = async () => {
        c.start();
      };

      run();
    });
  }

  getResponse(msg: string, name: string): string | undefined {
    for (const [message, responses] of this.responses) {
      if (!msg.toLowerCase().includes(message.toLowerCase())) {
        continue;
      }

      let response = responses[Math.floor(Math.random() * responses.length)];

      response = response.replaceAll("{name}", name);

      return response;
    }

    return undefined;
  }

  getChannelId(holderId: string, channelId?: string): ChannelId {
    return this.channelIds.find((id) => {
      return id.holderId == holderId && id.channelId == channelId;
    }) as ChannelId;
  }

  async sendToChannel(channel: ChannelId, message: ChatMessage) {
    const chatChannel = this.channels.find((c) => c.isOwner(channel));

    if (chatChannel == null) {
      console.log("Can't find a channel for " + channel.uniqueIdentifier);
      return;
    }

    try {
      await chatChannel.sendMessageToChannel(channel, message);
    } catch (e) {
      console.log(
        "Error occured when trying to send message to '" + channel.uniqueIdentifier + "': " + e
      );
    }
  }

  async onChat(message: ChatMessage, doResponses: boolean = true) {
    const sendToChannels: ChannelId[] = this.channelIds.filter((c) =>
      this.isListeningTo(c, message.from)
    );

    const promises = [];

    for (const channel of sendToChannels) {
      promises.push(this.sendToChannel(channel, message));
    }

    if (doResponses && message.from.flags.includes("responses")) {
      const response = this.getResponse(message.message, message.sender);

      if (response != null) {
        const newMessage: ChatMessage = {
          from: message.from,
          message: response,
          sender: message.from.owningAccount,
          formatting: "normal",
          encoding: "utf8",
        };

        Promise.allSettled(promises).then(() => {
          // Send to the sending channel
          this.sendToChannel(message.from, newMessage);
          // Send to everyone listening to this drama
          this.onChat(newMessage, false);
        });
      }
    }
  }

  isListeningTo(receiverId: ChannelId, senderId: ChannelId): boolean {
    if (receiverId == senderId) return false;

    return receiverId.listensTo.includes(senderId);
  }
}
