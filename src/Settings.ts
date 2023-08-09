import { readFileSync } from "fs";
import { ChannelFlag, ChannelId, KolAccountType } from "./utils/Typings";

export class Settings {
  getAccountLogins(): AccountLogins {
    return JSON.parse(readFileSync("./data/Settings.json", "utf-8") || "{}");
  }

  getResponses(): Map<string, string[]> {
    const settings = JSON.parse(
      readFileSync("./data/Reactions.json", "utf-8") || "{}"
    ) as ResponseSetting[];
    const map = new Map();

    for (const responseSetting of settings) {
      map.set(responseSetting.message, responseSetting.responses);
    }

    return map;
  }

  getChannelIds(): ChannelId[] {
    const channels: ChannelId[] = [];

    const settings = JSON.parse(
      readFileSync("./data/Channels.json", "utf-8") || "{}"
    ) as ChannelSettings;

    // These channels want these groups to be added to them
    const listeningToTheseGroups: Map<string, ChannelId[]> = new Map();
    // These channels belong in these groups
    const channelsAreInGroups: Map<string, ChannelId[]> = new Map();

    for (const channel of settings.channels) {
      const chan: ChannelId = {
        owningAccount: channel.owner,
        name: channel.name,
        icon: channel.icon,
        webhook: channel.webhook,
        listensTo: [],
        side: channel.side,
        holderId: channel.holderId,
        channelId: channel.channelId,
        uniqueIdentifier: channel.id ?? channel.holderId + "/" + channel.channelId,
        flags: channel.flags ?? [],
      };

      channels.push(chan);

      for (const id of [channel.owner, chan.uniqueIdentifier]) {
        if (id == null) continue;

        if (!channelsAreInGroups.has(id)) {
          channelsAreInGroups.set(id, []);
        }

        channelsAreInGroups.get(id)?.push(chan);
      }

      if (channel.listensTo != null) {
        for (const listeningTo of channel.listensTo) {
          if (!listeningToTheseGroups.has(listeningTo)) {
            listeningToTheseGroups.set(listeningTo, []);
          }

          listeningToTheseGroups.get(listeningTo)?.push(chan);
        }
      }
    }

    for (const group of settings.groups) {
      if (!channelsAreInGroups.has(group.name)) {
        channelsAreInGroups.set(group.name, []);
      }

      const addToGroup = channelsAreInGroups.get(group.name);

      for (const channelId of group.channels) {
        const channels = channelsAreInGroups.get(channelId);

        if (channels == null) {
          console.log("Unable to find a channel by '" + channelId + "'");
          continue;
        }

        for (const channel of channels) {
          if (addToGroup?.includes(channel)) continue;

          addToGroup?.push(channel);
        }
      }
    }

    // Now we add all the channels to the listeners
    for (const [key, channels] of listeningToTheseGroups) {
      const channelsInGroup = channelsAreInGroups.get(key);

      if (channelsInGroup == null) {
        console.log("Wanted to listen to '" + key + "' but no channels are registered to it");
        continue;
      }

      for (const channel of channels) {
        for (const channelInGroup of channelsInGroup) {
          if (channel.listensTo.includes(channelInGroup)) continue;

          channel.listensTo.push(channelInGroup);
        }
      }
    }

    return channels;
  }
}

type ResponseSetting = {
  message: string;
  responses: string[];
};

type GroupSettings = {
  name: string;
  channels: string[];
};

type ChannelSetting = {
  id: string;
  owner: string;
  name?: string;
  icon?: string;
  webhook?: string;
  side: "KoL" | "Discord";
  holderId: string;
  channelId?: string;
  listensTo: string[];
  flags?: ChannelFlag[];
};

type ChannelSettings = {
  groups: GroupSettings[];
  channels: ChannelSetting[];
};

export type KolLogin = {
  username: string;
  password: string;
  type: KolAccountType;
};

export type AccountLogins = {
  discordToken: string;
  kolLogins: KolLogin[];
  ignoreChat: string[];
};
