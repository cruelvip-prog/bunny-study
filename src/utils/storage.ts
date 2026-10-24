import { ExamSessionState } from '../types/exam';
import { validateAndNormalizeSession } from './examLogic';
import { ValidatedQuestionBank } from './questionBank';
import {
  deleteAccountRecord,
  getAccountRecord,
  getAllAccountRecords,
  getActiveAccountOwnerId,
  putAccountRecord,
  readAccountLocalValue,
  removeAccountLocalValue,
  writeAccountLocalValue,
} from './accountStorage';

const STORAGE_SESSION_KEY = 'neet_cbt_active_session_v1';
const DB_NAME = 'NeetCbtDatabase';
const DB_VERSION = 3;
const STORE_NAME = 'pdf_storage';
const QUESTION_IMAGE_STORE = 'question_images';
const QUESTION_BANK_STORE = 'question_banks';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(QUESTION_IMAGE_STORE)) {
        const imageStore = db.createObjectStore(QUESTION_IMAGE_STORE, { keyPath: 'id' });
        imageStore.createIndex('bankId', 'bankId', { unique: false });
      }
      if (!db.objectStoreNames.contains(QUESTION_BANK_STORE)) {
        db.createObjectStore(QUESTION_BANK_STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveQuestionImagesToIndexedDB(
  bankId: string,
  bank: ValidatedQuestionBank,
): Promise<void> {
  const ownerId = getActiveAccountOwnerId();
  const images = new Map<string, { id: string; bankId: string; imageId: string; mimeType: string; data: Blob }>();
  for (const question of bank.questions) {
    for (const image of question.images || []) {
      if (!image.dataUri) continue;
      const response = await fetch(image.dataUri);
      if (!response.ok) throw new Error(`Could not decode image "${image.id}" for durable storage.`);
      const data = await response.blob();
      images.set(image.id, { id: `${bankId}:${image.id}`, bankId, imageId: image.id, mimeType: image.mimeType, data });
    }
  }
  if (ownerId) {
    const existing = await getAllAccountRecords<{ id: string; bankId?: string }>(ownerId, 'question_images');
    await Promise.all(existing
      .filter((record) => record.bankId === bankId)
      .map((record) => deleteAccountRecord(ownerId, 'question_images', record.id)));
    await Promise.all([...images.values()].map((record) => putAccountRecord(ownerId, 'question_images', record)));
    return;
  }
  try {
    const db = await openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction([QUESTION_IMAGE_STORE], 'readwrite');
        const store = transaction.objectStore(QUESTION_IMAGE_STORE);
        const cursorRequest = store.index('bankId').openKeyCursor(IDBKeyRange.only(bankId));
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (cursor) {
            store.delete(cursor.primaryKey);
            cursor.continue();
            return;
          }
          for (const record of images.values()) store.put(record);
        };
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error('Question image storage transaction failed.'));
        transaction.onabort = () => reject(transaction.error || new Error('Question image storage transaction was aborted.'));
      });
    } finally {
      db.close();
    }
  } catch (error) {
    throw new Error(`Could not save embedded question images in durable browser storage: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function getQuestionImageFromIndexedDB(id: string): Promise<Blob | null> {
  const ownerId = getActiveAccountOwnerId();
  if (ownerId) {
    const record = await getAccountRecord<{ id: string; data?: Blob }>(ownerId, 'question_images', id);
    return record?.data || null;
  }
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction([QUESTION_IMAGE_STORE], 'readonly').objectStore(QUESTION_IMAGE_STORE).get(id);
      request.onsuccess = () => resolve(request.result?.data || null);
      request.onerror = () => reject(request.error || new Error('Could not read the saved question image.'));
    });
  } finally {
    db.close();
  }
}

export async function deleteQuestionImagesFromIndexedDB(bankId: string): Promise<void> {
  const ownerId = getActiveAccountOwnerId();
  if (ownerId) {
    const records = await getAllAccountRecords<{ id: string; bankId?: string }>(ownerId, 'question_images');
    await Promise.all(records
      .filter((record) => record.bankId === bankId)
      .map((record) => deleteAccountRecord(ownerId, 'question_images', record.id)));
    return;
  }
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([QUESTION_IMAGE_STORE], 'readwrite');
      const store = transaction.objectStore(QUESTION_IMAGE_STORE);
      const request = store.index('bankId').openKeyCursor(IDBKeyRange.only(bankId));
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          store.delete(cursor.primaryKey);
          cursor.continue();
          return;
        }
        resolve();
      };
      request.onerror = () => reject(request.error || new Error('Could not delete saved question images.'));
      transaction.onerror = () => reject(transaction.error || new Error('Question image deletion failed.'));
      transaction.onabort = () => reject(transaction.error || new Error('Question image deletion was aborted.'));
    });
  } finally {
    db.close();
  }
}

export async function savePdfToIndexedDB(id: string, fileData: Blob | ArrayBuffer): Promise<void> {
  const ownerId = getActiveAccountOwnerId();
  if (ownerId) {
    await putAccountRecord(ownerId, 'pdf_storage', { id, data: fileData, timestamp: Date.now() });
    return;
  }
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.put({ id, data: fileData, timestamp: Date.now() });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('PDF storage transaction was aborted'));
    });
  } catch (err) {
    console.error('Failed to save PDF to IndexedDB', err);
    throw err;
  }
}

export async function getPdfFromIndexedDB(id: string): Promise<ArrayBuffer | Blob | null> {
  const ownerId = getActiveAccountOwnerId();
  if (ownerId) {
    const record = await getAccountRecord<{ id: string; data?: ArrayBuffer | Blob }>(ownerId, 'pdf_storage', id);
    return record?.data || null;
  }
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => {
        if (request.result && request.result.data) {
          resolve(request.result.data);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('Failed to get PDF from IndexedDB', err);
    throw err;
  }
}

export async function deletePdfFromIndexedDB(id: string): Promise<void> {
  const ownerId = getActiveAccountOwnerId();
  if (ownerId) {
    await deleteAccountRecord(ownerId, 'pdf_storage', id);
    return;
  }
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('Failed to delete PDF from IndexedDB', err);
  }
}

export function saveSessionState(session: ExamSessionState): void {
  try {
    const ownerId = getActiveAccountOwnerId();
    if (ownerId) writeAccountLocalValue(ownerId, STORAGE_SESSION_KEY, JSON.stringify(session));
    else localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(session));
  } catch (err) {
    console.error('Failed to save exam session to localStorage', err);
    throw new Error(`Could not save exam progress in this browser: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function readSavedSessionState(): { session: ExamSessionState | null; error: string | null } {
  try {
    const ownerId = getActiveAccountOwnerId();
    const item = ownerId
      ? readAccountLocalValue(ownerId, STORAGE_SESSION_KEY)
      : localStorage.getItem(STORAGE_SESSION_KEY);
    if (!item) return { session: null, error: null };
    let parsed: unknown;
    try {
      parsed = JSON.parse(item);
    } catch (err) {
      return {
        session: null,
        error: `Saved exam data contains invalid JSON and was preserved: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    return validateAndNormalizeSession(parsed);
  } catch (err) {
    return {
      session: null,
      error: `Could not read saved exam progress: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export function getSavedSessionState(): ExamSessionState | null {
  const result = readSavedSessionState();
  if (result.error) console.error(result.error);
  return result.session;
}

export function clearSavedSessionState(): void {
  try {
    const ownerId = getActiveAccountOwnerId();
    if (ownerId) removeAccountLocalValue(ownerId, STORAGE_SESSION_KEY);
    else localStorage.removeItem(STORAGE_SESSION_KEY);
  } catch (err) {
    console.error('Failed to clear exam session', err);
  }
}

export function getSessionStorageKey(): string {
  return STORAGE_SESSION_KEY;
}
