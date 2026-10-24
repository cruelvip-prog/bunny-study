export const ACCOUNT_DATABASE_NAME = 'NeetCbtAccountDatabase';
export const ACCOUNT_DATABASE_VERSION = 1;

export const ACCOUNT_STORES = ['pdf_storage', 'question_banks', 'question_images'] as const;

export type AccountStoreName = typeof ACCOUNT_STORES[number];

export interface AccountRecord {
  id: string;
  [key: string]: unknown;
}

interface OwnedAccountRecord extends AccountRecord {
  ownerId: string;
}

const OWNER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCAL_STORAGE_PREFIX = 'oinkie:account:v1';
let activeAccountOwnerId: string | null = null;

export function setActiveAccountOwnerId(ownerId: string | null): void {
  activeAccountOwnerId = ownerId === null ? null : validateOwnerId(ownerId);
}

export function getActiveAccountOwnerId(): string | null {
  return activeAccountOwnerId;
}

export function validateOwnerId(ownerId: unknown): string {
  if (typeof ownerId !== 'string' || !OWNER_ID_PATTERN.test(ownerId)) {
    throw new Error('A valid account owner UUID is required for account-scoped storage.');
  }
  return ownerId.toLowerCase();
}

function validateStorageKey(key: string): string {
  if (!key.trim() || /[\u0000-\u001f\u007f]/.test(key)) {
    throw new Error('A non-empty, printable storage key is required.');
  }
  return key;
}

export function getAccountLocalStorageKey(ownerId: string, key: string): string {
  return `${LOCAL_STORAGE_PREFIX}:${validateOwnerId(ownerId)}:${encodeURIComponent(validateStorageKey(key))}`;
}

export function readAccountLocalValue(ownerId: string, key: string): string | null {
  return localStorage.getItem(getAccountLocalStorageKey(ownerId, key));
}

export function writeAccountLocalValue(ownerId: string, key: string, value: string): void {
  localStorage.setItem(getAccountLocalStorageKey(ownerId, key), value);
}

export function removeAccountLocalValue(ownerId: string, key: string): void {
  localStorage.removeItem(getAccountLocalStorageKey(ownerId, key));
}

function validateRecordId(id: string): string {
  if (!id.trim()) throw new Error('A non-empty record ID is required for account-scoped storage.');
  return id;
}

function validateStoreName(storeName: AccountStoreName): AccountStoreName {
  if (!ACCOUNT_STORES.includes(storeName)) throw new Error('Unsupported account storage store.');
  return storeName;
}

function openAccountDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this browser.'));
      return;
    }

    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(ACCOUNT_DATABASE_NAME, ACCOUNT_DATABASE_VERSION);
    } catch (error) {
      reject(error);
      return;
    }
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    request.onupgradeneeded = () => {
      const database = request.result;
      for (const storeName of ACCOUNT_STORES) {
        const store = database.objectStoreNames.contains(storeName)
          ? request.transaction?.objectStore(storeName)
          : database.createObjectStore(storeName, { keyPath: ['ownerId', 'id'] });
        if (store && !store.indexNames.contains('ownerId')) {
          store.createIndex('ownerId', 'ownerId', { unique: false });
        }
      }
    };
    request.onsuccess = () => {
      if (settled) {
        request.result.close();
        return;
      }
      settled = true;
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => fail(request.error || new Error('Could not open account-scoped browser storage.'));
    request.onblocked = () => fail(new Error('Account-scoped browser storage is busy in another tab. Close other OINKIE Study tabs and retry.'));
  });
}

interface AccountTransactionOperation<T> {
  requests: IDBRequest[];
  getResult: () => T;
}

function withAccountTransaction<T>(
  ownerId: string,
  storeName: AccountStoreName,
  mode: IDBTransactionMode,
  operate: (store: IDBObjectStore, normalizedOwnerId: string) => AccountTransactionOperation<T>,
): Promise<T> {
  const normalizedOwnerId = validateOwnerId(ownerId);
  const validStoreName = validateStoreName(storeName);

  return openAccountDatabase().then((database) => new Promise<T>((resolve, reject) => {
    let operation: AccountTransactionOperation<T>;
    let transaction: IDBTransaction;
    let settled = false;
    let requestError: DOMException | null = null;
    const finish = (error?: unknown, result?: T) => {
      if (settled) return;
      settled = true;
      database.close();
      if (error) reject(error);
      else resolve(result as T);
    };
    try {
      transaction = database.transaction([validStoreName], mode);
      operation = operate(transaction.objectStore(validStoreName), normalizedOwnerId);
    } catch (error) {
      database.close();
      reject(error);
      return;
    }

    for (const request of operation.requests) {
      request.onerror = () => {
        requestError = request.error || new DOMException('Account-scoped storage request failed.');
      };
    }
    transaction.oncomplete = () => {
      if (requestError) {
        finish(requestError);
        return;
      }
      try {
        finish(undefined, operation.getResult());
      } catch (error) {
        finish(error);
      }
    };
    transaction.onerror = () => {
      finish(transaction.error || requestError || new Error('Account-scoped storage transaction failed.'));
    };
    transaction.onabort = () => {
      finish(transaction.error || requestError || new Error('Account-scoped storage transaction was aborted.'));
    };
  }));
}

export function putAccountRecord<T extends AccountRecord>(
  ownerId: string,
  storeName: AccountStoreName,
  record: T,
): Promise<void> {
  const id = validateRecordId(record.id);
  return withAccountTransaction(ownerId, storeName, 'readwrite', (store, normalizedOwnerId) => {
    const request = store.put({ ...record, id, ownerId: normalizedOwnerId } satisfies OwnedAccountRecord);
    return { requests: [request], getResult: () => undefined };
  });
}

export function getAccountRecord<T extends AccountRecord>(
  ownerId: string,
  storeName: AccountStoreName,
  id: string,
): Promise<T | null> {
  const recordId = validateRecordId(id);
  return withAccountTransaction(ownerId, storeName, 'readonly', (store, normalizedOwnerId) => {
    const request = store.get([normalizedOwnerId, recordId]);
    return {
      requests: [request],
      getResult: () => {
      const record = request.result as OwnedAccountRecord | undefined;
        if (!record) return null;
        const { ownerId: _ownerId, ...value } = record;
        return value as T;
      },
    };
  });
}

export function getAllAccountRecords<T extends AccountRecord>(
  ownerId: string,
  storeName: AccountStoreName,
): Promise<T[]> {
  return withAccountTransaction(ownerId, storeName, 'readonly', (store, normalizedOwnerId) => {
    const request = store.index('ownerId').getAll(normalizedOwnerId);
    return {
      requests: [request],
      getResult: () => (request.result as OwnedAccountRecord[]).map((record) => {
        const { ownerId: _ownerId, ...value } = record;
        return value as T;
      }),
    };
  });
}

export function deleteAccountRecord(
  ownerId: string,
  storeName: AccountStoreName,
  id: string,
): Promise<void> {
  const recordId = validateRecordId(id);
  return withAccountTransaction(ownerId, storeName, 'readwrite', (store, normalizedOwnerId) => {
    const request = store.delete([normalizedOwnerId, recordId]);
    return { requests: [request], getResult: () => undefined };
  });
}
