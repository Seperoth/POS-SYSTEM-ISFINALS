import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { blankState, checkout, makeCartItem, clone, addMenuItem, configureCartItem, toggleCartOption, missingChoices } from '../src/domain/model.js';
import { upgradeState } from '../src/domain/upgrade.js';
import { MENU_CATEGORIES, menuCategory, saveMenuItem, removeMenuItem } from '../src/domain/menu.js';
import { cancelHeldOrder, resumeHeldOrder } from '../src/domain/held-orders.js';
import { salesForPeriod, salesSummary, reportPages } from '../src/domain/sales-report.js';
import { createBackup, readBackup, restoredState, salesCsv } from '../src/domain/backup.js';
import { openSqlStore } from '../src/data/sql-store.js';
import { createController } from '../src/data/controller.js';
import { printWorker } from '../src/services/print-worker.js';
const hash = text => createHash('sha256').update(text).digest('hex');
function fixture() {
  const s = blankState();
  s.products.push({ id: 'p', name: 'Test coffee', description: '', category: 'Test', active: true, trackInventory: true,
    variants: [{ id: 'small', name: 'Small', price: 95 }, { id: 'large', name: 'Large', price: 110 }],
    modifierGroups: [{ id: 'milk', name: 'Milk', mode: 'single', required: true, options: [{ id: 'dairy', name: 'Dairy', price: 0 }, { id: 'oat', name: 'Oat', price: 20 }] }] });
  s.ingredients.push({ id: 'milk', name: 'Milk', unit: 'ml', stock: 1000, min: 100, cost: 0.1 }, { id: 'oat', name: 'Oat milk', unit: 'ml', stock: 500, min: 100, cost: 0.2 }, { id: 'cup', name: 'Cup', unit: 'pcs', stock: 20, min: 5, cost: 2 });
  s.recipes.push({ id: 'base', productId: 'p', variantId: 'small', optionId: '', lines: [{ ingredientId: 'milk', quantity: 150 }, { ingredientId: 'cup', quantity: 1 }] },
    { id: 'oat-recipe', productId: 'p', variantId: 'small', optionId: 'oat', lines: [{ ingredientId: 'milk', quantity: -150 }, { ingredientId: 'oat', quantity: 150 }] });
  s.settings.printerAddress = 'AA:BB:CC:DD:EE:FF';
  s.draft = { ...s.draft, customer: 'Jo', items: [makeCartItem(s.products[0], 'small', ['oat'], 2)], discount: 10 };
  return s;
}
async function database(seed = null, fail = () => false) {
  const db = new DatabaseSync(':memory:');
  const driver = {
    exec: async sql => db.exec(sql), all: async (sql, params = []) => db.prepare(sql).all(...params),
    transaction: async fn => { db.exec('BEGIN IMMEDIATE'); try { await fn({ run: async (sql, params = []) => { if (fail(sql)) throw new Error('Simulated disk failure'); return db.prepare(sql).run(...params); } }); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } },
  };
  const store = await openSqlStore(driver); await store.load(); if (seed) await store.save(seed);
  return { db, store };
}
test('a new installation has no sample catalog, inventory, recipes, or sales', () => {
  const s = blankState(); for (const key of ['products', 'ingredients', 'recipes', 'sales', 'suppliers', 'movements', 'held']) assert.deepEqual(s[key], []);
});
test('POS checkout ignores archived inventory and freezes customer, items and total', () => {
  const original = fixture(), { state, sale } = checkout(original, { method: 'Cash', received: 250 });
  assert.equal(sale.totalCents, 22000); assert.equal(sale.changeCents, 3000);
  assert.equal(state.ingredients[0].stock, 1000); assert.equal(state.ingredients[1].stock, 500); assert.equal(state.ingredients[2].stock, 20);
  assert.equal(state.movements.length, 0);
  assert.equal(original.ingredients[1].stock, 500); assert.equal(state.draft.items.length, 0);
  assert.match(sale.receipt, /^Jo\n\n2 × Test coffee/); assert.match(sale.receipt, /Total: ₱220.00$/);
  state.products[0].name = 'Changed'; state.products[0].variants[0].price = 999;
  assert.match(sale.receipt, /Test coffee/); assert.equal(state.printJobs[0].id, 'auto:1001');
  assert.throws(() => checkout({ ...state, draft: original.draft }, { method: 'Cash', received: 300 }, { saleId: 1001 }), /already been recorded/);
});
test('items sell with no recipes and no stock; invalid cash or unavailable items cannot create a sale', () => {
  const s = fixture(); s.ingredients = []; s.recipes = [];
  const before = JSON.stringify(s);
  assert.equal(checkout(s, { method: 'Cash', received: 300 }).sale.totalCents, 22000);
  assert.equal(JSON.stringify(s), before);
  assert.throws(() => checkout(s, { method: 'Cash', received: 1 }), /less than the total/);
  s.draft.items = [makeCartItem(s.products[0], 'large', ['dairy'])];
  assert.equal(checkout(s, { method: 'GCash' }).sale.totalCents, 10000);
  s.products[0].active = false;
  assert.throws(() => checkout(s, { method: 'GCash' }), /no longer available/);
});
test('required options and invalid quantities are rejected', () => {
  const s = fixture(); assert.throws(() => makeCartItem(s.products[0], 'small'), /Choose milk/);
  assert.throws(() => makeCartItem(s.products[0], 'small', ['dairy', 'oat']), /Choose one/);
  assert.throws(() => makeCartItem(s.products[0], 'small', ['dairy'], 1.5), /Quantity must/);
});
test('upgrade converts old percentage discounts into pesos without changing the payable total', () => {
  const s = fixture(); s.draft.discountType = 'percent'; s.draft.discount = 10.25;
  s.held.push({ id: 'held', draft: clone(s.draft) });
  const migrated = upgradeState(s), result = checkout(migrated, { method: 'GCash' });
  assert.equal(migrated.draft.discountType, 'amount'); assert.equal(migrated.draft.discount, 23.58);
  assert.equal(migrated.held[0].draft.discount, 23.58);
  assert.equal(result.sale.totalCents, 20642); assert.equal(result.sale.discountCents, 2358);
  assert.match(result.sale.receipt, /Total: ₱206.42/);
  assert.deepEqual(upgradeState(migrated), migrated);
});
test('SQLite persists sales, receipt copies, stock, drafts and settings across reopening', async () => {
  const { db, store } = await database(fixture()), c = await createController(store);
  await c.checkout({ method: 'GCash', reference: 'ref-123' });
  const saved = await store.load(); assert.equal(saved.sales.length, 1); assert.equal(saved.ingredients[1].stock, 500);
  assert.equal(db.prepare('SELECT content FROM receipts WHERE sale_id=1001').get().content, saved.sales[0].receipt);
  assert.equal(saved.sales[0].reference, 'ref-123'); assert.equal(saved.printJobs.length, 1); db.close();
});
test('disk failure rolls back sale, receipt, stock and print job together', async () => {
  let shouldFail = false;
  const { db, store } = await database(fixture(), sql => shouldFail && sql.includes('INTO receipts'));
  const c = await createController(store), before = JSON.stringify(c.get()); shouldFail = true;
  await assert.rejects(c.checkout({ method: 'Cash', received: 300 }), /disk failure/);
  assert.equal(JSON.stringify(c.get()), before); assert.equal(JSON.stringify(await store.load()), before);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sales').get().n, 0); db.close();
});
test('concurrent checkout taps cannot duplicate a sale or inventory deduction', async () => {
  const { db, store } = await database(fixture()), c = await createController(store);
  const results = await Promise.allSettled([c.checkout({ method: 'GCash' }), c.checkout({ method: 'GCash' })]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(c.get().sales.length, 1); assert.equal(c.get().ingredients[1].stock, 500); db.close();
});
test('failed printer never loses a sale or retries automatically; explicit retry uses frozen receipt', async () => {
  const { db, store } = await database(fixture()), c = await createController(store); const sale = await c.checkout({ method: 'Maya' });
  let calls = 0;
  const worker = printWorker(c, async () => { calls++; throw new Error('Disconnected'); }); await Promise.all([worker(), worker()]); await worker();
  assert.equal(calls, 1); assert.equal(c.get().printJobs[0].status, 'needs_review'); assert.equal(c.get().sales.length, 1); assert.equal(c.get().ingredients[1].stock, 500);
  await c.mutate(s => { s.printJobs[0].status = 'queued'; s.products[0].name = 'Edited'; return s; });
  let text;
  await printWorker(c, async (address, receipt) => { text = receipt; })();
  assert.equal(text, sale.receipt); assert.equal(c.get().printJobs[0].status, 'printed'); db.close();
});
test('interrupted native printing requires review after reopening', async () => {
  const s = checkout(fixture(), { method: 'GCash' }).state; s.printJobs[0].status = 'printing';
  const { db, store } = await database(s), c = await createController(store); assert.equal(c.get().printJobs[0].status, 'needs_review'); db.close();
});
test('backup verifies checksum and references and does not reprint restored jobs', async () => {
  const s = checkout(fixture(), { method: 'GCash' }).state, text = await createBackup(s, hash), file = await readBackup(text, hash);
  assert.deepEqual(file.payload, s); assert.equal(restoredState(file.payload).printJobs[0].status, 'needs_review');
  const corrupt = JSON.parse(text); corrupt.payload.ingredients[0].stock = 9999;
  await assert.rejects(readBackup(JSON.stringify(corrupt), hash), /checksum/);
  corrupt.checksum = hash(JSON.stringify(corrupt.payload)); corrupt.payload.recipes[0].lines[0].ingredientId = 'missing'; corrupt.checksum = hash(JSON.stringify(corrupt.payload));
  await assert.rejects(readBackup(JSON.stringify(corrupt), hash), /Missing recipe ingredient/);
});
test('restore is atomic and keeps a pre-restore recovery copy', async () => {
  const original = fixture(), { db, store } = await database(original), c = await createController(store);
  const restored = checkout(original, { method: 'GCash' }).state; await c.restore(restored);
  assert.equal(c.get().sales.length, 1); assert.deepEqual(await c.recovery(), upgradeState(original));
  const broken = clone(restored); broken.nextOrder = 1;
  await assert.rejects(c.restore(broken), /next order/); assert.equal(c.get().sales.length, 1); db.close();
});
test('failed restore rolls back both replacement records and the recovery snapshot', async () => {
  let fail = false;
  const original = fixture(), { db, store } = await database(original, sql => fail && sql.includes('INTO receipts'));
  const c = await createController(store), replacement = checkout(original, { method: 'GCash' }).state; fail = true;
  await assert.rejects(c.restore(replacement), /disk failure/);
  assert.deepEqual(await store.load(), upgradeState(original)); assert.equal(await c.recovery(), null); db.close();
});
test('new Card payments are rejected while archived Card receipts survive upgrading', () => {
  assert.throws(() => checkout(fixture(), { method: 'Card' }), /Cash, GCash, or Maya/);
  const old = checkout(fixture(), { method: 'GCash' }).state;
  old.sales[0].method = 'Card'; old.sales[0].ingredientCostCents = 6400;
  const next = upgradeState(old);
  assert.deepEqual(next.sales, old.sales); assert.deepEqual(next.ingredients, old.ingredients); assert.deepEqual(next.recipes, old.recipes);
  assert.equal(next.products[0].trackInventory, false);
});
test('CSV escapes customer names and preserves payment references', () => {
  const s = checkout(fixture(), { method: 'GCash', reference: '123' }).state; s.sales[0].customer = 'A, "B"';
  assert.match(salesCsv(s), /"A, ""B"""/); assert.match(salesCsv(s), /"GCash","123","220.00"/);
});

function reportFixture() {
  let state = blankState();
  state.settings.autoPrint = false;
  state.settings.printerAddress = 'AA:BB:CC:DD:EE:FF';
  state.products.push({ id: 'food', name: 'Adobo', description: '', category: 'Meals', variants: [{ id: 'regular', name: 'Regular', price: 80 }], modifierGroups: [] },
    { id: 'other', name: 'Other item', description: '', category: 'Menu', variants: [{ id: 'regular', name: 'Regular', price: 15 }], modifierGroups: [] });
  for (const [customer, product] of [['Eric', 0], ['Sam', 0], [' eric ', 1]]) {
    state.draft.customer = customer; state.draft.items = [makeCartItem(state.products[product], 'regular')];
    state = checkout(state, { method: 'GCash' }, { now: '2026-11-03T02:00:00.000Z' }).state;
  }
  return state;
}
test('sales summary combines all Eric receipts, lists purchases, and reconciles customer and grand totals', () => {
  const state = reportFixture(), before = clone(state);
  const report = salesSummary(state.sales, { now: '2026-11-03T03:00:00.000Z' });
  assert.equal(report.groups.length, 2);
  assert.equal(report.groups[0].name, 'Eric'); assert.deepEqual(report.groups[0].saleIds, [1001, 1003]);
  assert.equal(report.groups[0].totalCents, 9500); assert.equal(report.groups[1].totalCents, 8000);
  assert.equal(report.totalCents, 17500); assert.match(report.receipt, /Eric\nReceipts: #1001, #1003\n1 × Adobo: ₱80.00/);
  assert.match(report.receipt, /Customer total: ₱95.00/); assert.match(report.receipt, /Total sales: ₱175.00$/);
  assert.deepEqual(state, before);
});
test('summary uses saved quantities and discounts even after the menu is edited', () => {
  const state = reportFixture();
  state.sales[0].discountCents = 1000; state.sales[0].totalCents -= 1000;
  state.products[0].name = 'New menu name'; state.products[0].variants[0].price = 999;
  const report = salesSummary(state.sales);
  assert.equal(report.groups[0].totalCents, 8500); assert.equal(report.totalCents, 16500);
  assert.match(report.receipt, /Discounts: -₱10.00/); assert.match(report.receipt, /Adobo: ₱80.00/);
  assert.doesNotMatch(report.receipt, /New menu name/);
  const repeated = clone(state.sales[0]); repeated.id = 1004; repeated.discountCents = 0; repeated.totalCents = 8000;
  const combined = salesSummary([...state.sales, repeated]);
  assert.equal(combined.groups[0].items[0].quantity, 2); assert.match(combined.receipt, /2 × Adobo: ₱160.00/);
});
test('unnamed receipts remain distinct; date filtering follows device local calendar days', () => {
  const state = reportFixture(); state.sales[0].customer = ''; state.sales[1].customer = ' ';
  assert.equal(salesSummary(state.sales).groups.length, 3);
  state.sales[0].at = new Date(2026, 10, 2, 23, 59).toISOString();
  state.sales[1].at = new Date(2026, 10, 3, 0, 1).toISOString();
  state.sales[2].at = new Date(2026, 10, 3, 12, 0).toISOString();
  assert.deepEqual(salesForPeriod(state.sales, 'Today', new Date(2026, 10, 3, 12)).map(s => s.id), [1002, 1003]);
  assert.equal(salesForPeriod(state.sales, 'All time').length, 3);
});
test('sales-summary outbox persists a frozen report, requires explicit retry, and never creates another sale', async () => {
  const { db, store } = await database(reportFixture()), c = await createController(store);
  const sales = clone(c.get().sales), report = salesSummary(sales, { period: 'All time' });
  await c.printSalesReport(report);
  assert.deepEqual(c.get().sales, sales);
  assert.equal(c.get().printJobs.length, 1);
  assert.equal((await store.load()).printJobs[0].receipt, report.receipt);
  let calls = 0;
  const failure = printWorker(c, async () => { calls++; throw new Error('Printer disconnected'); });
  await failure(); await failure(); assert.equal(calls, 1); assert.equal(c.get().printJobs[0].status, 'needs_review');
  await c.mutate(s => { s.printJobs[0].status = 'queued'; s.products[0].name = 'Changed'; return s; });
  let printed;
  await printWorker(c, async (address, text) => { printed = text; })();
  assert.equal(printed, report.receipt); assert.deepEqual(c.get().sales, sales);
  const text = await createBackup(c.get(), hash), backup = await readBackup(text, hash);
  await c.restore(backup.payload); assert.equal(c.get().printJobs[0].status, 'printed');
  db.close();
});
test('migration commits to SQLite once and preserves v2.0 sales, receipts and archived stock', async () => {
  const original = reportFixture(); original.products[0].trackInventory = true;
  original.draft.discountType = 'percent'; original.draft.discount = 10;
  original.draft.items = [makeCartItem(original.products[0], 'regular')];
  const { db, store } = await database(original), c = await createController(store);
  assert.deepEqual(c.get().sales, original.sales); assert.equal(c.get().draft.discount, 8);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM receipts').get().n, 3);
  assert.equal(c.get().products[0].trackInventory, false);
  const reopened = await createController(store); assert.deepEqual(reopened.get(), c.get());
  await reopened.restore(original); assert.deepEqual(reopened.get().sales, original.sales);
  assert.equal(reopened.get().draft.discount, 8); db.close();
});

test('long reports paginate without dropping purchases or total sales', () => {
  const text = ['Sales summary', ...Array.from({ length: 500 }, (_, i) => `Customer ${i}: item ₱80.00`), 'Total sales: ₱40,000.00'].join('\n');
  const pages = reportPages(text, 58);
  assert.ok(pages.length > 1);
  for (let i = 0; i < 500; i++) assert.ok(pages.some(page => page.includes(`Customer ${i}: item ₱80.00`)));
  assert.match(pages.at(-1), /Total sales: ₱40,000.00$/);
  assert.ok(pages.every(page => page.length < 4000));
  assert.deepEqual(reportPages('Small receipt', 58), ['Small receipt']);
});
test('long report retry resumes at the uncertain page and retains completed-page progress on reopening', async () => {
  const { db, store } = await database(reportFixture()), c = await createController(store);
  await c.printSalesReport(salesSummary(c.get().sales));
  await c.mutate(s => { s.printJobs[0].pages = ['page one', 'page two', 'page three']; return s; });
  const sent = [];
  await printWorker(c, async (address, text) => { sent.push(text); if (text === 'page two') throw new Error('Disconnected'); })();
  assert.deepEqual(sent, ['page one', 'page two']); assert.equal(c.get().printJobs[0].nextPage, 1);
  const reopened = await createController(store); assert.equal(reopened.get().printJobs[0].nextPage, 1);
  await reopened.mutate(s => { s.printJobs[0].status = 'queued'; return s; });
  const retried = [];
  await printWorker(reopened, async (address, text) => { retried.push(text); })();
  assert.deepEqual(retried, ['page two', 'page three']); assert.equal(reopened.get().printJobs[0].status, 'printed');
  assert.equal(reopened.get().sales.length, 3); db.close();
});

test('menu taps add directly and combine identical items without inventing required selections', () => {
  const state = fixture(); state.draft = blankState().draft;
  const first = addMenuItem(state, 'p'), second = addMenuItem(first.state, 'p');
  assert.equal(state.draft.items.length, 0); assert.equal(second.state.draft.items.length, 1);
  assert.equal(second.lineId, first.lineId); assert.equal(second.state.draft.items[0].quantity, 2);
  assert.deepEqual(second.state.draft.items[0].optionIds, []);
  assert.deepEqual(missingChoices(state.products[0], []), ['Milk']);
  assert.throws(() => checkout(second.state, { method: 'Cash', received: 300 }), /Choose milk/);
  assert.equal(second.state.sales.length, 0);
});
test('inline size and option changes retain the selected line and quantity and recalculate its price', () => {
  let state = fixture(); state.draft = blankState().draft;
  let added = addMenuItem(state, 'p'); state = addMenuItem(added.state, 'p').state;
  state = configureCartItem(state, added.lineId, 'large');
  state = toggleCartOption(state, added.lineId, 'milk', 'oat');
  const item = state.draft.items[0];
  assert.equal(item.id, added.lineId); assert.equal(item.quantity, 2); assert.equal(item.unitCents, 13000);
  assert.equal(item.details, 'Large · Oat');
  assert.deepEqual(missingChoices(state.products[0], item.optionIds), []);
  const sale = checkout(state, { method: 'GCash' }).sale;
  assert.equal(sale.totalCents, 26000); assert.match(sale.receipt, /2 × Test coffee\nLarge · Oat\n₱260.00/);
  assert.throws(() => configureCartItem(state, item.id, 'missing'), /unavailable/);
  assert.throws(() => configureCartItem(state, item.id, 'large', ['missing']), /no longer available/);
});
test('direct taps keep customized, noted and differently priced order lines separate', () => {
  let state = reportFixture(); state.draft = blankState().draft;
  const first = addMenuItem(state, 'food'); state = first.state;
  state.draft.items[0].note = 'No sauce';
  state = addMenuItem(state, 'food').state;
  state.products[0].variants[0].price = 90;
  state = addMenuItem(state, 'food').state;
  assert.equal(state.draft.items.length, 3);
  assert.deepEqual(state.draft.items.map(item => item.unitCents), [8000, 8000, 9000]);
  state.products[0].active = false;
  assert.throws(() => addMenuItem(state, 'food'), /unavailable/);
  assert.throws(() => addMenuItem(state, 'missing'), /unavailable/);
});
test('rapid persisted menu taps keep one order line with the exact requested quantity', async () => {
  const original = reportFixture(); original.draft = blankState().draft;
  const { db, store } = await database(original), c = await createController(store);
  await Promise.all(Array.from({ length: 8 }, () => c.mutate(state => addMenuItem(state, 'food').state)));
  assert.equal(c.get().draft.items.length, 1); assert.equal(c.get().draft.items[0].quantity, 8);
  const reopened = await createController(store); assert.equal(reopened.get().draft.items[0].quantity, 8);
  assert.deepEqual(reopened.get().sales, original.sales);
  await reopened.mutate(state => { state.draft.items[0].quantity = 999; return state; });
  await assert.rejects(reopened.mutate(state => addMenuItem(state, 'food').state), /1–999/);
  assert.equal(reopened.get().draft.items[0].quantity, 999); db.close();
});
test('inline choices use current persisted selections so rapid extra taps cannot overwrite each other', async () => {
  let original = fixture(); original.draft = blankState().draft;
  original.products[0].modifierGroups.push({ id: 'extras', name: 'Extras', mode: 'multiple', required: false, options: [{ id: 'shot', name: 'Extra shot', price: 15 }, { id: 'vanilla', name: 'Vanilla', price: 10 }] });
  const added = addMenuItem(original, 'p');
  const { db, store } = await database(added.state), c = await createController(store);
  await Promise.all([
    c.mutate(state => toggleCartOption(state, added.lineId, 'milk', 'oat')),
    c.mutate(state => toggleCartOption(state, added.lineId, 'extras', 'shot')),
    c.mutate(state => toggleCartOption(state, added.lineId, 'extras', 'vanilla')),
  ]);
  assert.deepEqual(c.get().draft.items[0].optionIds, ['oat', 'shot', 'vanilla']);
  await c.mutate(state => toggleCartOption(state, added.lineId, 'milk', 'dairy'));
  await c.mutate(state => toggleCartOption(state, added.lineId, 'milk', 'dairy'));
  assert.deepEqual(new Set(c.get().draft.items[0].optionIds), new Set(['dairy', 'shot', 'vanilla']));
  assert.equal(c.get().draft.items[0].unitCents, 12000); db.close();
});

test('menu saves require a designated category while legacy backups remain readable', async () => {
  const original = fixture(), product = clone(original.products[0]);
  for (const category of ['', 'Test', 'Coffee', 'food']) assert.throws(() => saveMenuItem(original, { ...product, category }), /Choose FOOD/);
  for (const category of MENU_CATEGORIES) assert.equal(saveMenuItem(original, { ...product, category }).products[0].category, category);
  assert.equal(menuCategory('  rice   meals '), 'FOOD'); assert.equal(menuCategory('Coffee'), 'DRINKS');
  assert.equal(menuCategory('Confectionery'), 'CONFECTIONERY'); assert.equal(menuCategory(' extra '), 'EXTRAS'); assert.equal(menuCategory('My custom category'), null);
  assert.equal(original.products[0].category, 'Test');
  const backup = await readBackup(await createBackup(original, hash), hash);
  assert.equal(backup.payload.products[0].category, 'Test');
});

test('menu removal persists without changing saved sales, receipts, reports or archived recipe data', async () => {
  const { state, sale } = checkout(fixture(), { method: 'Cash', received: 250 });
  const removed = removeMenuItem(state, 'p', '2026-11-08T00:00:00.000Z');
  assert.equal(state.products[0].deletedAt, undefined);
  assert.equal(removed.products[0].active, false);
  assert.deepEqual(removed.sales, state.sales); assert.deepEqual(removed.recipes, state.recipes); assert.deepEqual(removed.printJobs, state.printJobs);
  assert.throws(() => addMenuItem(removed, 'p'), /unavailable/);
  assert.throws(() => makeCartItem({ ...removed.products[0], active: true }, 'small', ['dairy']), /unavailable/);
  const { db, store } = await database(removed), controller = await createController(store);
  assert.equal(controller.get().products[0].deletedAt, '2026-11-08T00:00:00.000Z');
  const backup = await readBackup(await createBackup(controller.get(), hash), hash);
  await controller.restore(backup.payload);
  assert.equal(controller.get().sales[0].receipt, sale.receipt);
  assert.equal(controller.get().products[0].deletedAt, removed.products[0].deletedAt);
  assert.equal(salesSummary(controller.get().sales).totalCents, 22000);
  await controller.reprint(sale.id); assert.equal(controller.get().printJobs.at(-1).saleId, sale.id);
  db.close();
});

test('menu removal protects current and held orders and cannot restore an already removed product', () => {
  const state = fixture(), before = JSON.stringify(state);
  assert.throws(() => removeMenuItem(state, 'p'), /current and held orders/); assert.equal(JSON.stringify(state), before);
  state.held.push({ id: 'held', draft: clone(state.draft) }); state.draft = blankState().draft;
  assert.throws(() => removeMenuItem(state, 'p'), /current and held orders/);
  state.held = []; const removed = removeMenuItem(state, 'p');
  assert.throws(() => removeMenuItem(removed, 'p'), /already been removed/);
  assert.throws(() => saveMenuItem(removed, { ...state.products[0], category: 'DRINKS' }), /has been removed/);
});

test('serialized SQLite edits cannot resurrect an item removed while its editor was open', async () => {
  const seed = fixture(); seed.draft = blankState().draft;
  const { db, store } = await database(seed), controller = await createController(store);
  const stale = { ...clone(seed.products[0]), name: 'Stale edit', category: 'DRINKS' };
  const results = await Promise.allSettled([
    controller.mutate(state => removeMenuItem(state, 'p')),
    controller.mutate(state => saveMenuItem(state, stale)),
  ]);
  assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].status, 'rejected');
  const reopened = await createController(store);
  assert.ok(reopened.get().products[0].deletedAt); assert.equal(reopened.get().products[0].name, 'Test coffee'); db.close();
});

