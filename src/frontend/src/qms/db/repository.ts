// Generic repository pattern over IndexedDB — the persistence seam QMS_ARCHITECTURE.md
// Section 1/7 calls for. Every QMS entity store goes through an instance of this class;
// nothing in qms/api or above talks to IndexedDB directly.

import { openQmsDatabase } from "./database";

export class Repository<T extends { id: string }> {
  constructor(private storeName: string) {}

  private async run<R>(
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => IDBRequest<R>,
  ): Promise<R> {
    const db = await openQmsDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, mode);
      const store = tx.objectStore(this.storeName);
      const request = fn(store);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  getAll(): Promise<T[]> {
    return this.run("readonly", (store) => store.getAll());
  }

  getById(id: string): Promise<T | undefined> {
    return this.run("readonly", (store) => store.get(id));
  }

  async put(item: T): Promise<T> {
    await this.run("readwrite", (store) => store.put(item));
    return item;
  }

  async putMany(items: T[]): Promise<void> {
    if (items.length === 0) return;
    const db = await openQmsDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.storeName, "readwrite");
      const store = tx.objectStore(this.storeName);
      for (const item of items) store.put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async remove(id: string): Promise<void> {
    await this.run("readwrite", (store) => store.delete(id));
  }

  queryByIndex(indexName: string, value: IDBValidKey): Promise<T[]> {
    return new Promise((resolve, reject) => {
      openQmsDatabase().then((db) => {
        const tx = db.transaction(this.storeName, "readonly");
        const request = tx
          .objectStore(this.storeName)
          .index(indexName)
          .getAll(value);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }, reject);
    });
  }

  async count(): Promise<number> {
    return this.run("readonly", (store) => store.count());
  }
}
