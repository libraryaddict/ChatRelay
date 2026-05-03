import axios, { AxiosInstance, Method } from "axios";
import {
  KoLUser,
  KOLMessage,
  ChatChannel,
  ChannelId,
  ChatMessage,
  KolAccountType,
  KolEffect,
  KolKmail,
  KoLStatus,
} from "./Typings";
import {
  encodeToKolEncoding,
  formatMessage,
  getBadKolEffects,
  getSecondsElapsedInDay,
  getSecondsToRollover,
  humanReadableTime,
  isReplaceableUpdateMessage,
  isUpdateMessage,
  splitMessage,
  stripHtml,
  stripInvisibleCharacters,
} from "./Utils";
import { ChatManager } from "../ChatManager";
import { Mutex } from "async-mutex";
import { KolProcessor } from "./KoLProcessor";
import { createClient } from "./network";

const FOR_WHO = `DiscordChat (Maintained by irrat)`;

export class KoLClient extends KolProcessor implements ChatChannel {
  private channels: ChannelId[];
  private _loginParameters;
  private _lastFetchedMessages: string = "0";
  private _player?: KoLUser;
  private static privateChannels: string[] = [
    "clan",
    "hobopolis",
    "dread",
    "slimetube",
  ];

  private messages: KOLMessage[] = [];
  private chatManager: ChatManager;
  private accountType: KolAccountType;
  private mutex = new Mutex();
  private lastAntidoteBeg = 0;
  private nextStatusCheck = 0;
  private fortuneTeller: "UNTESTED" | "EXISTS" | "DOESNT EXIST" = "UNTESTED";
  private newlyStarted = true;
  private axios: AxiosInstance;
  private pwd: string;
  private failedLogins = 0;

  externalMessageProcessor: (messages: KOLMessage[]) => void = () => {};

  constructor(
    chatManager: ChatManager,
    channelIds: ChannelId[],
    username: string,
    password: string,
    type: KolAccountType,
  ) {
    super();

    this.channels = channelIds;
    this.chatManager = chatManager;
    this.accountType = type;
    this._player = { name: username, id: "" };

    this._loginParameters = new URLSearchParams();
    this._loginParameters.append("loggingin", "Yup.");
    this._loginParameters.append("loginname", username);
    this._loginParameters.append("password", password);
    this._loginParameters.append("secure", "0");
    this._loginParameters.append("submitbutton", "Log In");
    this.axios = createClient("https://www.kingdomofloathing.com/");
  }

  getChatManager(): ChatManager {
    return this.chatManager;
  }

  async doStatusCheck() {
    try {
      if (this.nextStatusCheck > Date.now()) {
        return;
      }

      // Every hour
      this.nextStatusCheck = Date.now() + 1000 * 60 * 60;

      await this.removeBadEffects();
      await this.checkFortuneTeller();
    } catch (e) {
      console.error(
        `Status check error on ${this.getUsername()}:` + this.getUsername(),
      );
    }
  }

  isOwner(channelId: ChannelId): boolean {
    return this.channels.includes(channelId);
  }

  async sendMessageToChannel(
    target: ChannelId,
    message: ChatMessage,
  ): Promise<void> {
    // If this is exclusive, and it is not for kol, this is a dumb hack for `sendBotMessage`
    if (message.exclusiveTo && message.exclusiveTo != "KoL") {
      return;
    }

    if (!KoLClient.privateChannels.includes(target.holderId)) {
      console.log(
        "Tried to send a message to '" +
          target.holderId +
          "', but that's not private?",
      );

      return;
    }

    await this.sendMessage(
      target.holderId as string,
      message.message.kolPrefix,
      message.message.kolMessage,
    );
  }

  getUsername() {
    return this._player?.name;
  }

  getUserID() {
    return this._player?.id;
  }

  async getChannelsListening(): Promise<string[]> {
    // <font color=green><a target=mainpane href="showplayer.php?who=3469406"><b style="color: green;">Irrat (#3469406)</b></a>, the Level 14 Whale Boxer<br>This player is currently online in channel <b>trade</b> and listening to <b>challenge, clan, dread, foodcourt, games, hardcore and talkie</b>.</font><br>

    const res = (await this.visitUrl(`mchat.php`)) as string;

    //console.log("`" + response + "`");

    const channels: string[] = [];

    for (const match of res.matchAll(/, channel: '(.+?)', msg: /g)) {
      channels.push(match[1]);
    }

    return channels;
  }

  getChatChannels(): ChannelId[] {
    return this.channels;
  }

