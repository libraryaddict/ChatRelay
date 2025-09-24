import { appendFile } from "fs";
import { ChatManager } from "./ChatManager";

process.on("uncaughtException", (err) => {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} - Uncaught Exception: ${
    err.stack || err.message
  }\n`;

  appendFile("error.log", logMessage, (error) => {
    if (error) {
      console.error("Failed to write to error log:", error);
    }
  });

  console.error(logMessage);
});

new ChatManager().startChannels();
