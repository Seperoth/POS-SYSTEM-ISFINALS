# Group versions

The starting model is Universal POS 2.4.1, copied from source commit 0b6bbf10b2b32d315ded326abb6c40ccd05a216b. Tag baseline-v2.4.1 saves the group's isolated starting point. Earlier entries in CHANGELOG.md describe inherited functionality, not releases published from this repository.

Work on feature branches and review pull requests into main. Use npm run version:bump -- patch (or minor/major), add a changelog entry, run npm test and npm run build, then commit and push. The only configured workflow checks tests and builds the browser export. It never publishes Android updates.

Production runtime is pos-system-isfinals-production-1; development runtime is pos-system-isfinals-development-1. Both belong only to this group project. OTA is disabled until the group explicitly creates and configures its own Expo project. Native changes require an appropriate new runtime and signed APK.

Group signing keys, Expo tokens and business backups stay outside Git. Never use the client's signing key or project ID. Git tags save source, not device business records. Save full backups outside the device before replacing an APK or restoring data.
