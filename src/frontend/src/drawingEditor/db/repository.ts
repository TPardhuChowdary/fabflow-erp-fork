// Generic repository pattern over IndexedDB — identical shape to
// qms/db/repository.ts, duplicated rather than imported so this module has
// zero import edges into qms/ or the main ERP (see types.ts header).

import { openDrawingEditorDatabase } from "./database";

export class Repository<T extends { id: string }> {
  constructor(private storeName: string) {}

  private async run<R>(
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => IDBRequest<R>,
  ): Promise<R> {
    const db = await openDrawingEditorDatabase();
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

  async remove(id: string): Promise<void> {
    await this.run("readwrite", (store) => store.delete(id));
  }

  queryByIndex(indexName: string, value: IDBValidKey): Promise<T[]> {
    return new Promise((resolve, reject) => {
      openDrawingEditorDatabase().then((db) => {
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
}