test('cancelling a held order changes only the selected held draft, never current orders or saved sales', () => {
  const original = fixture(), { state } = checkout(original, { method: 'Cash', received: 250 });
  state.draft = { ...clone(original.draft), customer: 'Current customer' };
  state.held = ['A', 'B'].map(id => ({ id, at: '2026-11-08T00:00:00.000Z', draft: { ...clone(original.draft), customer: id } }));
  const before = clone(state), cancelled = cancelHeldOrder(state, 'A');
  assert.deepEqual(cancelled, { ...before, held: [before.held[1]] }); assert.deepEqual(state, before);
  assert.throws(() => cancelHeldOrder(cancelled, 'A'), /no longer available/);
});

test('held cancellation is atomic in SQLite and persists through reopening and backup restore', async () => {
  const seed = fixture(); seed.held = [{ id: 'A', draft: clone(seed.draft), at: '2026-11-08T00:00:00.000Z' }];
  let fail = false; const { db, store } = await database(seed, () => fail), controller = await createController(store);
  const before = clone(controller.get()); fail = true;
  await assert.rejects(controller.mutate(state => cancelHeldOrder(state, 'A')), /disk failure/);
  assert.deepEqual(controller.get(), before); assert.equal((await store.load()).held.length, 1);
  fail = false; await controller.mutate(state => cancelHeldOrder(state, 'A'));
  const reopened = await createController(store); assert.equal(reopened.get().held.length, 0); assert.deepEqual(reopened.get().draft, before.draft);
  const backup = await readBackup(await createBackup(reopened.get(), hash), hash); await reopened.restore(backup.payload);
  assert.equal(reopened.get().held.length, 0); assert.deepEqual(reopened.get().draft, before.draft); db.close();
});

test('queued resume and cancellation cannot resurrect an order or duplicate the current draft', async () => {
  for (const first of ['cancel', 'resume']) {
    const seed = fixture(); seed.draft.customer = 'Current customer';
    seed.held = [{ id: 'A', at: '2026-11-08T00:00:00.000Z', draft: { ...clone(seed.draft), customer: 'Held customer' } }];
    const { db, store } = await database(seed), controller = await createController(store);
    const actions = first === 'cancel' ? [cancelHeldOrder, resumeHeldOrder] : [resumeHeldOrder, cancelHeldOrder];
    const results = await Promise.allSettled(actions.map(action => controller.mutate(state => action(state, 'A'))));
    assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].status, 'rejected');
    assert.equal(controller.get().draft.customer, first === 'cancel' ? 'Current customer' : 'Held customer');
    assert.equal(controller.get().held.length, first === 'cancel' ? 0 : 1);
    if (first === 'resume') { assert.equal(controller.get().held[0].draft.customer, 'Current customer'); await assert.rejects(controller.mutate(state => resumeHeldOrder(state, 'A')), /no longer available/); }
    assert.deepEqual((await store.load()).draft, controller.get().draft); db.close();
  }
});
