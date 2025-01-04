/*
  Warnings:

  - You are about to alter the column `created` on the `LoggingEditor` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - You are about to alter the column `lastUse` on the `LoggingEditor` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_LoggingEditor" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "player" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "created" INTEGER NOT NULL,
    "lastUse" INTEGER NOT NULL,
    "melting" BOOLEAN NOT NULL
);
INSERT INTO "new_LoggingEditor" ("created", "id", "identifier", "lastUse", "melting", "name", "player") SELECT "created", "id", "identifier", "lastUse", "melting", "name", "player" FROM "LoggingEditor";
DROP TABLE "LoggingEditor";
ALTER TABLE "new_LoggingEditor" RENAME TO "LoggingEditor";
CREATE UNIQUE INDEX "LoggingEditor_player_name_key" ON "LoggingEditor"("player", "name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
