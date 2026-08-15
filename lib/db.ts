import type { StoredChapter, StoredImage, StoredWorld } from './types';

/**
 * IndexedDB is the only storage this app has — no accounts, no backend, no
 * recovery. Images are Blobs rather than data URLs: a third smaller and faster
 * to decode. See docs/SCHEMA.md § Storage.
 */
const DB_NAME = 'story-sim';
const DB_VERSION = 1;

export const STORE = {
  worlds: 'worlds',
  chapters: 'chapters',
  images: 'images',
} as const;

let dbPromise: Promise<IDBDatabase> | null = null;

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE.worlds)) {
        db.createObjectStore(STORE.worlds, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE.chapters)) {
        const chapters = db.createObjectStore(STORE.chapters, { keyPath: 'id' });
        chapters.createIndex('worldId', 'worldId');
      }
      if (!db.objectStoreNames.contains(STORE.images)) {
        const images = db.createObjectStore(STORE.images, { keyPath: 'id' });
        images.createIndex('chapterId', 'chapterId');
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

async function tx<T>(
  stores: string[],
  mode: IDBTransactionMode,
  run: (t: IDBTransaction) => Promise<T>,
): Promise<T> {
  const db = await openDb();
  const transaction = db.transaction(stores, mode);
  const result = await run(transaction);
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  return result;
}

/**
 * A world silently evicted with no warning is the worst failure available to an
 * app with no accounts. Requested once, on first world creation.
 */
export async function requestPersistence(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

export async function storageEstimate(): Promise<{ usage: number; quota: number; persisted: boolean }> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return { usage: 0, quota: 0, persisted: false };
  }
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false;
  return { usage, quota, persisted };
}

// ── Worlds ────────────────────────────────────────────────────────────────

export async function putWorld(world: StoredWorld): Promise<void> {
  await tx([STORE.worlds], 'readwrite', async (t) => {
    await promisify(t.objectStore(STORE.worlds).put(world));
  });
}

export async function getWorld(id: string): Promise<StoredWorld | undefined> {
  return tx([STORE.worlds], 'readonly', (t) =>
    promisify<StoredWorld | undefined>(t.objectStore(STORE.worlds).get(id)),
  );
}

export async function listWorlds(): Promise<StoredWorld[]> {
  const worlds = await tx([STORE.worlds], 'readonly', (t) =>
    promisify<StoredWorld[]>(t.objectStore(STORE.worlds).getAll()),
  );
  return worlds.sort((a, b) => b.createdAt - a.createdAt);
}

/** Cascades: a world's chapters and their images go with it. */
export async function deleteWorld(worldId: string): Promise<void> {
  const chapters = await listChapters(worldId);
  await tx([STORE.worlds, STORE.chapters, STORE.images], 'readwrite', async (t) => {
    const imageStore = t.objectStore(STORE.images);
    const chapterStore = t.objectStore(STORE.chapters);
    for (const chapter of chapters) {
      const keys = await promisify<IDBValidKey[]>(
        imageStore.index('chapterId').getAllKeys(chapter.id),
      );
      for (const key of keys) imageStore.delete(key);
      chapterStore.delete(chapter.id);
    }
    t.objectStore(STORE.worlds).delete(worldId);
  });
}

export async function deleteEverything(): Promise<void> {
  await tx([STORE.worlds, STORE.chapters, STORE.images], 'readwrite', async (t) => {
    t.objectStore(STORE.worlds).clear();
    t.objectStore(STORE.chapters).clear();
    t.objectStore(STORE.images).clear();
  });
}

// ── Chapters ──────────────────────────────────────────────────────────────

export async function putChapter(chapter: StoredChapter): Promise<void> {
  await tx([STORE.chapters], 'readwrite', async (t) => {
    await promisify(t.objectStore(STORE.chapters).put(chapter));
  });
}

export async function listChapters(worldId: string): Promise<StoredChapter[]> {
  const chapters = await tx([STORE.chapters], 'readonly', (t) =>
    promisify<StoredChapter[]>(t.objectStore(STORE.chapters).index('worldId').getAll(worldId)),
  );
  return chapters.sort((a, b) => a.number - b.number);
}

// ── Images ────────────────────────────────────────────────────────────────

export async function putImage(image: StoredImage): Promise<void> {
  await tx([STORE.images], 'readwrite', async (t) => {
    await promisify(t.objectStore(STORE.images).put(image));
  });
}

export async function listImages(chapterId: string): Promise<StoredImage[]> {
  return tx([STORE.images], 'readonly', (t) =>
    promisify<StoredImage[]>(t.objectStore(STORE.images).index('chapterId').getAll(chapterId)),
  );
}

export function imageId(chapterId: string, pageIndex: number): string {
  return `${chapterId}:${pageIndex}`;
}
