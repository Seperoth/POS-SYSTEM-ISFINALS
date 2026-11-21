import { clone, validateProduct } from './model.js';
import restaurantCatalog from './restaurant-catalog.json' with { type: 'json' };

export const MENU_CATEGORIES = ['Appetizer', 'Entree', 'Drinks', 'Dessert', 'Sides'];
const aliases = {
  Appetizer: ['APPETIZER', 'APPETIZERS', 'STARTERS'],
  Entree: ['ENTREE', 'ENTREES', 'ENTRÉE', 'ENTRÉES', 'FOOD', 'FOODS', 'RICE MEALS', 'RICE', 'MEALS'],
  Drinks: ['DRINKS', 'DRINK', 'BEVERAGES', 'BEVERAGE', 'COFFEE', 'MATCHA'],
  Dessert: ['DESSERT', 'DESSERTS', 'CONFECTIONERY', 'CONFECTIONERIES', 'SWEETS', 'CANDY'],
  Sides: ['SIDES', 'SIDE', 'EXTRAS', 'EXTRA'],
};
// Recognize explicit old category names; never guess from the product name.
// Unrecognized legacy categories remain readable until the owner assigns one.
export function menuCategory(value) {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toUpperCase() : '';
  return MENU_CATEGORIES.find(category => aliases[category].includes(name)) || null;
}
export function saveMenuItem(state, product) {
  const item = clone(product);
  if (!MENU_CATEGORIES.includes(item.category)) throw new Error('Choose a restaurant category.');
  validateProduct(item);
  const existing = state.products.find(product => product.id === item.id);
  if (existing?.deletedAt || item.deletedAt) throw new Error('This menu item has been removed.');
  item.trackInventory = false;
  const next = clone(state);
  next.products = existing ? next.products.map(product => product.id === item.id ? item : product) : [...next.products, item];
  return next;
}
export function withRestaurantCatalog(state) {
  const existing = new Set(state.products.map(product => product.id));
  const additions = restaurantCatalog.filter(dish => !existing.has(dish.id)).map(dish => ({
    id: dish.id, name: dish.name, category: dish.category, description: dish.ingredient,
    active: true, trackInventory: false,
    variants: [{ id: 'regular', name: 'Regular', price: dish.price }], modifierGroups: [],
  }));
  return { ...state, products: [...state.products, ...additions] };
}
export function removeMenuItem(state, productId, now = new Date().toISOString()) {
  const product = state.products.find(product => product.id === productId && !product.deletedAt);
  if (!product) throw new Error('This menu item has already been removed.');
  if ([state.draft, ...state.held.map(order => order.draft)].some(draft => draft.items.some(item => item.productId === productId))) {
    throw new Error('Remove this item from the current and held orders first.');
  }
  const next = clone(state), item = next.products.find(item => item.id === productId);
  item.deletedAt = now;
  item.active = false;
  return next;
}
