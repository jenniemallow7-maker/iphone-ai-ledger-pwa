import type { LedgerEntry } from "./types";

const DB_NAME = "ai-ledger-db";
const DB_VERSION = 1;
const STORE_NAME = "entries";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("date", "date", { unique: false });
        store.createIndex("type", "type", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T | void> {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const request = callback(store);

    if (request) {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }

    tx.oncomplete = () => {
      if (!request) resolve();
      db.close();
    };
    tx.onerror = () => {
      reject(tx.error);
      db.close();
    };
  });
}

export async function getEntries(): Promise<LedgerEntry[]> {
  const entries = (await withStore<LedgerEntry[]>("readonly", (store) => store.getAll())) || [];
  return entries.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

export async function addEntry(entry: LedgerEntry): Promise<void> {
  await withStore("readwrite", (store) => {
    store.put(entry);
  });
}

export async function deleteEntry(id: string): Promise<void> {
  await withStore("readwrite", (store) => {
    store.delete(id);
  });
}
