# Universal POS interface

The counter flow is menu → current order → payment confirmation → saved receipt/preparation. The whole menu card is a single button, including its price and padding; there is no separate plus button. Tapping adds its first size/serving directly to Current order, without a dialog. Repeated taps combine an unchanged item; sizes and extras are edited within the order. Required options must be chosen before payment. In Manage menu, tapping anywhere on a card opens its editor. New installations are empty; the client configures the business.

The palette is grey/white with charcoal active controls, dark text and green plus icons. Surfaces, cards, fields, tabs, dialogs and buttons have square corners. Roboto is bundled locally at regular, medium and bold weights. Menu names are 26 px, prices 21 px, descriptions 15 px; action buttons are at least 56 px high and Charge is 64 px high. Menu columns adapt to the available menu width, keeping cards readable beside the order panel.

Menu categories are fixed: FOOD uses red (#b42318), DRINKS blue (#1d4ed8), CONFECTIONERY green (#166534) and EXTRAS purple (#7e22ce). Menu cards use solid category colors with white text; category controls use matching pale backgrounds when unselected and solid fills when selected. All menu stays neutral. Category text accompanies color. The receipt remains a white paper surface. Legacy items without a recognized category keep a neutral card marked Choose category until assigned in the editor.

Manage menu opens the item editor with a Remove menu item action. Removal requires a confirmation naming the product, protects current/held orders, and preserves historical receipts. Cancelling returns to the unsaved editor form.

Held orders show Resume order and a red outlined Cancel order action for each row. Tapping Cancel order immediately removes only that held order without a confirmation popup. The list stays open and its count updates; an empty list says No held orders. The list footer says Close to distinguish closing it from cancelling an order.

No logo, shop wordmark, product/recipe photos, hero, slogans, decorative dots, or persistent save-status message. Names, descriptions and prices form the menu cards. Main branch is centered in the header. Categories and dine-in/takeaway choices use text.

Five icon-only navigation controls are evenly spread across the bottom: POS, Orders, Reports, Settings and Help. The first two preserve the supplied SVG paths; all controls have accessible names and selected states.

At 900 px and wider with at least 540 px height, a full-height order panel sits beside the menu and extends to the screen bottom. It is 400 px wide, or 440 px on wider desktops. The navigation ends at its left border. Smaller devices use a persistent View order action above navigation, with the order panel opened over the main workspace. A product requiring a choice opens Current order on small screens. Navigation remains available and preserves the cart. Safe-area padding protects device navigation bars.

Current order has two equal sections below its heading. The upper section previews the customer name, ordered items/options and final total; tapping a receipt row selects that item. The lower section contains large quantity/remove buttons, size/extra choices, customer name, service type and payment/hold actions. Item note, discount and order note inputs are removed. Both sections scroll independently while Total and Charge remain visible. On very short screens or with the keyboard open, the preview uses 35% to leave more room for controls.

The receipt prioritizes customer name, quantities/items/options and total. Date/order ID and payment details are separate archive metadata. Printer faults are actionable statuses, while the sale remains committed. Empty screens provide direct setup actions without sample products.
