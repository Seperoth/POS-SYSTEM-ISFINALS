# POS-SYSTEM-ISFINALS

Independent group project based on **Universal POS 2.4.1**. The POS features are copied from the current working release: offline sales and saved receipts, a client-managed menu, FOOD/DRINKS/CONFECTIONERY/EXTRAS colors, direct menu ordering, immediate held-order cancellation, sales reports, Bluetooth receipt printing, export, backup and restore. New installations start with an empty menu and no sales.

This is a standalone repository, not a fork or an automatically synchronized mirror. Your group can alter its content without changing the client's Universal POS. The original task will leave this repository alone unless Jojo explicitly requests changes.

## Run the project

Install Node.js **22.13 or newer** and Git, then run:

```powershell
git clone https://github.com/Seperoth/POS-SYSTEM-ISFINALS.git
cd POS-SYSTEM-ISFINALS
npm ci
npm run dev
```

Open http://localhost:5180 on the same computer. Keep the terminal running. Use Ctrl+C to stop it. You can also use `npm start` to start the preview in the background. `npm run dev:prod` previews production mode at http://localhost:5181.

The browser preview supports POS flows and local records. Native Bluetooth printing requires an Android APK with the included native module; it does not work in the browser or stock Expo Go. Each device/browser has its own local data.

## Working as a group

The owner can invite members at [repository collaborators](https://github.com/Seperoth/POS-SYSTEM-ISFINALS/settings/access). Each member accepts the invitation using their own GitHub account.

```powershell
git switch main
git pull --ff-only
git switch -c codex/your-change
# Edit the project, then verify it:
npm test
npm run build
git add .
git commit -m "Describe your change"
git push -u origin codex/your-change
```

Open a pull request into main for your teammates to review. Group pushes run tests and a web build only. They do not deploy the app.

## Independent Android setup

- App identities: `com.seperoth.possystemisfinals` and `com.seperoth.possystemisfinals.dev`. They can coexist with the client app and use separate native storage.
- Expo owner/project linkage and update URL are removed. OTA updates are disabled, and manual update commands deliberately stop. No client Expo token, signing key or business records were copied.
- For cloud APK builds or your own updates, create a separate Expo project/account setup and new signing credentials. Configure your own project ID, update channels and runtime versions before enabling OTA. See [ANDROID.md](ANDROID.md).
- Do not install the original client's APK to test this project: it runs the client app and receives that app's updates.

## Source baseline

Initial code: Universal POS 2.4.1, commit `0b6bbf10b2b32d315ded326abb6c40ccd05a216b`. The initial group commit is tagged `baseline-v2.4.1`. The group repository has its own Git history. Isolation changes only concern project identity, update publishing, preview ports, checks and handoff documentation; POS functionality is retained.

See [CONTRIBUTING.md](CONTRIBUTING.md), [DESIGN.md](DESIGN.md) and [CHANGELOG.md](CHANGELOG.md) for implementation and inherited feature history.
