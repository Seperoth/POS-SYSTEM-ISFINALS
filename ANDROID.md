# Group Android setup

This project is independent of the Universal POS client app. Its package IDs are com.seperoth.possystemisfinals and com.seperoth.possystemisfinals.dev. OTA updates are disabled and no Expo owner/project is linked.

## Desktop first

Use npm ci and npm run dev at http://localhost:5180. The browser preview has local records but cannot use native Bluetooth printing. Expo Go does not contain the custom printer module.

## Creating the group's APK

For local builds, use Android Studio, a compatible Java installation and the Android SDK. On Windows use a short checkout path (for example C:\ispos) because of native build path limits. Run npm ci and npm run build:android:dev (test app) or npm run build:android (production app). The build script creates new local signing material for this group project; keep it private and back it up. It is required to update that APK in place.

For cloud builds, sign in to the group's chosen Expo account, create a NEW project for pos-system-isfinals and link its own project ID. Configure new Android signing credentials before using the cloud build profiles. Existing profiles expect local credentials; provide the group's credentials or deliberately change that setting for the group's EAS-managed keys. Never copy client credentials or link the client Expo project.

Install the resulting group APK on Android. It starts with empty local records. Do not use the client's old APK download. Bluetooth printing still requires a Bluetooth Classic SPP / ESC/POS printer and physical testing. Pair it in Android, select it in Settings and test printing.

## Group updates

Initially use a new APK signed with the group's same key, installed over its previous group APK. Do not uninstall or clear data. For OTA later, configure a separate Expo project, enable updates, add its own update URL/runtime/channel mapping, and intentionally replace the blocked scripts/publish-update.mjs command. The check-only GitHub workflow never publishes. Any new workflow must use the group's own secrets.

Before live use, verify offline reopening, receipt printing, exports, backup/restore and data-preserving upgrades on a spare Android device. Sales, menus, held orders and receipt copies remain local to each device.
