import { validateForecastRows } from './forecast.js';

export const SCHEMA = 1;
export const APP_ID = 'com.seperoth.possystemisfinals';
export const uid = (prefix = 'id') => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
export const money = value => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const cents = value => Math.round(Number(value) * 100);
export const clone = value => JSON.parse(JSON.stringify(value));
const finite = (v, label, min = 0) => {
  if (!Number.isFinite(Number(v)) || Number(v) < min) throw new Error(`${label} must be ${min === 0 ? 'zero or greater' : `at least ${min}`}.`);
  return Number(v);
};
export const blankState = () => ({
  schemaVersion: SCHEMA, products: [], ingredients: [], recipes: [], suppliers: [], sales: [], movements: [], printJobs: [], held: [],
  draft: { items: [], customer: '', note: '', service: 'Dine-in', discount: 0, discountType: 'amount' }, nextOrder: 1001,
  settings: { cashier: 'Cashier', stockManager: 'Manager', autoPrint: true, printerAddress: '', printerName: '', paperWidth: 58 },
});
export function validateProduct(product) {
  if (typeof product.name !== 'string' || !product.name.trim()) throw new Error('Enter an item name.');
  if (!Array.isArray(product.variants) || !product.variants.length) throw new Error('Add at least one size or serving.');
  if (!Array.isArray(product.modifierGroups)) throw new Error('Invalid item options.');
  if (new Set(product.variants.map(v => v.id)).size !== product.variants.length) throw new Error('Duplicate size IDs.');
  product.variants.forEach(v => { if (!v.name?.trim()) throw new Error('Name every size or serving.'); finite(v.price, 'Price'); });
  (product.modifierGroups || []).forEach(g => {
    if (!g.name?.trim() || !g.options?.length) throw new Error('Each option group needs a name and options.');
    if (!['single', 'multiple'].includes(g.mode)) throw new Error('Invalid option selection mode.');
    g.options.forEach(o => { if (typeof o.name !== 'string' || !o.name.trim()) throw new Error('Name every option.'); finite(o.price, 'Extra price'); });
  });
  return product;
}
export function makeCartItem(product, variantId, optionIds = [], quantity = 1, note = '', { allowIncomplete = false } = {}) {
  const variant = product.variants.find(v => v.id === variantId);
  if (!variant || product.active === false || product.deletedAt) throw new Error('This item is unavailable.');
  const options = [];
  for (const group of product.modifierGroups || []) {
    const selected = group.options.filter(o => optionIds.includes(o.id));
    if (group.required && !selected.length && !allowIncomplete) throw new Error(`Choose ${group.name.toLowerCase()}.`);
    if (group.mode !== 'multiple' && selected.length > 1) throw new Error(`Choose one ${group.name.toLowerCase()} option.`);
    options.push(...selected);
  }
  const qty = finite(quantity, 'Quantity', 1);
  if (!Number.isInteger(qty) || qty > 999) throw new Error('Quantity must be 1–999.');
  return { id: uid('line'), productId: product.id, variantId, optionIds: options.map(o => o.id), name: product.name,
    details: [variant.name, ...options.map(o => o.name)].join(' · '), quantity: qty, note,
    unitCents: cents(variant.price) + options.reduce((n, o) => n + cents(o.price), 0) };
}
export function missingChoices(product, optionIds = []) {
  return (product?.modifierGroups || []).filter(group => group.required && !group.options.some(option => optionIds.includes(option.id))).map(group => group.name);
}
export function addMenuItem(state, productId) {
  const product = state.products.find(item => item.id === productId);
  if (!product || product.active === false || product.deletedAt) throw new Error('This item is unavailable.');
  const item = makeCartItem(product, product.variants[0].id, [], 1, '', { allowIncomplete: true });
  const next = clone(state);
  const existing = next.draft.items.find(line => line.productId === product.id && line.variantId === item.variantId && !line.optionIds.length && !line.note && line.unitCents === item.unitCents);
  if (existing) {
    if (existing.quantity >= 999) throw new Error('Quantity must be 1–999.');
    existing.quantity++;
  } else next.draft.items.push(item);
  return { state: next, lineId: existing?.id || item.id };
}
export function configureCartItem(state, lineId, variantId, optionIds) {
  const next = clone(state), index = next.draft.items.findIndex(item => item.id === lineId);
  if (index < 0) throw new Error('This order item is no longer available.');
  const item = next.draft.items[index], product = next.products.find(product => product.id === item.productId);
  if (!product || product.active === false || product.deletedAt) throw new Error('This item is unavailable.');
  const selected = optionIds ?? item.optionIds;
  const knownOptions = product.modifierGroups.flatMap(group => group.options.map(option => option.id));
  if (selected.some(id => !knownOptions.includes(id))) throw new Error('This option is no longer available.');
  next.draft.items[index] = { ...makeCartItem(product, variantId ?? item.variantId, selected, item.quantity, item.note, { allowIncomplete: true }), id: item.id };
  return next;
}
export function toggleCartOption(state, lineId, groupId, optionId) {
  const item = state.draft.items.find(item => item.id === lineId);
  const product = state.products.find(product => product.id === item?.productId);
  const group = product?.modifierGroups.find(group => group.id === groupId);
  if (!item || !group?.options.some(option => option.id === optionId)) throw new Error('This option is no longer available.');
  let selected;
  if (group.mode === 'multiple') selected = item.optionIds.includes(optionId) ? item.optionIds.filter(id => id !== optionId) : [...item.optionIds, optionId];
  else {
    selected = item.optionIds.filter(id => !group.options.some(option => option.id === id));
    if (group.required || !item.optionIds.includes(optionId)) selected.push(optionId);
  }
  return configureCartItem(state, lineId, item.variantId, selected);
}
export function totals(draft) {
  const subtotal = draft.items.reduce((n, item) => n + item.unitCents * item.quantity, 0);
  const discount = Math.min(subtotal, Math.max(0, cents(draft.discount || 0)));
  return { subtotal, discount, total: subtotal - discount };
}
export function receiptFor(sale) {
  const lines = [sale.customer || 'Walk-in customer', ''];
  for (const item of sale.items) {
    lines.push(`${item.quantity} × ${item.name}`, item.details);
    if (item.note) lines.push(`Note: ${item.note}`);
    lines.push(money(item.unitCents * item.quantity / 100), '');
  }
  if (sale.discountCents) lines.push(`Discount: ${money(sale.discountCents / 100)}`);
  lines.push(`Total: ${money(sale.totalCents / 100)}`);
  return lines.join('\n');
}
export function checkout(state, payment, { now = new Date().toISOString(), saleId = state.nextOrder } = {}) {
  if (!state.draft.items.length) throw new Error('Add an item to the order.');
  if (state.sales.some(s => s.id === saleId)) throw new Error('This sale has already been recorded.');
  if (!['Cash', 'GCash', 'Maya'].includes(payment.method)) throw new Error('Choose Cash, GCash, or Maya.');
  const amount = totals(state.draft);
  const receivedCents = payment.method === 'Cash' ? cents(finite(payment.received, 'Cash received')) : amount.total;
  if (receivedCents < amount.total) throw new Error('Cash received is less than the total.');
  for (const item of state.draft.items) {
    const product = state.products.find(p => p.id === item.productId);
    if (!product || product.active === false || product.deletedAt || !product.variants.some(v => v.id === item.variantId)) throw new Error(`${item.name} is no longer available. Remove it from the order.`);
    makeCartItem(product, item.variantId, item.optionIds, item.quantity, item.note);
  }
  const next = clone(state);
  const sale = { id: saleId, customer: state.draft.customer.trim(), items: clone(state.draft.items), note: state.draft.note,
    service: state.draft.service, subtotalCents: amount.subtotal, discountCents: amount.discount, totalCents: amount.total,
    method: payment.method, reference: payment.reference?.trim() || '', receivedCents, changeCents: receivedCents - amount.total,
    at: now, status: 'Queued', cashier: state.settings.cashier };
  sale.receipt = receiptFor(sale);
  next.sales.push(sale);
  next.nextOrder = Math.max(saleId + 1, next.nextOrder + 1);
  next.draft = blankState().draft;
  if (next.settings.autoPrint && next.settings.printerAddress) next.printJobs.push({ id: `auto:${saleId}`, saleId, kind: 'automatic',
    status: 'queued', attempts: 0, address: next.settings.printerAddress, paperWidth: next.settings.paperWidth, at: now });
  return { state: next, sale };
}
export function validateState(state) {
  if (!state || state.schemaVersion !== SCHEMA) throw new Error('This backup version is not supported.');
  if (state.forecast !== undefined) {
    validateForecastRows(state.forecast?.rows);
    if (typeof state.forecast.importedAt !== 'string' || !Number.isFinite(Date.parse(state.forecast.importedAt))) {
      throw new Error('Invalid forecast import date.');
    }
  }
  for (const key of ['products', 'ingredients', 'recipes', 'suppliers', 'sales', 'movements', 'printJobs', 'held']) {
    if (!Array.isArray(state[key])) throw new Error(`Invalid backup: ${key}.`);
    const ids = new Set();
    for (const item of state[key]) {
      if (!item || item.id == null || ids.has(String(item.id))) throw new Error(`Duplicate or invalid ${key} record.`);
      ids.add(String(item.id));
    }
  }
  const ingredients = new Set(state.ingredients.map(i => i.id));
  state.products.forEach(validateProduct);
  state.ingredients.forEach(i => { if (!i.name?.trim() || !['g', 'ml', 'pcs'].includes(i.unit)) throw new Error('Invalid ingredient.'); finite(i.stock, 'Stock'); finite(i.min, 'Minimum stock'); finite(i.cost, 'Unit cost'); });
  state.recipes.forEach(r => {
    // Archived v2.0 recipes may refer to sizes/options later removed from the menu.
    if (!r.productId || !r.variantId || !Array.isArray(r.lines)) throw new Error('Invalid archived recipe.');
    r.lines.forEach(l => { if (!ingredients.has(l.ingredientId)) throw new Error('Missing recipe ingredient.'); finite(l.quantity, 'Recipe quantity', r.optionId ? -1e9 : 0); });
  });
  const sales = new Set(state.sales.map(s => s.id));
  state.sales.forEach(s => {
    if (!Number.isSafeInteger(s.id) || !Array.isArray(s.items) || typeof s.receipt !== 'string' || !Number.isFinite(Date.parse(s.at))) throw new Error('Invalid sale or saved receipt.');
    finite(s.totalCents, 'Sale total');
    if (!Number.isSafeInteger(s.totalCents)) throw new Error('Invalid sale amount.');
    validateItems(s.items);
    if (s.items.reduce((n, i) => n + i.quantity * i.unitCents, 0) - s.discountCents !== s.totalCents) throw new Error('Sale totals do not match.');
  });
  state.printJobs.forEach(j => {
    const validContent = j.kind === 'sales-report'
      ? typeof j.receipt === 'string' && j.receipt.length > 0 && Array.isArray(j.saleIds) && j.saleIds.length > 0 && j.saleIds.every(id => sales.has(id)) &&
        (!j.pages || (Array.isArray(j.pages) && j.pages.length > 0 && j.pages.every(page => typeof page === 'string' && page.length > 0) && Number.isInteger(j.nextPage) && j.nextPage >= 0 && j.nextPage <= j.pages.length))
      : sales.has(j.saleId);
    if (!validContent || !['queued', 'printing', 'printed', 'needs_review'].includes(j.status)) throw new Error('Invalid print job.');
  });
  if (!state.settings || typeof state.settings.autoPrint !== 'boolean' || ![58, 80].includes(state.settings.paperWidth) || typeof state.settings.cashier !== 'string' || typeof state.settings.stockManager !== 'string' || typeof state.settings.printerAddress !== 'string') throw new Error('Invalid settings.');
  if (!state.draft || !Array.isArray(state.draft.items) || typeof state.draft.customer !== 'string') throw new Error('Invalid current order.');
  validateItems(state.draft.items);
  if (typeof state.draft.note !== 'string' || !['Dine-in', 'Takeaway'].includes(state.draft.service)) throw new Error('Invalid current order.');
  finite(state.draft.discount || 0, 'Discount');
  state.held.forEach(h => { if (!h.draft || !Array.isArray(h.draft.items)) throw new Error('Invalid held order.'); validateItems(h.draft.items); });
  if (!Number.isSafeInteger(state.nextOrder) || state.nextOrder <= state.sales.reduce((max, s) => Math.max(max, s.id), 0)) throw new Error('Invalid next order number.');
  return state;
}
function validateItems(items) {
  items.forEach(i => {
    if (!i.id || typeof i.name !== 'string' || typeof i.details !== 'string' || !Array.isArray(i.optionIds)) throw new Error('Invalid order line.');
    if (!Number.isSafeInteger(i.quantity) || i.quantity < 1 || !Number.isSafeInteger(i.unitCents) || i.unitCents < 0) throw new Error('Invalid order amount.');
  });
}
