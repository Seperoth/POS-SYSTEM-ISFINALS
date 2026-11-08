# Independent group repository

This is POS-SYSTEM-ISFINALS, an independent group project initialized from Universal POS 2.4.1 (source commit 0b6bbf10b2b32d315ded326abb6c40ccd05a216b).

- This repository is outside the ongoing Universal POS client task. That task must not inspect, edit, synchronize, publish or update this repository after its initial setup unless Jojo explicitly asks.
- Group members may modify this project through their own work and tasks. This boundary does not freeze the group's work.
- Keep this repository independent. Do not add the client repository as an upstream or reconnect its Expo project, update URL, runtimes, app IDs, signing keys or deployment secrets.
- Native app IDs are com.seperoth.possystemisfinals and com.seperoth.possystemisfinals.dev. OTA updates are disabled. GitHub Actions checks only; it does not deploy.
- Use Node.js 22.13+, npm ci, npm test and npm run build. Desktop preview uses port 5180 (5181 for production preview), separately from the client app.
- Never commit actual sales, backups, SQLite files, credentials or signing material. See README.md for group setup.
