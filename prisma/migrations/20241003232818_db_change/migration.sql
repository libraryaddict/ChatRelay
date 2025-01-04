-- CreateTable
CREATE TABLE "UserLink" (
    "kolId" TEXT NOT NULL PRIMARY KEY,
    "discordId" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "UserLink_kolId_key" ON "UserLink"("kolId");