  async getChannels(): Promise<string[]> {
    const response = (
      await this.visitUrl("submitnewchat.php", {
        graf: `/clan /channels`,
        j: 1,
      })
    )["output"] as string;

    const channels: string[] = [];

    for (const match of response.matchAll(/<br>&nbsp;&nbsp;([a-z]+)/g)) {
      channels.push(match[1]);
    }

    return channels;
  }

  async getStatus(): Promise<KoLStatus> {
    const apiResponse = await this.visitUrl("api.php", {
      what: "status",
      for: FOR_WHO,
    });

    if (!apiResponse || !apiResponse["equipment"]) {
      throw "Error fetching api:" + apiResponse;
    }

    const effects: KolEffect[] = [];

    if (apiResponse["effects"]) {
      for (const apiEffect of Object.values(
        apiResponse["effects"],
      ) as string[][]) {
        // description-UUID [Name, Duration, Shorthand ID, source, Effect ID]
        const effect: KolEffect = {
          name: apiEffect[0],
          turns: parseInt(apiEffect[1]),
          effectId: apiEffect[4],
        };

        if (effect.turns <= 0) {
          continue;
        }

        effects.push(effect);
      }
    }

    const status = {
      fetched: Date.now(),
      name: apiResponse["name"],
      playerid: apiResponse["playerid"],
      level: parseInt(apiResponse["level"]) || 1,
      adventures: parseInt(apiResponse["adventures"] ?? "10"),
      meat: parseInt(apiResponse["meat"]) || 0,
      drunk: parseInt(apiResponse["drunk"]) || 0,
      full: parseInt(apiResponse["full"]) || 0,
      spleen: parseInt(apiResponse["spleen"]) || 0,
      hp: parseInt(apiResponse["hp"]) || 0,
      mp: parseInt(apiResponse["mp"]) || 0,
      maxHP: parseInt(apiResponse["maxhp"]) || 0,
      maxMP: parseInt(apiResponse["maxmp"]) || 0,
      familiar: apiResponse["familiar"]
        ? parseInt(apiResponse["familiar"])
        : undefined,
      rollover: parseInt(apiResponse["rollover"]),
      turnsPlayed: parseInt(apiResponse["turnsplayed"]) || 0,
      effects: effects,
      daynumber: parseInt(apiResponse["daynumber"]) || 0,
      pwd: apiResponse["pwd"],
    };

    this.pwd = status.pwd;

    return status;
  }

  shouldSkip(message: KOLMessage): boolean {
    return message.who.name.toLowerCase() == this._player?.name.toLowerCase();
  }

  async processExtra(message: KOLMessage): Promise<void> {
    if (message.type == "event" && message.msg?.includes("<!--refresh-->")) {
      this.sendBotMessage(stripHtml(message.msg));
      await this.removeBadEffects();
    }

    if (
      message.type == "event" &&
      message.msg?.includes("href='clan_viplounge.php?preaction")
    ) {
      await this.checkFortuneTeller();
    }

    // If its a generic update message
    if (isUpdateMessage(message)) {
      // Get the updates
      const updates = await this.getTrivialUpdates();

      // If at least one message, update the string
      if (updates.length > 0) {
        if (isReplaceableUpdateMessage(message)) {
          message.msg = updates[0];
        } else {
          message.msg = `${message.msg} || ${updates[0]}`;
        }
      }
    }
  }

  async sendBotMessage(message: string) {
    const channel = this.channels.find((c) => c.holderId == "clan");

    if (channel == null) {
      console.log(message);

      return;
    }

    const name = this.getUsername() ?? "Me the bot";

    await this.chatManager.onChat({
      from: channel,
      sender: name,
      message: formatMessage(name, message, "normal", true, "Internal"),
      exclusiveTo: "Discord",
    });
  }

  async removeBadEffects() {
    const effects = (await this.getStatus()).effects.filter((e) =>
      getBadKolEffects().includes(e.name.toLowerCase()),
    );

    if (effects.length == 0) {
      return;
    }

    const inv = await this.getInventory();

    if ((inv.get(588) ?? 0) < effects.length) {
      if (this.lastAntidoteBeg < Date.now()) {
        this.lastAntidoteBeg = Date.now() + 1000 * 60 * 60 * 12;

        const msg =
          "Oh no! A bot is out of Soft green echo eyedrop antidote! Could someone send some to `" +
          this.getUsername() +
          "`?";

        if (this.chatManager.antidoteRequestFromName) {
          this.sendKmail(this.chatManager.antidoteRequestFromName, msg);
        } else {
          this.sendBotMessage(msg);
        }
      }

      return;
    }

    for (const effect of effects) {
      await this.visitUrl("uneffect.php", {
        using: "Yep.",
        whicheffect: parseInt(effect.effectId),
      });
    }

    const newEffects = (await this.getStatus()).effects.filter((e) =>
      getBadKolEffects().includes(e.name.toLowerCase()),
    );

    this.sendBotMessage(
      "Removed " +
        (effects.length - newEffects.length) +
        " of " +
        effects.length +
        " bad chat effects from " +
        this.getUsername(),
    );
  }

