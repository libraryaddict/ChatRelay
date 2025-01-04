-- CreateTable
CREATE TABLE "GameChannel" (
    "name" TEXT NOT NULL PRIMARY KEY,
    "public" BOOLEAN NOT NULL
);

-- CreateTable
CREATE TABLE "DiscordChannel" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "server" TEXT NOT NULL,
    "channel" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "ChannelLink" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "game" TEXT NOT NULL,
    "discord" INTEGER NOT NULL,
    "direction" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "LoggingTarget" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "player" INTEGER NOT NULL,
    "identifier" TEXT,
    "target" TEXT NOT NULL,
    "targetData" TEXT NOT NULL,
    "displayname" TEXT,
    "avatar" TEXT,
    "created" INTEGER NOT NULL,
    "lastUse" INTEGER NOT NULL,
    "uses" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "LoggingEditor" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "player" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "created" BIGINT NOT NULL,
    "lastUse" BIGINT NOT NULL,
    "melting" BOOLEAN NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "DiscordChannel_server_channel_key" ON "DiscordChannel"("server", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "LoggingEditor_player_name_key" ON "LoggingEditor"("player", "name");
