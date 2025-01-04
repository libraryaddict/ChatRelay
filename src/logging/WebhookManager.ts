import axios from "axios";

export interface WebhookData {
  url: string;
  name?: string;
  message?: string;
  color?: number;
  image?: string;
  contentMessage?: string;
  embedColor?: string;
  embedTitle?: string;
  embedLines?: string[];
  avatar?: string;
  threadName?: string;
  wait?: boolean;
  editMessage?: string;
}

export async function postToWebhook(data: WebhookData): Promise<string> {
  const embed: any = {};

  if (data.embedTitle != null) {
    embed["title"] = data.embedTitle;
  }

  if (data.message != null) {
    embed["description"] = data.message;
  }

  if (data.embedLines != null && data.embedLines.length > 0) {
    embed["fields"] = [];

    for (const message of data.embedLines) {
      embed["fields"].push({ name: "\u200b", value: message, inline: true });
    }
  }

  const json: any = {};

  if (data.name != null) {
    json["username"] = data.name;
  }

  if (Object.keys(embed).length > 0) {
    if (data.color != null) {
      embed["color"] = data.color;
    }

    if (data.image != null) {
      embed["thumbnail"] = { url: data.image };
    }

    json["embeds"] = [embed];
  }

  if (data.avatar != null) {
    json["avatar_url"] = data.avatar;
  }

  if (data.contentMessage != null) {
    json["content"] = data.contentMessage;
  }

  if (data.threadName != null) {
    json["thread_name"] = data.threadName;
  }

  const jsoned = JSON.stringify(json);

  const urledParams =
    data.url +
    (data.editMessage != null ? "/messages/" + data.editMessage : "") +
    (data.wait == true && data.editMessage == null ? "?wait=true" : "");

  let res;

  if (data.editMessage != null) {
    res = await axios.patchForm(urledParams, { payload_json: jsoned });
  } else {
    res = await axios.postForm(urledParams, { payload_json: jsoned });
  }

  return res.data["id"];
}
