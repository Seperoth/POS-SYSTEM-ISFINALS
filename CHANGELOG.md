# Changelog

This group project starts from Universal POS 2.4.1. Entries below are inherited feature history. The group baseline uses independent app IDs and runtimes, disables client Expo updates, and runs check-only automation.

## 2.4.1 - 2026-11-08

- Cancel order immediately removes the selected held order without a confirmation popup. The held list stays open; current orders, other holds and saved sales are preserved.

## 2.4.0 - 2026-11-08

- Added Cancel order to each held order, with customer/item/total confirmation and Keep order. Cancellation removes only the selected unpaid held draft and persists locally.
- Protected current orders, other holds, saved sales and printer jobs. Resume/cancel operations read the latest saved state so queued actions cannot resurrect a cancelled order or duplicate a current draft.
- Added EXTRAS as a designated menu category, using purple cards and category controls. EXTRAS is available when creating or editing menu items and in menu filters.

## 2.3.1 - 2026-11-08

- Removed the separate plus button from menu cards. The whole card, including the price and padding, now adds the item with one tap.
- In Manage menu, the whole card opens its editor. Category colors, saved records and direct ordering are preserved.

## 2.3.0 - 2026-11-08

- Replaced free-text categories with required FOOD, DRINKS and CONFECTIONERY choices for new or edited menu items.
- FOOD menu cards and category controls use red, DRINKS blue and CONFECTIONERY green, with readable contrast and category labels.
- Recognized explicit legacy category names without overwriting client data. Unrecognized old categories remain under All menu until the owner assigns a category.
- Added confirmed menu-item removal in Manage menu. Current and held orders are protected; saved receipts, reports, printer jobs and archived data are retained. Removal persists in local storage and backups.
- Kept the existing production native runtime and separate development/production channels for Wi-Fi updates.

## 2.2.0 - 2026-11-04

- Tapping a menu product adds it directly to Current order without a customization popup. Repeated taps combine unchanged items.
- Enlarged product names to 26 px, prices to 21 px, action buttons to at least 56 px and Charge to 64 px. Menu columns adapt to the available tablet width.
- Split Current order into a live receipt preview above and item/order controls below. Customer name, items, options, discount and total match the saved receipt.
- Select an item in the receipt preview to change quantity, size or extras using inline controls. Required choices block payment until selected.
- Removed Item note, Discount (₱) and Order note inputs from Current order. Existing saved receipts and historical discount totals are preserved.
- Kept development/production channels separate and the existing native runtime compatible. Menus, local sales, saved receipts and printer behavior are preserved.

## 2.1.0 - 2026-11-03

- Removed Inventory and Recipes tabs, stock controls, recipe editors and recipe requirements at checkout.
- Menu items are added and sold independently of stock. Existing menu, sales and receipts are preserved; legacy stock data stays archived in backups.
- Removed percentage discounts from Current order. Discounts use peso amounts; old unfinished/held percentage discounts retain their value after conversion.
- Removed Card from new payments. Cash, GCash and Maya remain. Old Card sales still reconcile in historical reports.
- Added printable sales summaries for Today and All time. Purchases across receipts are grouped by customer name with item quantities, discounts, customer totals and a grand total.
- Sales reports share the durable printer queue, review/retry and full backup/restore without creating extra sales.
- Removed the technical note under App updates.
- Added separate development/production apps, data, update channels, Git branches and checks before publication.
- Added version tracking, a version-bump command, release notes and preserved the prior release as Git tag v2.0.0.

## 2.0.0 - saved 2026-11-03

- Original Expo Android POS, local SQLite, inventory/recipes, immutable receipts, Bluetooth printing, full backup/restore and production Wi-Fi updates.
- Saved source: `v2.0.0` / `bbe35f0`. Saved Android APK: version 2.0.0, build 20003.
