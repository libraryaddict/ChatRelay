# Script (KoL to Discord)

There is a service, `DiscordChat (#3626070)`, that allows you to send messages from _Kingdom of Loathing_ to yourself on Discord via DMs and channel webhooks. This is useful for scripts to send you progress updates or alert you to issues. The clientside library for this feature is a separate project: <https://github.com/libraryaddict/KoLDiscordChat>
This is a one-way transfer, you deliberately cannot send messages from Discord to KoL.

A public Discord server exists primarily to support this service, as a shared server between the user and the bot is required for easy setup of Direct Messages.

# Game Chat Relay

In addition to script notifications, the public server also uses this repository's software (`ChatRelay`) to provide a read-only feed of in-game chat channels. This allows you to catch up on conversations you missed.

- **To join the public server,** check the in-game profile of `DiscordChat (#3626070)`.
- **To run this chat relay on your own server,** you will need your own bot using the code in this repository. See the introduction below.

# Github Introduction

This is a chat relay meant to be between different clans and discord.

And to listen to public channels.

This will never send messages to any public channels, only to `/clan`

The `settings.json` file will let you define a discord token for the bot that will be used.
And the kol logins for the kol accounts it will use.

The logging for this isn't as informative as it could be, it isn't really aimed towards public consuming.
The configuration format for this is also lame. You were warned.

The three major uses of this bot are

1.  Inter-clan communication, using kol account per clan
2.  Public kol chat (games, newbie, etc) > Discord
3.  Both of the above, and including discord chat in the inter-clan chat

Obviously while its using those kol accounts, you can't use them.
If you want profanity in your chat, toggle it in the kol settings first.
The kol accounts must have access to chat, which needs verified email and to pass the literacy test. I'm not doing that for you.

There are three settings files. They must be copied from `data-example` to `data` folder.

# Channels.json

This controls what channels are being listened to.
If channel A and B are listening to each other, its effectively cross clan chat.

A `group` is an easy way to define a list of channels without having to rewrite that list for every single channel entry
Examples should be sufficient there.

The channels has several fields.

`id`: The unique ID for this channel. I recommend the syntax `<side>/<channel>/<owner>` or so that makes it easy to recognize names. The IDs are never public facing.
`name`: This is only used for "webhook" and will change the discord bot name so you can see "Average Chat" posting a message. Indicating which clan it was from. Or change this to "Carrot" and it'll post as the name "Carrot"
`owner`: The kol account this will be listening on, or "Discord" for the discord itself
`side`: If its "Discord", or "KoL". This is fairly obvious
`holderId`: If using discord, this is the server ID. If using kol, this is the channel name
`channelId`: This only applies to discord, this is the channel ID
`webhook`: This may change, but is used to post bot messages under different names than just the server nickname
`listensTo`: This is an array of either group names, or channel IDs that will send their messages to this channel
`flags`: This currently only has the flag "responses" which is basically autoreplies

The `holderId` can be set to `rollover` which will output rollover messages, or `system` which will output any other system message, including resolving an update to a changelog.

# Reactions.json

This is a list of autoreplies a bot will make when a keyword is said in a channel which has the flag `responses`

# Settings

This contains several types of entries.
The first is a discord bot token. Omit this if discord will not be used.
The second is a list of kol accounts that this bot will use.

The `username` and `password` is obvious for kol account, the `type` has no real meaning to it. But if its set to `IGNORE` then the bot will not log into the account.

An account can also set `relayPort`, which starts a relay server on that port. Opening `http://localhost:<port>` in a browser lets you play as that account using the bot's session, anyone who can reach the port can too.

The last is `ignoreChat` which tells the bot to ignore any messages said by these kol players

# Other stuff

The bot will attempt to remove chat effects on itself, but it must be stocked with soft green antidote to remove it. The bot will/should send messages to clan if a clan chat is registered, and to discord clan. If there is no clan chat, it will log it, but not do anything.

# Running with Docker

