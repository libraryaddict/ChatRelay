import axios, { AxiosInstance } from "axios";
import { CookieJar } from "tough-cookie";
import { HttpCookieAgent, HttpsCookieAgent } from "http-cookie-agent/http";
import { Settings } from "../Settings";

export function createClient(baseUrl?: string): AxiosInstance {
  const jar = new CookieJar();
  const settings = new Settings().getAccountLogins();

  return axios.create({
    timeout: 30000,
    baseURL: baseUrl,
    headers: {
      "User-Agent":
        "https://github.com/libraryaddict/KoLDiscordChat - " +
        settings.playerLoggingAccount,
    },
    httpAgent: new HttpCookieAgent({ cookies: { jar } }),
    httpsAgent: new HttpsCookieAgent({ cookies: { jar } }),
  });
}
