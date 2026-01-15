import { OmitPartialGroupDMChannel, Message } from "discord.js";
import { DiscordHandler } from "../DiscordHandler";
import { KoLClient } from "../utils/KoLClient";
import { KolKmail, KOLMessage } from "../utils/Typings";
import { LoggingTarget } from "@prisma/client";
import { addUpdateLogging } from "./DiscordLoggingDatabase";
import { CommandInterface, CommandResponse } from "./commands/iCommand";
import { CommandAddHook } from "./commands/commandAddLink";
import { CommandDeleteHook } from "./commands/commandDeleteLink";
import { CommandEditHook } from "./commands/commandEditLink";
import { CommandList } from "./commands/commandList";
import { CommandRunLog } from "./commands/commandRunLink";
import { Mutex } from "async-mutex";
import { CommandHelp } from "./commands/commandHelp";
import { cleanupKolMessage } from "../utils/Utils";

export type MessageSource = "kmail" | "whisper";

export class ErrorResponse extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErrorResponse";
  }
}

export interface PendingDiscordAuth {
  expires: number;
  code: string;
  handler: LoggingTarget;
}

export class DiscordLoggingHandler {
  kolClient: KoLClient;
  discordHandler: DiscordHandler;
  pendingAuths: PendingDiscordAuth[] = [];
  commands: CommandInterface[] = [];
  mutex: Mutex = new Mutex();

  constructor(client: KoLClient, discord: DiscordHandler) {
    this.kolClient = client;
    this.discordHandler = discord;

    discord.directMessageHandler = (message) => this.onDiscordDM(message);

    client.externalMessageProcessor = async (messages) => {
      await this.mutex.runExclusive(async () => {
        await this.onChatEvents(messages);
      });
    };

    this.commands.push(new CommandAddHook(this));
    this.commands.push(new CommandDeleteHook());
    this.commands.push(new CommandEditHook());
    this.commands.push(new CommandList(this));
    this.commands.push(new CommandRunLog(this));
    this.commands.push(new CommandHelp(this));

    console.log("Discord Logger is setup");
  }

  async onDiscordDM(message: OmitPartialGroupDMChannel<Message<boolean>>) {
    this.trimAuths();

    const msg = message.cleanContent.trim();

    const pending = this.pendingAuths.find((pending) => pending.code == msg);

    if (pending == null) {
      message.reply("I'm sorry, I did not understand that.");

      return;
    }

    const index = this.pendingAuths.indexOf(pending);

    if (index >= 0) {
      this.pendingAuths.splice(this.pendingAuths.indexOf(pending), 1);
    }

    pending.handler.targetData = message.author.id;

    await addUpdateLogging(pending.handler);
    message.reply("All set! Logging has been linked.");
  }

  addAuth(code: string, target: LoggingTarget) {
    this.trimAuths();

    this.pendingAuths = this.pendingAuths.filter(
      (p) => p.handler.player == target.player
    );
    console.log("Added auth with code '" + code + "'");

    this.pendingAuths.push({
      expires: Date.now() + 60 * 15 * 1000,
      code: code,
      handler: target
    });
  }

  trimAuths() {
    while (
      this.pendingAuths.length > 0 &&
      this.pendingAuths[0].expires < Date.now()
    ) {
      console.log("Trimmed auth");
      this.pendingAuths.shift();
    }
  }

  /**
   * We accept an array because we want to process kmails if needed, and insert those in the correct timeline without wasting time doing this multiple times
   *
   * Example of time waste, is two kmails and two whispers. Instead of fetching kmails twice, we just fetch it once and inject it in the correct order
   */
  async onChatEvents(chats: KOLMessage[]) {
    let kmails: Promise<KolKmail[]> | null = null;

    // Attempt to fetch kmails before bothering processing the rest, do it async
    if (
      chats.some(
        (c) =>
          c.type == "event" &&
          c.msg &&
          c.msg.includes("New message received from ") &&
          c.link == "messages.php"
      )
    ) {
      kmails = this.kolClient.getKmails();
    }

    const processedKmails: string[] = [];

    for (const message of chats) {
      if (
        message.type == "event" &&
        message.msg &&
        message.msg.includes("New message received from ")
      ) {
        if (kmails == null) {
          continue;
        }

        // Filter to all kmails from this user
        const matches = (await kmails).filter(
          (k) =>
            k.azunixtime == message.time &&
            message.msg?.includes(`?who=${k.fromid}'`) &&
            !processedKmails.includes(k.id)
        );

        if (matches.length == 0) {
          continue;
        }

        // Do the last kmail, aka the oldest
        const last = matches[matches.length - 1];

        // Don't process this one again
        processedKmails.push(last.id);

        await this.onProcess("kmail", last.fromid, last.fromname, last.message);
      } else if (
        message.type != "private" ||
        message.msg == null ||
        message.who == null ||
        message.who.id == null ||
        message.who.name == null
      ) {
        continue;
      } else {
        const respondKmail = message.msg.startsWith("kmail.");

        if (respondKmail) {
          message.msg = message.msg.substring("kmail.".length);
        }

        await this.onProcess(
          respondKmail ? "kmail" : "whisper",
          message.who.id,
          message.who.name,
          message.msg
        );
      }
    }
  }

  async onProcess(
    source: MessageSource,
    fromId: string,
    fromName: string,
    message: string
  ) {
    message = cleanupKolMessage(message, "normal", "plaintext", true, "KoL");

    console.log(`Received ${source} from ${fromName} (#${fromId})`);

    for (const command of this.commands) {
      if (!command.isCommand(message)) {
        continue;
      }

      try {
        const response = await command.runCommand(fromId, message);

        if (response == null) {
          continue;
        }

        if (Array.isArray(response)) {
          // If sending via kmail, condense all responses into a single kmail
          if (
            response.length > 1 &&
            (source == "kmail" || response.every((r) => r.enforceKmail == true))
          ) {
            const newResponse: CommandResponse = {
              message: response.map((r) => r.message).join("\n")
            };

            await this.respond("kmail", fromId, fromName, newResponse);
          } else {
            for (const res of response) {
              await this.respond(source, fromId, fromName, res);
            }
          }
        } else {
          await this.respond(source, fromId, fromName, response);
        }
      } catch (e) {
        if (e instanceof ErrorResponse) {
          console.log(`Hit error with ${fromName} (#${fromId}) - ${e.message}`);

          await this.respond(source, fromId, fromName, {
            message: e.message
          });
        } else {
          console.log(e);
          await this.respond(source, fromId, fromName, {
            message: "I'm sorry, I had an error trying to process that."
          });
        }
      }

      return;
    }

    await this.respond(source, fromId, fromName, {
      message:
        "I'm sorry, I did not recognize that. Send me 'help' for help or read up at https://github.com/libraryaddict/DiscordChat"
    });
  }

  async respond(
    original: MessageSource,
    fromId: string,
    fromName: string,
    response: CommandResponse
  ) {
    console.log("Now responding to " + fromName + " with: " + response.message);

    if (original == "whisper" && response.enforceKmail != true) {
      await this.kolClient.sendWhisper(fromId, response.message);
    } else {
      await this.kolClient.sendKmail(fromId, response.message);
    }
  }

  async send(source: MessageSource, targetId: string, message: string) {
    if (source == "kmail") {
      await this.kolClient.sendKmail(targetId, message);
    } else if (source == "whisper") {
      await this.kolClient.sendWhisper(targetId, message);
    }
  }
}
