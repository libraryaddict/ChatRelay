import { Mutex } from "async-mutex";
import { ChannelId, ChatChannel, ChatMessage, KOLMessage } from "./Typings";
import axios from "axios";
import { KolProcessor } from "./KoLProcessor";
import { ChatManager } from "../ChatManager";

axios.defaults.timeout = 30000;

export class RemoteKolClient extends KolProcessor implements ChatChannel {
  private messages: KOLMessage[] = [];
  private lastMid: string | null = null;

  /**
   * @param baseUrl The root URL of the remote chat service
   */
  constructor(
    private readonly chatManager: ChatManager,
    private readonly channelIds: ChannelId[],
    private readonly baseUrl: string
  ) {
    super();
  }

  async processExtra(message: KOLMessage): Promise<void> {}

  shouldSkip(message: KOLMessage): boolean {
    return false;
  }

  async lookupName(id: string): Promise<string | undefined> {
    return null;
  }

  getChatManager(): ChatManager {
    return this.chatManager;
  }

  async processMessage(): Promise<void> {
    const message = this.messages.shift();

    if (!message) {
      setTimeout(() => this.processMessage(), 1000);

      return;
    }

    await this.processKolMessage(message);
  }

  getChatChannels(): ChannelId[] {
    return this.channelIds;
  }

  /**
   * Constructs the full request url
   */
  private getRemoteUrl(): string {
    const url = new URL(`${this.baseUrl}/messages`);

    // Use the last known message ID. If it's the first run, this won't be appended.
    if (this.lastMid) {
      url.searchParams.append("mid", this.lastMid);
    }

    url.searchParams.append(
      "channel",
      this.getChatChannels()
        .map((s) => s.holderId)
        .filter((s) => s)
        .join(",")
    );

    return url.toString();
  }

  private async fetchNewMessages(): Promise<KOLMessage[]> {
    const url = this.getRemoteUrl();
    const response = await axios(url, {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    });

    if (response.status != 200) {
      return [];
    }

    const data = response.data;

    if (!data || !Array.isArray(data.msgs)) {
      return [];
    }

    if (data.last) {
      this.lastMid = data.last;
    }

    return data.msgs;
  }

  isOwner(channelId: ChannelId): boolean {
    return channelId.side == "Remote";
  }

  async sendMessageToChannel(
    target: ChannelId,
    message: ChatMessage
  ): Promise<void> {}

  async start(): Promise<void> {
    console.log(`Creating remote kol client for ${this.baseUrl}`);
    const mutex = new Mutex();
    // Updates the mid
    await this.fetchNewMessages();

    setInterval(() => {
      if (mutex.isLocked()) {
        return;
      }

      mutex.runExclusive(async () => {
        try {
          const newMessages = await this.fetchNewMessages();

          if (newMessages.length > 0) {
            this.messages.push(...newMessages);
          }
        } catch (e) {
          console.error(
            `Errored on ${this.getRemoteUrl()} while fetching messages:`,
            e
          );
        }
      });
    }, 3000);

    this.processMessage();
  }
}
