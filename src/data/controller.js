import { clone, checkout, uid } from '../domain/model.js';
import { restoredState } from '../domain/backup.js';
import { upgradeState } from '../domain/upgrade.js';
import { salesSummary, reportPages } from '../domain/sales-report.js';
export async function createController(store) {
  let state = await store.load(), queue = Promise.resolve();
  const listeners = new Set();
  const controller = {
    get: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    mutate(change, recovery = false) {
      const operation = queue.then(async () => {
        const next = await change(clone(state));
        await store.save(next, recovery);
        state = next;
        listeners.forEach(fn => fn(state));
        return state;
      });
      queue = operation.catch(() => {});
      return operation;
    },
    async checkout(payment) {
      let sale;
      await controller.mutate(current => { const result = checkout(current, payment); sale = result.sale; return result.state; });
      return sale;
    },
    restore: next => controller.mutate(() => upgradeState(restoredState(next)), true),
    recovery: () => store.recovery(),
    async reprint(saleId) {
      return controller.mutate(next => {
        if (!next.settings.printerAddress) throw new Error('Select a paired printer in Settings first.');
        if (!next.sales.some(s => s.id === saleId)) throw new Error('Receipt not found.');
        next.printJobs.push({ id: uid('reprint'), saleId, kind: 'reprint', status: 'queued', attempts: 0,
          address: next.settings.printerAddress, paperWidth: next.settings.paperWidth, at: new Date().toISOString() });
        return next;
      });
    },
    async printSalesReport(report) {
      return controller.mutate(next => {
        if (!next.settings.printerAddress) throw new Error('Select a paired printer in Settings first.');
        if (!report.saleIds.length) throw new Error('There are no sales to print.');
        const ids = new Set(report.saleIds), sales = next.sales.filter(sale => ids.has(sale.id));
        if (sales.length !== ids.size) throw new Error('Sales changed. Open the sales summary again.');
        const snapshot = salesSummary(sales, { period: report.period, now: report.generatedAt });
        next.printJobs.push({ id: uid('report'), kind: 'sales-report', label: `Sales summary · ${snapshot.label}`,
          receipt: snapshot.receipt, pages: reportPages(snapshot.receipt, next.settings.paperWidth), nextPage: 0,
          saleIds: snapshot.saleIds, status: 'queued', attempts: 0,
          address: next.settings.printerAddress, paperWidth: next.settings.paperWidth, at: new Date().toISOString() });
        return next;
      });
    },
  };
  const upgraded = upgradeState(state);
  if (JSON.stringify(upgraded) !== JSON.stringify(state)) await controller.mutate(() => upgraded);
  if (state.printJobs.some(j => j.status === 'printing')) await controller.mutate(next => {
    next.printJobs.forEach(j => { if (j.status === 'printing') { j.status = 'needs_review'; j.error = 'Printing was interrupted. Check the paper receipt before retrying.'; } });
    return next;
  });
  return controller;
}