Docker runs the bot in a self-contained box called a container. You don't need to install Node.js or build anything yourself, and the bot restarts automatically if it crashes or the computer reboots.

## 1. Install Docker

- **Windows or Mac:** install [Docker Desktop](https://www.docker.com/products/docker-desktop/) and start it. Leave it running while you use the bot.
- **Linux:** install Docker Engine by following the guide for your distribution at <https://docs.docker.com/engine/install/>.

To check that it works, open a terminal (on Windows, use PowerShell) and run:

```
docker --version
```

If that prints a version number, Docker is installed.

## 2. Get the bot

Download this project and open a terminal in its folder. That's the folder containing `Dockerfile` and `docker-compose.yml`. All of the commands below are run from this folder.

## 3. Set up your settings

Copy the `data-example` folder and name the copy `data`. Then edit the files inside `data` as described in the sections above (Channels.json, Reactions.json and Settings).

The bot reads everything from the `data` folder, and it saves its own files there too. Whenever you change a setting, restart the bot (step 6) so it picks up the change.

## 4. Start the bot

```
docker compose up -d --build
```

The first run takes a few minutes while Docker downloads and builds everything. After that, the bot runs in the background, so you can close the terminal.

## 5. Check that it's working

To see what the bot is printing:

```
docker compose logs -f
```

Press Ctrl+C to stop watching. That only closes the log view, and the bot keeps running.

To see whether the bot is running:

```
docker compose ps
```

The `STATUS` column shows `Up` while it's running, followed by `healthy` or `unhealthy`. The health check section below explains what that means.

## 6. Stop, restart and update

- To stop the bot: `docker compose down`
- To restart it after changing settings: `docker compose restart`
- To update to a newer version, download the new version of this project into the same folder, keeping your `data` folder, then run `docker compose up -d --build` again.

## The relay server

The relay server is optional. It lets remote into a logged in bot account using your browser so that you can check on it or play without turning the bot off.

To turn it on, add `"relayPort": 3000` to that account in `data/Settings.json`:

```json
{
  "username": "Prince Libraryaddict",
  "password": "princelib12345",
  "type": "PUBLIC",
  "relayPort": 3000
}
```

Restart the bot, then open <http://localhost:3000> in a browser on the same computer.

A port is a number that tells the computer which program a connection is for. Docker only lets connections into the container through the ports listed under `ports` in `docker-compose.yml`. Port 3000 is already listed there. If you want to relay more than one account, give each account a different `relayPort`, for example 3000 and 3001, and add each one to `docker-compose.yml` like this:

```yaml
ports:
  - "3000:3000"
  - "3001:3001"
```

Anyone who can reach that port will have full control as if they were logged in. That includes other people on your home network. Don't forward the port on your router.

Logging out through the relay also logs the bot out. The bot logs back in by itself.

## Health check

Docker regularly asks each relay server whether it's still answering. If one stops answering, `docker compose ps` shows the bot as `unhealthy`, which is a sign to look at the logs. Docker doesn't restart the bot because of this.

If no account has a `relayPort`, there's nothing to check, and the bot always shows as `healthy`.

## The database

The bot only uses a database for player logging. That needs both `playerLoggingAccount` and `discordToken` in `Settings.json`. When both are set, the bot creates `data/database.db` and keeps it up to date by itself. Back that file up along with the rest of the `data` folder.

# Afternotes

This bot will not restart when a config setting has changed, this bot is best run on a loop wrapper as it doesn't promise 100% uptime (Mostly just network errors)
This bot doesn't have the cleanest code
This bot was not created with the intention of making it easy for anyone to use, but efforts has been made to have it generic.

Never have your bot send messages to public channels, even assuming the mods don't mind. If someone on discord says something offensive, it is you that will take the fall. Your account said it.
I am not setting up your discord bot for you, remember to give the bot permissions to post in places.
I would not talk about the bot in public chat, since it could be seen as a "I am logging what you say" which can be offensive.
For the love of god, don't use this to spy on clans.
