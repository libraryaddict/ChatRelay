import axios from "axios";
import { Agent as httpsAgent } from "https";
import { Agent as httpAgent } from "http";
import {
  KOLCredentials,
  KoLUser,
  KOLMessage,
  ChatChannel,
  ChannelId,
  ChatMessage,
  KolAccountType,
  KolEffect,
} from "./Typings";
import {
  encodeToKolEncoding,
  getBadKolEffects,
  getPublicMessageType,
  humanReadableTime,
  splitMessage,
  stripHtml,
} from "./Utils";
import { ChatManager } from "../ChatManager";
import { decode } from "html-entities";
import { Mutex } from "async-mutex";

axios.defaults.timeout = 30000;
axios.defaults.httpAgent = new httpAgent({ keepAlive: true });
axios.defaults.httpsAgent = new httpsAgent({ keepAlive: true });

export class KoLClient implements ChatChannel {
  private channels: ChannelId[];
  private _loginParameters;
  private _credentials?: KOLCredentials;
  private _lastFetchedMessages: string = "0";
  private _player?: KoLUser;
  private _isRollover: boolean = false;
  private _rolloverAt?: number;
  private static privateChannels: string[] = ["clan", "hobopolis", "dread", "slimetube"];
  private messages: KOLMessage[] = [];
  private chatManager: ChatManager;
  private accountType: KolAccountType;
  private mutex = new Mutex();
  private messageProcessingMutex = new Mutex();
  private lastAntidoteBeg = 0;
  private lastStatusCheck = 0;
  private fortuneTeller: "UNTESTED" | "EXISTS" | "DOESNT EXIST" = "UNTESTED";

  constructor(
    chatManager: ChatManager,
    channelIds: ChannelId[],
    username: string,
    password: string,
    type: KolAccountType
  ) {
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

    for (const channel of this.channels) {
      console.log(username + " will be listening to " + channel.holderId);
    }
  }

  async doStatusCheck() {
    if (this.lastStatusCheck > Date.now() || this._isRollover) return;

    // Every hour
    this.lastStatusCheck = Date.now() + 1000 * 60 * 60;

    await this.removeBadEffects();
    await this.checkFortuneTeller();
  }

  isOwner(channelId: ChannelId): boolean {
    return this.channels.includes(channelId);
  }

  async sendMessageToChannel(target: ChannelId, message: ChatMessage): Promise<void> {
    if (!KoLClient.privateChannels.includes(target.holderId)) {
      console.log("Tried to send a message to '" + target.holderId + "', but that's not private?");
      return;
    }

    let msg = `[${message.sender}] ${message.message}`;

    if (message.formatting == "emote") {
      msg = "/me " + msg;
    }

    await this.sendMessage(target.holderId as string, msg);
  }

  getUsername() {
    return this._player?.name;
  }

  getUserID() {
    return this._player?.id;
  }

