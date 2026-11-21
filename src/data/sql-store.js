import { blankState, validateState } from '../domain/model.js';
import { withRestaurantCatalog } from '../domain/menu.js';
const tables = { products: 'products', ingredients: 'ingredients', recipes: 'recipes', suppliers: 'suppliers', sales: 'sales', movements: 'movements', printJobs: 'print_jobs', held: 'held_orders' };
export async function openSqlStore(driver) {
  await driver.exec(`PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS receipts (sale_id INTEGER PRIMARY KEY, content TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS recovery (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL);
    ${Object.values(tables).map(table => `CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, payload TEXT NOT NULL);`).join('\n')}
    PRAGMA user_version = 1;`);
  let previous = null;
  const store = {
    async load() {
      let state = blankState();
      const meta = await driver.all('SELECT payload FROM meta WHERE key = ?', ['state']);
      if (meta.length) Object.assign(state, JSON.parse(meta[0].payload));
      for (const [key, table] of Object.entries(tables)) state[key] = (await driver.all(`SELECT payload FROM ${table}`)).map(row => JSON.parse(row.payload));
      // Receipt copies have their own table, and survive later menu edits.
      const receipts = new Map((await driver.all('SELECT sale_id, content FROM receipts')).map(r => [r.sale_id, r.content]));
      state.sales.forEach(s => { if (receipts.has(s.id)) s.receipt = receipts.get(s.id); });
      validateState(state);
      previous = JSON.parse(JSON.stringify(state));
      if (!meta.length && !state.products.length && !state.sales.length) {
        state = withRestaurantCatalog(state);
        await store.save(state);
      }
      return state;
    },
    async save(state, recovery = false) {
      validateState(state);
      const before = previous;
      await driver.transaction(async tx => {
        if (recovery && before) await tx.run('INSERT OR REPLACE INTO recovery(id,payload) VALUES(1,?)', [JSON.stringify(before)]);
        for (const [key, table] of Object.entries(tables)) {
          const old = new Map((before?.[key] || []).map(row => [String(row.id), JSON.stringify(row)]));
          for (const row of state[key]) {
            const id = String(row.id), payload = JSON.stringify(row);
            if (payload !== old.get(id)) await tx.run(`INSERT INTO ${table}(id,payload) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload`, [id, payload]);
            old.delete(id);
          }
          for (const id of old.keys()) await tx.run(`DELETE FROM ${table} WHERE id=?`, [id]);
        }
        const ids = new Set(state.sales.map(s => s.id));
        const oldSales = new Map((before?.sales || []).map(s => [s.id, s]));
        for (const sale of state.sales) {
          const oldSale = oldSales.get(sale.id);
          if (sale.receipt !== oldSale?.receipt) await tx.run('INSERT OR REPLACE INTO receipts(sale_id,content) VALUES(?,?)', [sale.id, sale.receipt]);
        }
        for (const sale of before?.sales || []) if (!ids.has(sale.id)) await tx.run('DELETE FROM receipts WHERE sale_id=?', [sale.id]);
        const meta = { ...state };
        Object.keys(tables).forEach(k => delete meta[k]);
        await tx.run('INSERT OR REPLACE INTO meta(key,payload) VALUES(?,?)', ['state', JSON.stringify(meta)]);
      });
      previous = JSON.parse(JSON.stringify(state));
    },
    async recovery() { const rows = await driver.all('SELECT payload FROM recovery WHERE id=1'); return rows.length ? JSON.parse(rows[0].payload) : null; },
  };
  return store;
}
