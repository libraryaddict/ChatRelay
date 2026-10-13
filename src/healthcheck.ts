import { get } from "http";
import { Settings } from "./Settings";

const ports = new Settings()
  .getAccountLogins()
  .kolLogins.filter((login) => login.relayPort && login.type != "IGNORE")
  .map((login) => login.relayPort);

Promise.all(
  ports.map(
    (port) =>
      new Promise<void>((resolve, reject) => {
        get(`http://localhost:${port}/health`, (res) => {
          res.resume();

          if (res.statusCode == 200) {
            resolve();
          } else {
            reject();
          }
        }).on("error", reject);
      }),
  ),
).then(
  () => process.exit(0),
  () => process.exit(1),
);