  async getInventory(): Promise<Map<number, number>> {
    const apiResponse = await this.visitUrl("api.php", {
      what: "inventory",
      for: FOR_WHO,
    });

    const map: Map<number, number> = new Map();

    if (!apiResponse) {
      return map;
    }

    for (const [rawKey, rawValue] of Object.entries(apiResponse)) {
      const key = Number(rawKey);
      const value = Number(rawValue);

      if (!Number.isInteger(key) || !Number.isInteger(value)) {
        continue;
      }

      map.set(key, value);
    }

    return map;
  }

  async logIn(): Promise<boolean> {
    await this.mutex.acquire();

    try {
      console.log(
        `Not logged in. Logging in as ${this._loginParameters.get(
          "loginname",
        )}`,
      );

      try {
        await this.axios("login.php", {
          method: "POST",
          data: this._loginParameters,
          maxRedirects: 0,
          validateStatus: (status) => status === 302,
        });

        const status = await this.getStatus();

        if (status == null) {
          throw "Not logged in?";
        }

        this._player = {
          id: status.playerid,
          name: status.name,
        };
        console.log("Login success.");
        this.failedLogins = 0;

        await this.doInitialChannelJoining();

        return true;
      } catch (e) {
        let toSleep = 1;

        if (this.failedLogins <= 5) {
          toSleep = 1;
        } else if (this.failedLogins <= 10) {
          toSleep = 5;
        } else if (this.failedLogins <= 15) {
          toSleep = 20;
        } else {
          toSleep = 60;
        }

        if (this.failedLogins++ < 5) {
          console.log(`Login failed...`);
        } else {
          console.log(`Login failed... Sleeping ${toSleep} minutes`, e);
        }

        setTimeout(() => this.logIn(), 60_000 * toSleep);

        return false;
      }
    } finally {
      this.mutex.release();
    }
  }

  logout() {
    // Technically I should call logout.php...
    this.pwd = null;
  }

  loggedIn(): boolean {
    return this.pwd == null;
  }

