# Group contributions

Use Node.js 22.13+ and npm ci. Clone POS-SYSTEM-ISFINALS, create a feature branch, then open a pull request into main. Each group member needs their own GitHub account and an accepted collaborator invitation.

Run npm test and npm run build before review. The GitHub workflow repeats these checks without deployment. npm run dev serves the isolated desktop preview at http://localhost:5180.

## Code map

- src/App.jsx: workspace, menu, held orders, reports and settings.
- src/ui/: shared screens, order panel, controls and category colors.
- src/domain/model.js: menu, order and sale rules.
- src/domain/held-orders.js: targeted cancellation and safe resume from current persisted state.
- src/data/: local persistence and serialized writes.
- src/services/: platform files, printing and updates.
- modules/ and plugins/: Android native printer/device integration.
- tests/: domain, SQLite and environment checks.

Preserve saved sales and receipt copies when changing menu or order behavior. Check responsive phone/tablet layouts. Browser printing is not a substitute for testing with an Android device and supported physical printer.

Keep this repository separate from the client app. Do not copy client tokens, keys, customer records, backups or databases. Keep the independent package IDs and disabled update linkage unless explicitly setting up the group's own deployment. See ANDROID.md and AGENTS.md.