  async getChannelsListening(): Promise<string[]> {
    // <font color=green><a target=mainpane href="showplayer.php?who=3469406"><b style="color: green;">Irrat (#3469406)</b></a>, the Level 14 Whale Boxer<br>This player is currently online in channel <b>trade</b> and listening to <b>challenge, clan, dread, foodcourt, games, hardcore and talkie</b>.</font><br>

    const response = (
      await this.visitUrl("submitnewchat.php", {
        graf: `/clan /whois ${this.getUsername()}`,
        j: 1,
      })
    )["output"] as string;

    console.log("`" + response + "`");

    const match = response.match(/ channel <b>([a-z]+)<\/b>(?: and listening to <b>(.*?)<\/b>)/);

    if (match == null) return [];

    const channels: string[] = [];

    channels.push(match[1]);

    if (match[2] != null) {
      for (const ch of match[2].split(/ and |, /g)) {
        channels.push(ch);
      }
    }

    return channels;
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

  async getSecondsToRollover(): Promise<number> {
    if (this._isRollover) {
      return 0;
    }

    const now = Math.floor(Date.now() / 1000);

    // If rollover has not been set, or it's claiming it's expired
    if (this._rolloverAt == undefined || this._rolloverAt <= now) {
      this._rolloverAt = undefined;

      await this.loggedIn();
    }

    if (this._rolloverAt === undefined) {
      return 0;
    }

    return this._rolloverAt - now;
  }

  async getEffects(): Promise<KolEffect[]> {
    const apiResponse = await axios("https://www.kingdomofloathing.com/api.php", {
      maxRedirects: 0,
      withCredentials: true,
      headers: {
        cookie: this._credentials?.sessionCookies || "",
      },
      params: {
        what: "status",
        for: "DiscordChat (Maintained by Irrat)",
      },
      validateStatus: (status) => status === 302 || status === 200,
    });

    if (!apiResponse.data["effects"]) {
      return [];
    }

    const effects: KolEffect[] = [];

    for (const k of Object.values(apiResponse.data["effects"]) as any[][]) {
      effects.push({
        name: k[0],
        turns: parseInt(k[1]),
        effectId: k[4],
      });
    }

    return effects;
  }

  async sendBotMessage(message: string) {
    const channel = this.channels.find((c) => c.holderId == "clan");

    if (channel == null) {
      console.log(message);
      return;
    }

    await this.chatManager.onChat({
      from: channel,
      formatting: "bot",
      sender: this.getUsername() ?? "Me the bot",
      message: message,
      encoding: "ascii",
    });
  }

  async removeBadEffects() {
    const effects = (await this.getEffects()).filter((e) =>
      getBadKolEffects().includes(e.name.toLowerCase())
    );

    if (effects.length == 0) {
      return;
    }

    const inv = await this.getInventory();

    if ((inv.get(588) ?? 0) < effects.length) {
      if (this.lastAntidoteBeg < Date.now()) {
        this.lastAntidoteBeg = Date.now() + 1000 * 60 * 60 * 12;

        this.sendBotMessage(
          "Oh no! A bot is out of Soft green echo eyedrop antidote! Could someone send some to `" +
            this.getUsername() +
            "`?"
        );
      }

      return;
    }

    for (const effect of effects) {
      await this.visitUrl("uneffect.php", {
        using: "Yep.",
        whicheffect: parseInt(effect.effectId),
      });
    }

    const newEffects = (await this.getEffects()).filter((e) =>
      getBadKolEffects().includes(e.name.toLowerCase())
    );

    this.sendBotMessage(
      "Removed " +
        (effects.length - newEffects.length) +
        " of " +
        effects.length +
        " bad chat effects from " +
        this.getUsername()
    );
  }

  async getInventory(): Promise<Map<number, number>> {
    const apiResponse = await this.visitUrl("api.php", {
      what: "inventory",
      for: "DiscordChat (Irrat)",
    });

    const map: Map<number, number> = new Map();

    if (!apiResponse) {
      return map;
    }

    for (let key of Object.keys(apiResponse)) {
      const value = apiResponse[key];

      if (typeof value != "string" || !/^\d+$/.test(key) || !/^\d+$/.test(value)) {
        continue;
      }

      map.set(parseInt(key), parseInt(value));
    }

    return map;
  }

  async loggedIn(): Promise<boolean> {
    if (!this._credentials || this._isRollover) return false;

    try {
      const apiResponse = await axios("https://www.kingdomofloathing.com/api.php", {
        maxRedirects: 0,
        withCredentials: true,
        headers: {
          cookie: this._credentials?.sessionCookies || "",
        },
        params: {
          what: "status",
          for: "DiscordChat (Maintained by Irrat)",
        },
        validateStatus: (status) => status === 302 || status === 200,
      });

      if (apiResponse.status === 200) {
        this._rolloverAt = parseInt(apiResponse.data["rollover"]);
        return true;
      }

      return false;
    } catch (e) {
      console.log("Login check failed, returning false to be safe.", e);
      return false;
    }
  }

  async logIn(): Promise<boolean> {
    await this.mutex.acquire();

    try {
      if (await this.loggedIn()) return true;

      this._credentials = undefined;

      try {
        this._isRollover = /The system is currently down for nightly maintenance/.test(
          (await axios("https://www.kingdomofloathing.com/")).data
        );

        if (this._isRollover) {
          console.log("Rollover appears to be in progress. Checking again in one minute.");
        }
      } catch (e) {
        this._isRollover = true;
        console.log("Login failed.. Rollover? Checking again in one minute.", e);
      }

      if (this._isRollover) {
        setTimeout(() => this.logIn(), 60000);
        return false;
      }

      console.log(`Not logged in. Logging in as ${this._loginParameters.get("loginname")}`);

      try {
        const loginResponse = await axios("https://www.kingdomofloathing.com/login.php", {
          method: "POST",
          data: this._loginParameters,
          maxRedirects: 0,
          validateStatus: (status) => status === 302,
        });

        if (!loginResponse.headers["set-cookie"]) {
          console.log("Login failed.. Headers missing");
          return false;
        }

        const sessionCookies = loginResponse.headers["set-cookie"]
          .map((cookie: string) => cookie.split(";")[0])
          .join("; ");
        const apiResponse = await axios("https://www.kingdomofloathing.com/api.php", {
          withCredentials: true,
          headers: {
            cookie: sessionCookies,
          },
          params: {
            what: "status",
            for: "DiscordChat (Maintained by Irrat)",
          },
        });
        this._credentials = {
          sessionCookies: sessionCookies,
          pwdhash: apiResponse.data.pwd,
        };
        this._player = {
          id: apiResponse.data.playerid,
          name: apiResponse.data.name,
        };
        console.log("Login success.");

        return true;
      } catch (e) {
        console.log("Login failed.. Got an error. Trying again in a minute.", e);
        this._isRollover = true;
        setTimeout(() => this.logIn(), 60000);
        return false;
      }
    } finally {
      this.mutex.release();
    }
  }

  async visitUrl(
    url: string,
    parameters: Record<string, any> = {},
    pwd: Boolean = true,
    data?: any
  ): Promise<any> {
    if (this._isRollover || (await this.getSecondsToRollover()) <= 1) {
      return null;
    }

    try {
      const page = await axios(`https://www.kingdomofloathing.com/${url}`, {
        method: "POST",
        withCredentials: true,
        headers: {
          cookie: this._credentials?.sessionCookies || "",
        },
        params: {
          ...(pwd ? { pwd: this._credentials?.pwdhash } : {}),
          ...parameters,
        },
        data: data,
      });

      if (page.headers["set-cookie"] && this._credentials != null) {
        const cookies: any = {};

        for (let [name, cookie] of this._credentials.sessionCookies
          .split("; ")
          .map((s) => s.split("="))) {
          if (!cookie) {
            continue;
          }

          cookies[name] = cookie;
        }

        const sessionCookies = page.headers["set-cookie"].map((cookie: string) =>
          cookie.split(";")[0].trim().split("=")
        );

        for (let [name, cookie] of sessionCookies) {
          cookies[name] = cookie;
        }

        this._credentials.sessionCookies = Object.entries(cookies)
          .map(([key, value]) => `${key}=${value}`)
          .join("; ");
      }

      return page.data;
    } catch {
      return null;
    }
  }

  async useChatMacro(macro: string): Promise<void> {
    await this.visitUrl("submitnewchat.php", {
      graf: `/clan ${macro}`,
      j: 1,
    });
  }

  async sendMessage(channel: string, macro: string): Promise<void> {
    // Strip all repeated spaces with a single space
    macro = macro.replaceAll(/ {2,}/g, " ");

    // Replace a newline with a period and space if a sentence ends there
    // So "Hello everyone!\n" doesn't become "Hello everyone!.". Instead that's handled next line.
    // But "Hello everyone\n" becomes "Hello everyone.\n"
    // Except without the newline, that becomes a space.
    macro = macro.replaceAll(/([a-zA-Z\d])\n/g, "$1. ");
    // Too lazy to figure out the regex, so replace any remaining newlines with a space
    macro = macro.replaceAll("\n", " ");

    for (let msg of splitMessage(macro)) {
      if (channel != "clan") {
        console.log(this.getUsername() + " attempted to send to " + channel + ": " + msg);
        return;
      }

      await this.sendMessageRetry(msg);
    }
  }

  async sendMessageRetry(msg: string) {
    try {
      // We run the encoding as part of the url cos kol seems to handroll their own encoding?
      // And because axios will encode the message in a real encoding if we don't prevent that
      await this.mutex.runExclusive(async () => {
        await this.visitUrl("submitnewchat.php?graf=" + encodeToKolEncoding(msg), {
          j: 1,
        });
      });
    } catch (e) {
      console.log(
        "Errored when trying to send message " + JSON.stringify(msg) + ", will retry in 5min",
        e
      );

      setTimeout(() => this.sendMessageRetry(msg), 5000);
    }
  }

  isRollover(): boolean {
    return this._isRollover;
  }

  async fetchNewMessages(): Promise<KOLMessage[]> {
    try {
      if (this._isRollover || !(await this.logIn())) {
        return [];
      }

      const newChatMessagesResponse = await this.visitUrl("newchatmessages.php", {
        j: 1,
        lasttime: this._lastFetchedMessages,
      });

      if (!newChatMessagesResponse) return [];

      this._lastFetchedMessages = newChatMessagesResponse["last"];

      const newWhispers: KOLMessage[] = newChatMessagesResponse["msgs"];

      return newWhispers;
    } catch (e) {
      console.log("Errored when trying to pull messages for " + this.getUsername(), e);
    }

    return [];
  }

  getMe(): KoLUser | undefined {
    return this._player;
  }

  async doInitialChannelJoining(): Promise<void> {
    if (this.accountType == "CLAN") {
      await this.useChatMacro("/channel clan");

      const hasChannels = await this.getChannels();
      const listeningTo = await this.getChannelsListening();

      for (const channel of listeningTo) {
        if (KoLClient.privateChannels.includes(channel)) {
          continue;
        }

        console.log("Not listening to `" + channel + "`");
        await this.useChatMacro("/listen " + channel);
      }

      for (const channel of KoLClient.privateChannels) {
        if (!hasChannels.includes(channel) || listeningTo.includes(channel)) continue;

        console.log("Listening to `" + channel + "`");
        await this.useChatMacro("/listen " + channel);
      }
    } else {
      const hasChannels = await this.getChannels();
      const listeningTo = await this.getChannelsListening();

      for (const channel of hasChannels) {
        if (listeningTo.includes(channel)) continue;

        console.log("Listening to `" + channel + "`");
        await this.useChatMacro("/listen " + channel);
      }
    }
  }

  async checkFortuneTeller() {
    if (this.fortuneTeller == "DOESNT EXIST") {
      return;
    }

    let page: string = await this.visitUrl("clan_viplounge.php", { preaction: "lovetester" });

    // Only set to true if we're explicitly denied entry
    if (this.fortuneTeller == null && page.includes("You attempt to sneak into the VIP Lounge")) {
      this.fortuneTeller = "DOESNT EXIST";
      return;
    }

    page = (await this.visitUrl("choice.php", { forceoption: "0" })) as string;

    // Only set to false if we've explicitly seen the teller
    if (this.fortuneTeller == "UNTESTED" && page.includes("Madame Zatara")) {
      this.fortuneTeller = "EXISTS";
    }

    const promises = [];

    for (const match of page.matchAll(/clan_viplounge\.php\?preaction=testlove&testlove=(\d+)/g)) {
      const userId = match[1];

      const promise = this.visitUrl(`clan_viplounge.php`, {
        q1: "beer",
        q2: "robin",
        q3: "thin",
        preaction: "dotestlove",
        testlove: userId,
      });

      promises.push(promise);
    }

    // We do promises so we're not accidentally messing up something else
    await Promise.allSettled(promises);
  }

  async processMessage(): Promise<void> {
    const message = this.messages.shift();

    if (!message) {
      // Only run a status check when we're not processing anything
      if (!this.messageProcessingMutex.isLocked() && !this.mutex.isLocked()) this.doStatusCheck();

      setTimeout(() => this.processMessage(), 1000);
      return;
    }

    try {
      this.messageProcessingMutex.runExclusive(async () => {
        // pvp radio
        if (message != null && message.who != null && message.who.id == "-69") return;

        // console.log("Received kol message: " + JSON.stringify(message));
        //  {"msg":"<b>gizmofinch</b> just thwarted wardeath11!","type":"public","mid":"1533599175","who":{"name":"HMC Radio","id":"-69","color":null},"format":"0","channel":null,"channelcolor":null,"time":"1688375906"}

        //{"msg":"<b><i><a target=mainpane href=\"showplayer.php?who=3469406\"><font color=\"black\">Irrat</b></font></a> needs to try that path sometime, but he probably won't</i>","type":"public","mid":"1533599516","who":{"name":"Irrat","id":"3469406","color":"black"},"format":"1","channel":"games","channelcolor":"green","time":"1688376786"}

        //Received kol message: {"msg":"All violent roleplay is verboten, including bot abuse.","type":"public","mid":"1533603237","who":{"name":"Mod Announcement","id":"1469700","color":""},"format":"4","channel":"games","channelcolor":"green","time":"1688393325"}

        // {"msg":"S<font color=darkred>o</font>metimes I cry h<font color=darkred>a</font>rd<Br> S<font color=darkred>o</font>metimes I cry h<font color=darkred>o</font>pelessly<Br> T<font color=darkred>o</font>d<font color=darkred>a</font>y, I'm dry eyes","type":"public","mid":"1533606081","who":{"name":"Irrat","id":"3469406","color":"black"},"format":"0","channel":"haiku","channelcolor":"green","time":"1688400641"}

        // {"msg":"<a target=_blank href=\"https://averageclan_ignore_this_test_thanks.com/this_is_a_fake_site?yes_really=why_you_no_trust_me\"><font color=blue>[link]</font></a> https:// <font color=darkred>a</font>ver<font color=darkred>a</font>gecl<font color=darkred>a</font>n_ign<font color=darkred>o</font>re_t his_test_th<font color=darkred>a</font>nks.c<font color=darkred>o</font>m/ this_is_<font color=darkred>a</font>_f<font color=darkred>a</font>ke_site? yes_re<font color=darkred>a</font>lly=why_y<font color=darkred>o</font>u_n <font color=darkred>o</font>_trust_me","type":"public","mid":"1533608761","who":{"name":"Irrat","id":"3469406","color":"black"},"format":"0","channel":"clan","channelcolor":"green","time":"1688407142"}

        // {"msgs":[{"msg":"it's perfect f<font color=darkred>o<\/font>r K<font color=darkred>o<\/font>L, th<font color=darkred>o<\/font>ugh","type":"public","mid":"1533815421","who":{"name":"Partasah","id":"1482224","color":"black"},"format":"0","channel":"foodcourt","channelcolor":"green","time":"1688869146"},{"msg":"<font color=darkred>O<\/font>h de<font color=darkred>a<\/font>r, <i title=\"looks\">hisss<\/i> like I'm n<font color=darkred>o<\/font>t <i title=\"handling\">pl<font color=darkred>o<\/font>p<\/i> the html pr<font color=darkred>o<\/font>perly. <i title=\"I\">Pl<font color=darkred>o<\/font>p<\/i> w<font color=darkred>o<\/font>nder if <i title=\"its\"><font color=darkred>b<\/font>uzzs<\/i> rel<font color=darkred>a<\/font>ted t<font color=darkred>o<\/font> <i title=\"my\">sn<font color=darkred>o<\/font>rt<\/i> v<font color=darkred>a<\/font>mpire cl<font color=darkred>o<\/font><font color=darkred>a<\/font>k<!--fb-->","type":"public","mid":"1533815426","who":{"name":"Irrat","id":"3469406","color":"#CC3300"},"format":"0","channel":"clan","channelcolor":"green","time":"1688869149"}],"last":"1533815426","delay":3000}

        // {"msgs":[{"type":"event","msg":"<a href='showplayer.php?who=3469406' target=mainpane class=nounder style='color: green'>Irrat<\/a> has hit you with a cartoon harpoon!<!--refresh-->","link":false,"time":"1690528121"}],"last":"1534646135","delay":3000}

        // {"msgs":[{"type":"event","msg":"You have been invited to <a style='color: green' target='mainpane' href='clan_viplounge.php?preaction=testlove&testlove=3257284'>consult Madame Zatara about your relationship<\/a> with Rosemary Gulasch.","link":false,"time":"1692188076"}],"last":"1535503834","delay":3000}

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

        if (message.who == null || message.channel == null || message.msg == null) return;

        if (message.who.name.toLowerCase() == this._player?.name.toLowerCase()) return;

        const channel = this.channels.find((c) => c.holderId == message.channel);

        if (channel == null) return;

        const sender = stripHtml(message.who.name);

        if (this.chatManager.ignoredChatRelays.includes(sender.toLowerCase())) {
          return;
        }

        const messageType = getPublicMessageType(message);

        const links: string[] = [];
        let msg = message.msg;

        for (const match of msg.matchAll(/href="([^"]*)"/g)) {
          links.push(match[1]);
        }

        msg = msg.replaceAll(/<[Bb][Rr]>/g, "\n");

        let tempMsg = msg;
        msg = stripHtml(msg);

        if (msg.trim().length == 0) {
          msg = "RAW: " + tempMsg;
        }

        msg = decode(msg);

        for (let link of links) {
          let newMsg = "";
          let state = 0;
          let startAt = 0;

          for (let i = 0; i <= msg.length; i++) {
            if (state == 0 && i < msg.length) {
              if (
                msg.charAt(i) == " " ||
                !msg
                  .substring(i)
                  .replaceAll(" ", "")
                  .startsWith("[link]" + link)
              ) {
                continue;
              }

              state = 1;
              startAt = i;
              newMsg = msg.substring(0, i) + link;
            } else if (state == 1) {
              if (msg.substring(startAt, i).replaceAll(" ", "") != "[link]" + link) continue;

              newMsg += msg.substring(i);
              state = 2;
              break;
            }
          }

          if (state == 2) {
            msg = newMsg;
          }
        }

        this.chatManager.onChat({
          from: channel,
          sender: sender,
          message: msg,
          formatting: messageType,
          encoding: "ascii",
        });
      });
    } catch (e) {
      console.log("ERROR: " + e);
    } finally {
      this.processMessage();
    }
  }

  start(): void {
    console.log("Starting " + this.getUsername() + "...");

    this.logIn().then(() =>
      this.doInitialChannelJoining().then(async () => {
        const secondsToRollover = await this.getSecondsToRollover();

        console.log(`The next rollover is in ${humanReadableTime(secondsToRollover)}`);

        console.log("Initial setup complete. Polling messages.");

        let handlingRollover = this.isRollover();

        this.messages.push(...(await this.fetchNewMessages()));

        setInterval(async () => {
          this.messages.push(...(await this.fetchNewMessages()));

          // If the last whisper check was during rollover, and it's no longer rollover
          if (handlingRollover && !this.isRollover()) {
            handlingRollover = false;
          } else {
            handlingRollover = this.isRollover();
          }
        }, 3000);

        this.processMessage();
      })
    );
  }
}
