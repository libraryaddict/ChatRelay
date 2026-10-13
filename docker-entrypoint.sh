#!/bin/sh
set -e

if node -e "const s = require('./data/Settings.json'); process.exit(s.playerLoggingAccount && s.discordToken ? 0 : 1)"; then
  npx prisma migrate deploy
fi

exec node dist/index.js
