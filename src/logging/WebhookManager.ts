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
  errorOnRateLimit?: boolean;
}

interface QueuedRequest {
  data: WebhookData;
  resolve: (value: string) => void;
  reject: (reason?: any) => void;
}

const webhookQueues: { [key: string]: QueuedRequest[] } = {};
const isQueueProcessing: { [key: string]: boolean } = {};

async function processQueue(url: string): Promise<void> {
  if (
    isQueueProcessing[url] ||
    !webhookQueues[url] ||
    webhookQueues[url].length === 0
  ) {
    isQueueProcessing[url] = false;

    return;
  }

  isQueueProcessing[url] = true;
  const { data, resolve, reject } = webhookQueues[url].shift()!;

  try {
    // We call the original function again, but this time it will actually send.
    // We add errorOnRateLimit: true to ensure it doesn't get re-queued by the same mechanism.
    const messageId = await postToWebhook({ ...data, errorOnRateLimit: true });
    resolve(messageId);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 429) {
      // If we hit a rate limit while processing the queue, put it back at the front
      webhookQueues[url].unshift({ data, resolve, reject });
      const retryAfter = (error.response.data.retry_after || 1) * 1000;
      setTimeout(() => processQueue(url), retryAfter);

      return; // Exit to wait for the timeout
    }

    // For other errors, reject the original promise
    reject(error);
  }

  // Process the next item
  processQueue(url);
}

export async function postToWebhook(data: WebhookData): Promise<string> {
  const { url, errorOnRateLimit = false } = data;

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
    url +
    (data.editMessage != null ? "/messages/" + data.editMessage : "") +
    (data.wait == true && data.editMessage == null ? "?wait=true" : "");

  try {
    let res;

    if (data.editMessage != null) {
      res = await axios.patchForm(urledParams, { payload_json: jsoned });
    } else {
      res = await axios.postForm(urledParams, { payload_json: jsoned });
    }

    return res.data["id"];
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 429) {
      if (errorOnRateLimit) {
        throw error;
      }

      // If queuing is allowed, return a promise that resolves when the queue processes it
      return new Promise((resolve, reject) => {
        if (!webhookQueues[url]) {
          webhookQueues[url] = [];
        }

        webhookQueues[url].push({ data, resolve, reject });

        const retryAfter = (error.response.data.retry_after || 1) * 1000;

        // Start the queue processor only if it's not already running for this URL
        if (!isQueueProcessing[url]) {
          setTimeout(() => processQueue(url), retryAfter);
        }
      });
    }

    // For any other error, re-throw it
    throw error;
  }
}
