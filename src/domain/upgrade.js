import { clone, validateState } from './model.js';

// Keep the v2 database and legacy stock records for lossless backups/rollback.
// The POS no longer reads recipes or changes inventory during checkout.
export function upgradeState(state) {
  const next = clone(validateState(state));
  next.posVersion = '2.1';
  next.products.forEach(product => { product.trackInventory = false; });
  for (const draft of [next.draft, ...next.held.map(order => order.draft)]) {
    if (draft.discountType === 'percent') {
      const subtotal = draft.items.reduce((sum, item) => sum + item.unitCents * item.quantity, 0);
      draft.discount = Math.min(subtotal, Math.max(0, Math.round(subtotal * Math.min(100, Number(draft.discount || 0)) / 100))) / 100;
    }
    draft.discountType = 'amount';
  }
  return next;
}
