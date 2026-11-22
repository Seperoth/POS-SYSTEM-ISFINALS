# Restaurant POS with Sales Forecasting

Restaurant POS for the Information Systems final project. A new installation opens with the 60-dish workbook menu and an empty sales history. The catalog uses the workbook's Appetizer, Entree, Drinks, Dessert and Sides categories. Open **Forecast** for daily and weekly dish projections from the KNIME Random Forest model. Use **Import KNIME CSV** to load a new run on the device.

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

See the [forecasting guide](forecasting/README.md) for the KNIME workflow, workbook export, data dictionary, model evaluation and architecture. On a device that already has POS data, use **Manage menu → Load workbook catalog** to add workbook dishes missing from that device.

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

## Source baseline

Initial code: Universal POS 2.4.1, commit `0b6bbf10b2b32d315ded326abb6c40ccd05a216b`. The initial group commit is tagged `baseline-v2.4.1`. The group repository has its own Git history. Isolation changes only concern project identity, update publishing, preview ports, checks and handoff documentation; POS functionality is retained.

See [CONTRIBUTING.md](CONTRIBUTING.md), [DESIGN.md](DESIGN.md) and [CHANGELOG.md](CHANGELOG.md) for implementation and inherited feature history.