  async visitUrl(
    url: string,
    parameters: Record<string, any> = {},
    pwd: boolean = true,
    data: any = null,
    method: Method = "POST",
  ): Promise<any> {
    try {
      const page = await this.axios.request({
        url,
        method,
        withCredentials: true,
        params: {
          ...(pwd ? { pwd: this.pwd } : {}),
          ...parameters,
        },
        data,
      });

      return page.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;

        if (status === 401 || status === 403) {
          this.pwd = null;
          console.warn(`HTTP ${status}: logged out.`);
        } else if (status === 429) {
          console.warn("HTTP 429: rate limited.");
        } else if (status && status >= 500) {
          console.warn(`HTTP ${status}: temporary server error.`);
        } else {
          console.warn(`HTTP ${status ?? "none"}: request failed.`);
        }
      } else {
        console.error("Unexpected request error.", error);
      }

      return null;
    }
  }

  async sendWhisper(target: string, message: string) {
    target = target.split(" ").join("_");
    message = this.cleanWhisper(message);

    for (const msg of splitMessage("/clan /w " + target + " ", message)) {
      await this.sendMessageRetry(msg);
    }
  }

  async useChatMacro(macro: string): Promise<void> {
    await this.visitUrl("submitnewchat.php", {
      graf: `/clan ${macro}`,
      j: 1,
    });
  }

  cleanWhisper(macro: string): string {
    // Strip all repeated spaces with a single space
    macro = macro.replaceAll(/ {2,}/g, " ");

    // Replace a newline with a period and space if a sentence ends there
    // So "Hello everyone!\n" doesn't become "Hello everyone!.". Instead that's handled next line.
    // But "Hello everyone\n" becomes "Hello everyone.\n"
    // Except without the newline, that becomes a space.
    macro = macro.replaceAll(/([a-zA-Z\d])\n/g, "$1. ");
    // Too lazy to figure out the regex, so replace any remaining newlines with a space
    macro = macro.replaceAll("\n", " ");

    return macro;
  }

  async sendMessage(
    channel: string,
    prefix: string,
    macro: string,
  ): Promise<void> {
    for (const msg of splitMessage(prefix, macro)) {
      if (!KoLClient.privateChannels.includes(channel)) {
        console.log(
          this.getUsername() + " attempted to send to " + channel + ": " + msg,
        );

        return;
      }

      await this.sendMessageRetry("/" + channel + " " + msg);
    }
  }

  async sendMessageRetry(msg: string) {
    try {
      // We run the encoding as part of the url cos kol seems to handroll their own encoding?
      // And because axios will encode the message in a real encoding if we don't prevent that
      await this.mutex.runExclusive(async () => {
        await this.visitUrl(
          "submitnewchat.php?graf=" + encodeToKolEncoding(msg),
          {
            j: 1,
          },
        );
      });
    } catch (e) {
      console.log(
        "Errored when trying to send message " +
          JSON.stringify(msg) +
          ", will retry in 5min",
        e,
      );

      setTimeout(() => this.sendMessageRetry(msg), 5000);
    }
  }

  async fetchNewMessages(): Promise<KOLMessage[]> {
    try {
      // TODO Save the last seen message ID into a file whenever it changes.
      // When the bot restarts, it fetches `1` and will skip all message ID's that are <= that saved ID
      // Then sends all the new messages, but probably with a timestamp
      // If the bot knows that its definitely lost some messages, then it'll possibly send a message somewhere that says as much
      // Note that kol will only resend messages sent in the last hour. And by that, I mean it forgets every message on the hour mark. So only messages from 4am onwards will be fetchable until 5am, then only 5am messages. We can just provide `1`, I don't think a more accurate last message is needed. Can just provide the last message ID minus one since the first message will obviously be the one we saw if its still available.
      // Then back to normal behavior

      const newChatMessagesResponse = await this.visitUrl(
        "newchatmessages.php",
        {
          j: 1,
          lasttime: this._lastFetchedMessages,
        },
      );

      if (!newChatMessagesResponse) {
        return [];
      }

      this._lastFetchedMessages = newChatMessagesResponse["last"];

      const newWhispers: KOLMessage[] = newChatMessagesResponse["msgs"];

      for (const message of newWhispers) {
        if (!message.msg || typeof message.msg !== "string") {
          continue;
        }

        // KoL has taken to sending invisible characters for whatever reason.
        // Is it to prevent pings in discord? Probably! Either to patch this client, or their own internal use?
        message.msg = stripInvisibleCharacters(message.msg);
      }

      this.externalMessageProcessor(newWhispers);

      return newWhispers;
    } catch (e) {
      console.log(
        "Errored when trying to pull messages for " + this.getUsername(),
        e,
      );
    }

    return [];
  }

  getMe(): KoLUser | undefined {
    return this._player;
  }

  async doInitialChannelJoining(): Promise<void> {
    const listenTo = this.channels
      .map((c) => c.holderId)
      .filter((s) => !KolProcessor.syntheticChannels.includes(s));

    if (this.accountType == "CLAN") {
      await this.useChatMacro("/channel clan");

      const hasChannels = await this.getChannels();
      const listeningTo = await this.getChannelsListening();

      for (const channel of listeningTo) {
        if (!KoLClient.privateChannels.includes(channel)) {
          continue;
        }

        console.log(
          `${this.getUsername()} no longer listening to "${channel}"`,
        );
        await this.useChatMacro("/listen " + channel);
      }

      for (const channel of KoLClient.privateChannels) {
        if (!hasChannels.includes(channel)) {
          continue;
        }

        if (listeningTo.includes(channel)) {
          if (this.newlyStarted) {
            console.log(
              `${this.getUsername()} already listening to "${channel}"`,
            );
          }

          continue;
        }

        console.log(`${this.getUsername()} now listening to "${channel}"`);
        await this.useChatMacro("/listen " + channel);
      }
    } else {
      const hasChannels = await this.getChannels();
      const listeningTo = await this.getChannelsListening();

      for (const channel of hasChannels) {
        if (listeningTo.includes(channel) && listenTo.includes(channel)) {
          if (this.newlyStarted) {
            console.log(
              `${this.getUsername()} already listening to "${channel}"`,
            );
          }

          continue;
        }

        if (listenTo.includes(channel)) {
          console.log(`${this.getUsername()} now listening to "${channel}"`);
        } else {
          if (!listeningTo.includes(channel)) {
            continue;
          }

          if (listeningTo.indexOf(channel) == 0) {
            console.log(
              `${this.getUsername()} can't unlisten to "${channel}" as its the main channel? Bot dev too lazy to fix this`,
            );
          } else {
            console.log(
              `${this.getUsername()} no longer listening to "${channel}"`,
            );
          }
        }

        await this.useChatMacro("/listen " + channel);
      }
    }

    this.newlyStarted = false;
  }

  async lookupName(id: string): Promise<string | undefined> {
    const response = (
      await this.visitUrl("submitnewchat.php", {
        graf: `/clan /whois ${id}`,
        j: 1,
      })
    )["output"] as string;

    const match = response.match(/>([^<>]+) \(#\d+\)</);

    if (match == null) {
      return undefined;
    }

    const modName = match[1];

    if (modName != null) {
      const mods = this.chatManager.getModeratorNames();
      mods.push({ id: id, name: modName });
      this.chatManager.setModeratorNames(mods);
    }

    return modName;
  }

  async getKmails(): Promise<KolKmail[]> {
    const apiResponse = await this.visitUrl("api.php", {
      what: "kmail",
      for: FOR_WHO,
    });

    if (apiResponse.status != 200) {
      return [];
    }

    return apiResponse.data;
  }

  async sendKmail(name: string, message: string) {
    await this.visitUrl("sendmessage.php", {
      action: "send",
      towho: name,
      message: message,
      savecopy: "on",
    });
  }

  async checkFortuneTeller() {
    if (this.fortuneTeller == "DOESNT EXIST") {
      return;
    }

    let page: string = await this.visitUrl("clan_viplounge.php", {
      preaction: "lovetester",
    });

    // Only set to true if we're explicitly denied entry
    if (
      this.fortuneTeller == null &&
      page.includes("You attempt to sneak into the VIP Lounge")
    ) {
      this.fortuneTeller = "DOESNT EXIST";

      return;
    }

    page = (await this.visitUrl("choice.php", { forceoption: "0" })) as string;

    // Only set to false if we've explicitly seen the teller
    if (this.fortuneTeller == "UNTESTED" && page.includes("Madame Zatara")) {
      this.fortuneTeller = "EXISTS";
    }

    const promises = [];

    for (const match of page.matchAll(
      /clan_viplounge\.php\?preaction=testlove&testlove=(\d+)/g,
    )) {
      const userId = match[1];

      const promise = this.visitUrl(
        "clan_viplounge.php",
        {},
        false,
        `q1=beer&q2=robin&q3=thin&preaction=dotestlove&testlove=${userId}`,
      );

      promises.push(promise);
    }

    // We do promises so we're not accidentally messing up something else
    await Promise.allSettled(promises);
  }

  async getTrivialUpdates(): Promise<string[]> {
    const response = (
      await this.visitUrl("submitnewchat.php", {
        graf: `/clan /updates`,
        j: 1,
      })
    )["output"] as string;

    if (!response) {
      return null;
    }

    return [
      ...(response.matchAll(
        /<b>[a-z]+ \d+<\/b> - (.*?)(?=(?:<(?:p|br)>(?:<hr>|<b>[a-z]+ \d+<\/b> - )))/gi,
      ) ?? []),
    ].map((m) => m[1]);
  }

  async processMessage(): Promise<void> {
    const message = this.messages.shift();

    if (!message) {
      // Only run a status check when we're not processing anything
      if (!this.messageProcessingMutex.isLocked() && !this.mutex.isLocked()) {
        this.doStatusCheck();
      }

      setTimeout(() => this.processMessage(), 1000);

      return;
    }

    await this.processKolMessage(message);
  }

  async start(): Promise<void> {
    console.log("Starting " + this.getUsername() + "...");

    await this.logIn().then(async () => {
      const secondsToRollover = getSecondsToRollover();

      console.log(
        `The next rollover is in ${humanReadableTime(secondsToRollover)}`,
      );

      console.log("Initial setup complete. Polling messages.");

      this.messages.push(...(await this.fetchNewMessages()));
      const mutex = new Mutex();

      setInterval(() => {
        if (getSecondsElapsedInDay() < 4 * 60 || getSecondsToRollover() < 3) {
          return;
        }

        if (mutex.isLocked()) {
          return;
        }

        mutex.runExclusive(async () => {
          try {
            this.messages.push(...(await this.fetchNewMessages()));
          } catch (e) {
            console.error(
              `Errored on ${this.getUsername()} while fetching messages:`,
              e,
            );
          }
        });
      }, 3000);

      this.processMessage();
    });
  }
}
