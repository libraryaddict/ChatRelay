export type KOLCredentials = {
  sessionCookies: string;
  pwdhash: string;
};

export interface KoLUser {
  name: string;
  id: string;
}

export interface ChatUser extends KoLUser {
  color?: string;
}

export type MessageType = "private" | "public" | "event" | "system";
export type MessageFormat = null | "0" | "1" | "2" | "3" | "4" | "98" | "99";
export type PublicMessageType =
  | "normal"
  | "emote"
  | "system"
  | "mod warning"
  | "mod announcement"
  | "event"
  | "welcome"
  | "bot";

export type KOLMessage = {
  type: MessageType;
  time?: string;
  channel?: string;
  mid?: string;
  who?: ChatUser;
  for?: ChatUser;
  format?: MessageFormat;
  msg?: string;
  link?: string;
  notnew?: string; // Only seen "1"
};

export type KolKmail = {
  id: string; // ID of the kmail itself
  type: string; // Not sure if it can be anything but 'normal'
  fromid: string; // The player ID this is from
  fromname: string; // The sender name
  message: string; // The actual message, can contain html & \n
  azunixtime: string; // Seconds epoch
  localtime: string; // The local time (as per account settings in kol)
};

export type ServerSide = "Discord" | "KoL";
export type KolAccountType = "CLAN" | "PUBLIC" | "IGNORE";

export type ChannelId = {
  owningAccount: string;
  name?: string; // May be null
  icon?: string; // May be null
  listensTo: ChannelId[]; // This channel gets messages from channels in this array
  side: ServerSide;
  // The following are internal use
  holderId: string; // What discord server or kol channel owns this
  channelId?: string; // The discord channel ID, or clan/talkie ID
  flags: ChannelFlag[];
  webhook?: string; // Used for discord only to create messages with a different username

  // A unique identifier is created from the holder ID, and the channel ID
  uniqueIdentifier: string;
};

export type KolEffect = {
  name: string;
  turns: number;
  effectId: string;
};

export interface ChatMessage {
  from: ChannelId;
  sender: string;
  message: string;
  formatting: PublicMessageType | undefined;
  encoding: BufferEncoding;
  previewLinks?: boolean;
}

export interface ChatChannel {
  isOwner(channelId: ChannelId): boolean;

  sendMessageToChannel(target: ChannelId, message: ChatMessage): Promise<void>;

  start(): Promise<void>;
}

export type ChannelFlag = "responses" | "some flag name";

export type ModeratorName = {
  id: string;
  name: string;
};
