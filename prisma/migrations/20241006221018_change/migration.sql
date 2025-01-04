/*
  Warnings:

  - Made the column `identifier` on table `LoggingTarget` required. This step will fail if there are existing NULL values in that column.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_LoggingTarget" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "player" INTEGER NOT NULL,
    "identifier" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "targetData" TEXT NOT NULL,
    "displayname" TEXT,
    "avatar" TEXT,
    "created" INTEGER NOT NULL,
    "lastUse" INTEGER NOT NULL,
    "uses" INTEGER NOT NULL
);
INSERT INTO "new_LoggingTarget" ("avatar", "created", "displayname", "id", "identifier", "lastUse", "player", "target", "targetData", "uses") SELECT "avatar", "created", "displayname", "id", "identifier", "lastUse", "player", "target", "targetData", "uses" FROM "LoggingTarget";
DROP TABLE "LoggingTarget";
ALTER TABLE "new_LoggingTarget" RENAME TO "LoggingTarget";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
