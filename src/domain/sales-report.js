import { money } from './model.js';

export function salesForPeriod(sales, period, now = new Date()) {
  const day = now.toDateString();
  return sales.filter(sale => period === 'All time' || new Date(sale.at).toDateString() === day);
}

export function salesSummary(sales, { period = 'Today', now = new Date().toISOString() } = {}) {
  const ordered = [...sales].sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.id - b.id);
  const customers = new Map();
  for (const sale of ordered) {
    const name = sale.customer?.trim().replace(/\s+/g, ' ') || '';
    // An unnamed receipt does not identify the same person as another walk-in.
    const key = name ? `name:${name.toLocaleLowerCase('en-PH')}` : `walk-in:${sale.id}`;
    if (!customers.has(key)) customers.set(key, { name: name || `Walk-in #${sale.id}`, saleIds: [], items: new Map(), discountCents: 0, totalCents: 0 });
    const group = customers.get(key);
    group.saleIds.push(sale.id);
    group.discountCents += sale.discountCents || 0;
    group.totalCents += sale.totalCents;
    for (const item of sale.items) {
      const itemKey = JSON.stringify([item.name, item.details, item.unitCents]);
      if (!group.items.has(itemKey)) group.items.set(itemKey, { name: item.name, details: item.details, unitCents: item.unitCents, quantity: 0 });
      group.items.get(itemKey).quantity += item.quantity;
    }
  }
  const groups = [...customers.values()].map(group => ({ ...group, items: [...group.items.values()] }));
  const totalCents = ordered.reduce((sum, sale) => sum + sale.totalCents, 0);
  const date = new Date(now).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
  const label = period === 'Today' ? `Today · ${date}` : 'All time';
  const lines = ['Sales summary', label, `Generated: ${new Date(now).toLocaleString('en-PH')}`, ''];
  for (const group of groups) {
    lines.push(group.name, `Receipts: ${group.saleIds.map(id => `#${id}`).join(', ')}`);
    for (const item of group.items) {
      lines.push(`${item.quantity} × ${item.name}: ${money(item.unitCents * item.quantity / 100)}`);
      if (item.details) lines.push(item.details);
    }
    if (group.discountCents) lines.push(`Discounts: -${money(group.discountCents / 100)}`);
    lines.push(`Customer total: ${money(group.totalCents / 100)}`, '');
  }
  lines.push(`Receipts: ${ordered.length}`, `Total sales: ${money(totalCents / 100)}`);
  return { groups, totalCents, saleIds: ordered.map(s => s.id), period, generatedAt: now, label, receipt: lines.join('\n') };
}

// Keep each Bluetooth write well below the existing native printer's timeout
// and raster-height limits, including for a long All time report.
export function reportPages(receipt, paperWidth) {
  const columns = paperWidth === 80 ? 32 : 20, limit = 80, parts = [];
  let lines = [], height = 0;
  for (const original of receipt.split('\n')) {
    const chunks = original.length > columns * limit ? original.match(new RegExp(`.{1,${columns * limit}}`, 'gu')) : [original];
    for (const line of chunks) {
      const rows = Math.max(1, Math.ceil([...line].length / columns));
      if (height + rows > limit && lines.length) { parts.push(lines.join('\n')); lines = []; height = 0; }
      lines.push(line); height += rows;
    }
  }
  if (lines.length) parts.push(lines.join('\n'));
  return parts.length <= 1 ? [receipt] : parts.map((part, index) => `Sales summary · ${index + 1}/${parts.length}\n\n${part}`);
}
