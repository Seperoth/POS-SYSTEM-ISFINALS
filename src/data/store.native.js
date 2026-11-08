import * as SQLite from 'expo-sqlite';
import { openSqlStore } from './sql-store.js';
export async function openStore() {
  const db = await SQLite.openDatabaseAsync('universal-pos-v2.db');
  return openSqlStore({
    exec: sql => db.execAsync(sql),
    all: (sql, params = []) => db.getAllAsync(sql, params),
    transaction: callback => db.withExclusiveTransactionAsync(tx => callback({ run: (sql, params = []) => tx.runAsync(sql, params) })),
  });
}
