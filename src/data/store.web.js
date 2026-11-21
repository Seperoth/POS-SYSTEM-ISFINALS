import { blankState, clone, validateState } from '../domain/model.js';
import { withRestaurantCatalog } from '../domain/menu.js';
import Constants from 'expo-constants';
export async function openStore() {
  // The previous prototype's sample menu is intentionally not migrated.
  localStorage.removeItem('universal-coffee-pos-v1');
  const db = await new Promise((resolve, reject) => {
    const name = Constants.expoConfig?.extra?.appEnvironment === 'development' ? 'universal-pos-development' : 'universal-pos-v2';
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('records');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const read = key => new Promise((resolve, reject) => {
    const request = db.transaction('records').objectStore('records').get(key);
    request.onsuccess = () => resolve(request.result || null); request.onerror = () => reject(request.error);
  });
  return {
    async load() { return validateState(await read('state') || withRestaurantCatalog(blankState())); },
    async save(state, recovery = false) {
      validateState(state);
      const old = recovery ? await read('state') || withRestaurantCatalog(blankState()) : null;
      await new Promise((resolve, reject) => {
        const tx = db.transaction('records', 'readwrite'), records = tx.objectStore('records');
        if (old) records.put(old, 'recovery');
        records.put(clone(state), 'state');
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('Database write was cancelled.'));
      });
    },
    recovery: () => read('recovery'),
  };
}
