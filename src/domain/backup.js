import { APP_ID, SCHEMA, clone, validateState } from './model.js';
export async function createBackup(state, hash) {
  validateState(state);
  const payload = clone(state);
  return JSON.stringify({ app: APP_ID, version: SCHEMA, createdAt: new Date().toISOString(), checksum: await hash(JSON.stringify(payload)), payload }, null, 2);
}
export async function readBackup(text, hash) {
  if (text.length > 50 * 1024 * 1024) throw new Error('Backup exceeds 50 MB.');
  let file;
  try { file = JSON.parse(text); } catch { throw new Error('Choose a valid Universal POS JSON backup.'); }
  if (file.app !== APP_ID || file.version !== SCHEMA) throw new Error('Unsupported backup format or version.');
  if (file.checksum !== await hash(JSON.stringify(file.payload))) throw new Error('Backup checksum does not match. The file may be damaged.');
  validateState(file.payload);
  return file;
}
export function restoredState(state) {
  const next = clone(validateState(state));
  // Printing can have succeeded before a backup. Require a person to review it.
  next.printJobs.forEach(j => { if (j.status !== 'printed') { j.status = 'needs_review'; j.error = 'Restored from backup. Check the paper receipt before retrying.'; } });
  return next;
}
export function salesCsv(state) {
  const cell = v => `"${String(v ?? '').replaceAll('"', '""')}"`;
  return ['Order,Date,Customer,Service,Payment,Reference,Total,Status', ...state.sales.map(s => [s.id, s.at, s.customer, s.service, s.method, s.reference, (s.totalCents / 100).toFixed(2), s.status].map(cell).join(','))].join('\r\n');
}
