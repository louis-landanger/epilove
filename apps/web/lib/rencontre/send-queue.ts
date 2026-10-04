"use client";

/**
 * Offline send queue (CHAT-02): messages written without network are kept in
 * IndexedDB and sent when the connection comes back, with their original
 * client-generated id (so a double send is harmless). Stored on the device
 * only, and only until the server confirms.
 */
export interface QueuedMessage {
  readonly id: string;
  readonly matchId: string;
  readonly text: string;
  readonly replyTo: string | null;
  readonly createdAt: string;
}

const DB_NAME = "atomes-rencontre";
const STORE = "outgoing-messages";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, { keyPath: "id" });
      store.createIndex("matchId", "matchId");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

const available = () => typeof indexedDB !== "undefined";

export async function queueMessage(message: QueuedMessage): Promise<void> {
  if (available()) {
    await withStore("readwrite", (store) => store.put(message));
  }
}

export async function dequeueMessage(id: string): Promise<void> {
  if (available()) {
    await withStore("readwrite", (store) => store.delete(id));
  }
}

export async function queuedMessages(matchId: string): Promise<QueuedMessage[]> {
  if (!available()) {
    return [];
  }
  const all = await withStore<QueuedMessage[]>("readonly", (store) => store.index("matchId").getAll(matchId));
  return all.sort((a, b) => (a.id < b.id ? -1 : 1));
}
