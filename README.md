This is a chat relay meant to be between different clans and discord.

And to listen to public channels.

This will never send messages to any public channels, only to /clan

The settings.json file will let you define a discord token for the bot that will be used.
And the kol logins for the kol accounts it will use.

The logging for this isn't as informative as it could be, it isn't really aimed towards public consuming.

The three major uses of this bot are

1. Inter-clan communication, using kol account per clan
2. Public kol chat (games, newbie, etc) > Discord
3. Both of the above, and including discord chat in the inter-clan chat

Obviously while its using those kol accounts, you can't use them.
If you want profanity in your chat, toggle it in the kol settings first.
The kol accounts must have access to chat, which needs verified email and to pass the literacy test. I'm not doing that for you.

There are three settings files. They must be copied from `data-example` to `data` folder.

# Channels.json

This controls what channels are being listened to.
If channel A and B are listening to each other, its effectively cross clan chat.

A group is an easy way to define a list of channels without having to rewrite that list for every single channel entry
Examples should be sufficient there.

The channels has several fields.

id: The unique ID for this channel. I recommend the syntax "<side>/<channel>/<owner>" or so that makes it easy to recognize names. The IDs are never public facing.
name: This is only used for "webhook" and will change the discord bot name so you can see "Average Chat" posting a message. Indicating which clan it was from. Or change this to "Carrot" and it'll post as the name "Carrot"
owner: The kol account this will be listening on, or "Discord" for the discord itself
side: If its Discord, or "KoL". This is fairly obvious
holderId: If using discord, this is the server ID. If using kol, this is the channel name
channelId: This only applies to discord, this is the channel ID
webhook: This may change, but is used to post bot messages under different names than just the server nickname
listensTo: This is an array of either group names, or channel IDs that will send their messages to this channel
flags: This currently only has the flag "responses" which is basically autoreplies

# Reactions.json

This is a list of autoreplies a bot will make when a keyword is said in a channel which has the flag "responses"

# Settings

This contains several types of entries.
The first is a discord bot token. Omit this if discord will not be used.
The second is a list of kol accounts that this bot will use.

The username and password is obvious for kol account, the "type" has no real meaning to it. But if its set to "IGNORE" then the bot will not log into the account.

The last is "ignoreChat" which tells the bot to ignore any messages said by these kol players

# Other stuff

The bot will attempt to remove chat effects on itself, but it must be stocked with soft green antidote to remove it. The bot will/should send messages to clan if a clan chat is registered, and to discord. To beg for some.

# Afternotes

This bot will not restart when a config setting has changed, this bot is best run on a loop wrapper as it isn't 100% uptime (Mostly just network errors)
This bot doesn't have the cleanest code
This bot was not created with the intention of making it easy for anyone to use, but efforts has been made to have it generic.

Never have your bot send messages to public channels, even assuming the mods don't mind. If someone on discord says something offensive, it is you that will take the fall. Your account said it.
I am not setting up your discord bot for you, remember to give the bot permissions to post in places.
I would not talk about the bot in public chat, since it could be seen as a "I am logging what you say" which can be offensive.
For the love of god, don't use this to spy on clans.