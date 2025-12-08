import { Mutex } from "async-mutex";
import { ChannelId, KOLMessage } from "./Typings";
import {
  formatMessage,
  getPublicMessageType,
  isRolloverMessage,
  removeKolEmote,
  stripHtml
} from "./Utils";
import { ChatManager } from "../ChatManager";

export abstract class KolProcessor {
  messageProcessingMutex = new Mutex();
  static syntheticChannels: string[] = ["system", "rollover"];

  /**
   * Extra processing for a message
   * @param message
   */
  abstract processExtra(message: KOLMessage): Promise<void>;

  /**
   * If this message should be skipped
   * @param message
   */
  abstract shouldSkip(message: KOLMessage): boolean;

  abstract lookupName(id: string): Promise<string | undefined>;

  abstract getChatManager(): ChatManager;

  abstract processMessage(): void;

  abstract getChatChannels(): ChannelId[];

  async processKolMessage(message: KOLMessage) {
    try {
      this.messageProcessingMutex.runExclusive(async () => {
        // pvp radio
        if (message != null && message.who != null && message.who.id == "-69") {
          return;
        }

        // console.log("Received kol message: " + JSON.stringify(message));
        //  {"msg":"<b>gizmofinch</b> just thwarted wardeath11!","type":"public","mid":"1533599175","who":{"name":"HMC Radio","id":"-69","color":null},"format":"0","channel":null,"channelcolor":null,"time":"1688375906"}

        //{"msg":"<b><i><a target=mainpane href=\"showplayer.php?who=3469406\"><font color=\"black\">Irrat</b></font></a> needs to try that path sometime, but he probably won't</i>","type":"public","mid":"1533599516","who":{"name":"Irrat","id":"3469406","color":"black"},"format":"1","channel":"games","channelcolor":"green","time":"1688376786"}

        //Received kol message: {"msg":"All violent roleplay is verboten, including bot abuse.","type":"public","mid":"1533603237","who":{"name":"Mod Announcement","id":"1469700","color":""},"format":"4","channel":"games","channelcolor":"green","time":"1688393325"}

        // {"msg":"S<font color=darkred>o</font>metimes I cry h<font color=darkred>a</font>rd<Br> S<font color=darkred>o</font>metimes I cry h<font color=darkred>o</font>pelessly<Br> T<font color=darkred>o</font>d<font color=darkred>a</font>y, I'm dry eyes","type":"public","mid":"1533606081","who":{"name":"Irrat","id":"3469406","color":"black"},"format":"0","channel":"haiku","channelcolor":"green","time":"1688400641"}

        // {"msg":"<a target=_blank href=\"https://averageclan_ignore_this_test_thanks.com/this_is_a_fake_site?yes_really=why_you_no_trust_me\"><font color=blue>[link]</font></a> https:// <font color=darkred>a</font>ver<font color=darkred>a</font>gecl<font color=darkred>a</font>n_ign<font color=darkred>o</font>re_t his_test_th<font color=darkred>a</font>nks.c<font color=darkred>o</font>m/ this_is_<font color=darkred>a</font>_f<font color=darkred>a</font>ke_site? yes_re<font color=darkred>a</font>lly=why_y<font color=darkred>o</font>u_n <font color=darkred>o</font>_trust_me","type":"public","mid":"1533608761","who":{"name":"Irrat","id":"3469406","color":"black"},"format":"0","channel":"clan","channelcolor":"green","time":"1688407142"}

        // {"msgs":[{"msg":"it's perfect f<font color=darkred>o<\/font>r K<font color=darkred>o<\/font>L, th<font color=darkred>o<\/font>ugh","type":"public","mid":"1533815421","who":{"name":"Partasah","id":"1482224","color":"black"},"format":"0","channel":"foodcourt","channelcolor":"green","time":"1688869146"},{"msg":"<font color=darkred>O<\/font>h de<font color=darkred>a<\/font>r, <i title=\"looks\">hisss<\/i> like I'm n<font color=darkred>o<\/font>t <i title=\"handling\">pl<font color=darkred>o<\/font>p<\/i> the html pr<font color=darkred>o<\/font>perly. <i title=\"I\">Pl<font color=darkred>o<\/font>p<\/i> w<font color=darkred>o<\/font>nder if <i title=\"its\"><font color=darkred>b<\/font>uzzs<\/i> rel<font color=darkred>a<\/font>ted t<font color=darkred>o<\/font> <i title=\"my\">sn<font color=darkred>o<\/font>rt<\/i> v<font color=darkred>a<\/font>mpire cl<font color=darkred>o<\/font><font color=darkred>a<\/font>k<!--fb-->","type":"public","mid":"1533815426","who":{"name":"Irrat","id":"3469406","color":"#CC3300"},"format":"0","channel":"clan","channelcolor":"green","time":"1688869149"}],"last":"1533815426","delay":3000}

        // {"msgs":[{"type":"event","msg":"<a href='showplayer.php?who=3469406' target=mainpane class=nounder style='color: green'>Irrat<\/a> has hit you with a cartoon harpoon!<!--refresh-->","link":false,"time":"1690528121"}],"last":"1534646135","delay":3000}

        // {"msgs":[{"type":"event","msg":"You have been invited to <a style='color: green' target='mainpane' href='clan_viplounge.php?preaction=testlove&testlove=3257284'>consult Madame Zatara about your relationship<\/a> with Rosemary Gulasch.","link":false,"time":"1692188076"}],"last":"1535503834","delay":3000}

        if (message.type == "system" && message.channel == null) {
          if (isRolloverMessage(message)) {
            message.channel = "rollover";
          } else {
            message.channel = "system";
          }
        }

        await this.processExtra(message);

        if (
          message.who == null ||
          message.channel == null ||
          message.msg == null
        ) {
          return;
        }

        if (this.shouldSkip(message)) {
          return;
        }

        const channel = this.getChatChannels().find(
          (c) => c.holderId == message.channel
        );

        if (channel == null) {
          return;
        }

        let sender = stripHtml(message.who.name);

        if (
          this.getChatManager().ignoredChatRelays.includes(sender.toLowerCase())
        ) {
          return;
        }

        const messageType = getPublicMessageType(message);

        if (messageType == "event") {
          return;
        }

        if (
          message.who.id &&
          (messageType == "mod announcement" || messageType == "mod warning")
        ) {
          const mods = this.getChatManager().getModeratorNames();

          let name = mods.find((m) => m.id == message.who?.id);

          if (name == null && message.who.id.match(/^\d+$/)) {
            const modName = await this.lookupName(message.who.id);

            if (modName != null) {
              name = {
                id: message.who.id,
                name: modName
              };
            }
          }

          if (name != null) {
            sender = `${name.name} (#${name.id})`;
          } else {
            sender = "#" + message.who.id;
          }
        }

        let msg = message.msg;

        if (messageType === "emote") {
          msg = removeKolEmote(sender, msg);
        }

        const previewLinks = false;

        this.getChatManager().onChat({
          from: channel,
          sender: sender,
          message: formatMessage(sender, msg, messageType, previewLinks, "KoL")
        });
      });
    } catch (e) {
      console.log("ERROR: " + e);
    } finally {
      this.processMessage();
    }
  }
}
