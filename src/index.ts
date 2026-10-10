import { appendFile } from "fs";
import { ChatManager } from "./ChatManager";

for (const method of ["log", "info", "warn", "error", "debug"] as const) {
  const original = console[method];

  console[method] = (...args: unknown[]) =>
    // The sv-SE locale formats as YYYY-MM-DD HH:mm:ss in local time
    original(`[${new Date().toLocaleString("sv-SE")}]`, ...args);
}

process.on("uncaughtException", (err) => {
  const message = `Uncaught Exception: ${err.stack || err.message}`;

  appendFile(
    "error.log",
    `${new Date().toISOString()} - ${message}\n`,
    (error) => {
      if (error) {
        console.error("Failed to write to error log:", error);
      }
    },
  );

  console.error(message);
});

new ChatManager().startChannels();
