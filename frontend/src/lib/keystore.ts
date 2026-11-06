/** Keeps this device's chat key in IndexedDB, per account, so chats open with nothing to type. It stays after sign-out (see Settings > Secure chat). */

const DB = "campuspool-secure-chat";
const STORE = "keys";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

type Saved = { publicKey: string; privateKey: CryptoKey };

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

export const loadKey = (userId: number) => run<Saved | undefined>("readonly", (s) => s.get(String(userId)));
export const saveKey = (userId: number, value: Saved) => run("readwrite", (s) => s.put(value, String(userId)));
export const forgetKey = (userId: number) => run("readwrite", (s) => s.delete(String(userId)));
