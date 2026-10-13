import express, { Request, Response } from "express";
import { AxiosInstance } from "axios";

export function startRelayServer(
  port: number,
  username: string,
  axios: AxiosInstance,
) {
  const app = express();
  app.use(express.raw({ type: "*/*" }));

  app.get("/health", (req: Request, res: Response) => {
    res.sendStatus(200);
  });

  app.all("{*any}", async (req: Request, res: Response) => {
    if (req.url === "/") {
      res.redirect(302, "/game.php");

      return;
    }

    try {
      const target = req.url.startsWith("/otherimages/")
        ? "https://images.kingdomofloathing.com"
        : "https://www.kingdomofloathing.com";

      const r = await axios({
        method: req.method,
        url: target + req.url,
        headers: { "content-type": req.headers["content-type"] },
        data: req.body,
        responseType: "arraybuffer",
        maxRedirects: 0,
        validateStatus: () => true,
      });

      // The session lives in the bot's cookie jar, not the browser
      const {
        "set-cookie": _,
        "transfer-encoding": __,
        ...headers
      } = r.headers;
      res.status(r.status).set(headers);

      let body = r.data;

      if (String(r.headers["content-type"]).includes("text/html")) {
        body = Buffer.from(
          Buffer.from(body)
            .toString("utf8")
            .replace(
              /https:\/\/images\.kingdomofloathing\.com\/otherimages\//g,
              "/otherimages/",
            ),
          "utf8",
        );
      }

      res.send(body);
    } catch (e) {
      console.error(`Relay request failed for ${username}:`, e);
      res.sendStatus(502);
    }
  });

  app.listen(port);
  console.log(`Relay server for ${username} listening on port ${port}`);
}
