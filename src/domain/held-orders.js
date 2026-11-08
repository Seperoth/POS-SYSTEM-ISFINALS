import { clone, uid } from './model.js';

function findHeldOrder(state, id) {
  const order = state.held.find(order => order.id === id);
  if (!order) throw new Error('This held order is no longer available.');
  return order;
}
export function cancelHeldOrder(state, id) {
  findHeldOrder(state, id);
  const next = clone(state);
  next.held = next.held.filter(order => order.id !== id);
  return next;
}
export function resumeHeldOrder(state, id) {
  const held = findHeldOrder(state, id), next = clone(state);
  next.held = next.held.filter(order => order.id !== id);
  if (next.draft.items.length) next.held.push({ id: uid('hold'), at: new Date().toISOString(), draft: clone(next.draft) });
  next.draft = clone(held.draft);
  return next;
}
