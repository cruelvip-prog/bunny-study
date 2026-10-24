import {
  validateQuestionBankText,
  ValidatedQuestionBank,
} from './questionBank';
import { formatQuestionBankStorageError, validateQuestionBankFile } from './questionBankImport';
import {
  deleteAccountRecord,
  getActiveAccountOwnerId,
  getAllAccountRecords,
  putAccountRecord,
} from './accountStorage';

const QUESTION_BANKS_KEY = 'oinkie_prep_question_banks_v1';
const DATABASE_NAME = 'NeetCbtDatabase';
const DATABASE_VERSION = 3;
const QUESTION_BANK_STORE = 'question_banks';
const PDF_STORE = 'pdf_storage';
const QUESTION_IMAGE_STORE = 'question_images';

export interface StoredQuestionBank {
  id: string;
  fileName: string;
  importedAt: number;
  sourceText?: string;
  sourceBlob?: Blob;
  bank: ValidatedQuestionBank;
}

export interface StoredQuestionBanksResult {
  banks: StoredQuestionBank[];
  error: string | null;
}

function openQuestionBankDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this browser. Use a current browser and ensure site storage is enabled.'));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PDF_STORE)) db.createObjectStore(PDF_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(QUESTION_BANK_STORE)) {
        db.createObjectStore(QUESTION_BANK_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(QUESTION_IMAGE_STORE)) {
        const images = db.createObjectStore(QUESTION_IMAGE_STORE, { keyPath: 'id' });
        images.createIndex('bankId', 'bankId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open durable browser storage.'));
    request.onblocked = () => reject(new Error('Question-bank storage is busy in another tab. Close other OINKIE PREP tabs and retry.'));
  });
}

function isStoredBank(
  value: unknown
): value is Omit<StoredQuestionBank, 'bank' | 'sourceBlob'> & { sourceText: string } {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === 'string' &&
    typeof candidate.fileName === 'string' &&
    Number.isFinite(candidate.importedAt) &&
    typeof candidate.sourceText === 'string';
}

export function readStoredQuestionBanks(): StoredQuestionBanksResult {
  if (getActiveAccountOwnerId()) return { banks: [], error: null };
  try {
    const saved = localStorage.getItem(QUESTION_BANKS_KEY);
    if (!saved) return { banks: [], error: null };

    let parsed: unknown;
    try {
      parsed = JSON.parse(saved);
    } catch (error) {
      return {
        banks: [],
        error: `Saved question banks contain invalid JSON and were preserved: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    if (!Array.isArray(parsed)) {
      return { banks: [], error: 'Saved question banks have an unsupported format and were preserved.' };
    }

    const banks: StoredQuestionBank[] = [];
    const rejected: string[] = [];
    parsed.forEach((entry, index) => {
      if (!isStoredBank(entry)) {
        rejected.push(`Saved bank ${index + 1} has an unsupported record format.`);
        return;
      }
      const result = validateQuestionBankText(entry.sourceText);
      if (!result.bank) {
        rejected.push(`Saved bank "${entry.fileName}" could not be validated: ${result.errors.join(' ')}`);
        return;
      }
      banks.push({ ...entry, bank: result.bank });
    });

    return {
      banks,
      error: rejected.length
        ? `${rejected.length} saved question bank record(s) could not be read and remain preserved. ${rejected.join(' ')}`
        : null,
    };
  } catch (error) {
    return {
      banks: [],
      error: `Could not read saved question banks: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function loadStoredQuestionBanks(): Promise<StoredQuestionBanksResult> {
  const ownerId = getActiveAccountOwnerId();
  if (ownerId) {
    try {
      const records = await getAllAccountRecords<{
        id: string;
        fileName: string;
        importedAt: number;
        sourceBlob: Blob;
      }>(ownerId, 'question_banks');
      const banks: StoredQuestionBank[] = [];
      const rejected: string[] = [];
      for (const record of records) {
        if (typeof record.fileName !== 'string' || !(record.sourceBlob instanceof Blob)) {
          rejected.push('An account question-bank record has an unsupported format and remains preserved.');
          continue;
        }
        try {
          const validation = await validateQuestionBankFile(record.sourceBlob, () => undefined);
          if (!validation.bank) {
            rejected.push(`Saved bank "${record.fileName}" could not be validated: ${validation.errors.join(' ')}`);
            continue;
          }
          banks.push({
            id: record.id,
            fileName: record.fileName,
            importedAt: record.importedAt,
            sourceBlob: record.sourceBlob,
            bank: validation.bank,
          });
        } catch (error) {
          rejected.push(`Saved bank "${record.fileName}" remains stored but could not be loaded: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      return {
        banks: banks.sort((left, right) => right.importedAt - left.importedAt),
        error: rejected.join(' ') || null,
      };
    } catch (error) {
      return {
        banks: [],
        error: `Could not load account question banks: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
  const legacy = readStoredQuestionBanks();
  let db: IDBDatabase;
  try {
    db = await openQuestionBankDatabase();
  } catch (error) {
    return {
      banks: legacy.banks,
      error: [legacy.error, `Could not load saved question banks: ${error instanceof Error ? error.message : String(error)}`].filter(Boolean).join(' '),
    };
  }

  try {
    const records = await new Promise<Array<{ id: string; fileName: string; importedAt: number; sourceBlob: Blob }>>((resolve, reject) => {
      const request = db.transaction([QUESTION_BANK_STORE], 'readonly').objectStore(QUESTION_BANK_STORE).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not read saved question-bank files.'));
    });
    const stored: StoredQuestionBank[] = [];
    const rejected: string[] = [];
    for (const record of records) {
      if (!record || typeof record.id !== 'string' || typeof record.fileName !== 'string' ||
          !(record.sourceBlob instanceof Blob)) {
        rejected.push('A saved question-bank record has an unsupported format and remains preserved.');
        continue;
      }
      try {
        const validation = await validateQuestionBankFile(record.sourceBlob, () => undefined);
        if (!validation.bank) {
          rejected.push(`Saved bank "${record.fileName}" could not be validated: ${validation.errors.join(' ')}`);
          continue;
        }
        stored.push({
          id: record.id,
          fileName: record.fileName,
          importedAt: record.importedAt,
          sourceBlob: record.sourceBlob,
          bank: validation.bank,
        });
      } catch (error) {
        rejected.push(`Saved bank "${record.fileName}" remains in storage but could not be loaded: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const banksById = new Map<string, StoredQuestionBank>();
    for (const bank of [...legacy.banks, ...stored]) banksById.set(bank.id, bank);
    return {
      banks: [...banksById.values()].sort((left, right) => right.importedAt - left.importedAt),
      error: [legacy.error, ...rejected].filter(Boolean).join(' ') || null,
    };
  } catch (error) {
    return {
      banks: legacy.banks,
      error: [legacy.error, `Could not load saved question banks: ${error instanceof Error ? error.message : String(error)}`].filter(Boolean).join(' '),
    };
  } finally {
    db.close();
  }
}

export async function saveQuestionBankFile(
  file: File,
  bank: ValidatedQuestionBank,
): Promise<StoredQuestionBank> {
  const id = `${bank.sourcePdf.subject.trim().toLocaleLowerCase()}:${file.name.trim().toLocaleLowerCase()}`;
  const ownerId = getActiveAccountOwnerId();
  if (ownerId) {
    try {
      const importedAt = Date.now();
      await putAccountRecord(ownerId, 'question_banks', {
        id,
        fileName: file.name,
        importedAt,
        sourceBlob: file,
      });
      return { id, fileName: file.name, importedAt, sourceBlob: file, bank };
    } catch (error) {
      throw new Error(formatQuestionBankStorageError(error, file.size));
    }
  }
  let db: IDBDatabase;
  try {
    db = await openQuestionBankDatabase();
  } catch (error) {
    throw new Error(`Could not save the question bank to durable browser storage: ${error instanceof Error ? error.message : String(error)} Split the bank into smaller files and retry.`);
  }
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([QUESTION_BANK_STORE], 'readwrite');
      const store = transaction.objectStore(QUESTION_BANK_STORE);
      store.put({ id, fileName: file.name, importedAt: Date.now(), sourceBlob: file });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Question-bank storage transaction failed.'));
      transaction.onabort = () => reject(transaction.error || new Error('Question-bank storage transaction was aborted.'));
    });
  } catch (error) {
    throw new Error(formatQuestionBankStorageError(error, file.size));
  } finally {
    db.close();
  }
  return { id, fileName: file.name, importedAt: Date.now(), sourceBlob: file, bank };
}

export async function clearStoredQuestionBanks(): Promise<void> {
  const ownerId = getActiveAccountOwnerId();
  if (ownerId) {
    const banks = await getAllAccountRecords<{ id: string }>(ownerId, 'question_banks');
    const images = await getAllAccountRecords<{ id: string }>(ownerId, 'question_images');
    await Promise.all([
      ...banks.map(({ id }) => deleteAccountRecord(ownerId, 'question_banks', id)),
      ...images.map(({ id }) => deleteAccountRecord(ownerId, 'question_images', id)),
    ]);
    return;
  }
  const db = await openQuestionBankDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([QUESTION_BANK_STORE, QUESTION_IMAGE_STORE], 'readwrite');
      transaction.objectStore(QUESTION_BANK_STORE).clear();
      transaction.objectStore(QUESTION_IMAGE_STORE).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Could not remove saved question-bank data.'));
      transaction.onabort = () => reject(transaction.error || new Error('Question-bank removal was aborted.'));
    });
    localStorage.removeItem(QUESTION_BANKS_KEY);
  } catch (error) {
    throw new Error(`Could not remove saved question banks: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    db.close();
  }
}

export function saveQuestionBank(
  fileName: string,
  sourceText: string
): StoredQuestionBanksResult {
  if (getActiveAccountOwnerId()) {
    throw new Error('Use the durable question-bank import flow for authenticated accounts.');
  }
  const validation = validateQuestionBankText(sourceText);
  if (!validation.bank) {
    throw new Error(`Cannot save an invalid question bank: ${validation.errors.join(' ')}`);
  }

  const existing = readStoredQuestionBanks();
  if (existing.error) throw new Error(existing.error);

  const id = `${validation.bank.sourcePdf.subject.trim().toLocaleLowerCase()}:${fileName.trim().toLocaleLowerCase()}`;
  const next = existing.banks.filter((entry) => entry.id !== id);
  next.push({
    id,
    fileName,
    importedAt: Date.now(),
    sourceText,
    bank: validation.bank,
  });
  next.sort((left, right) => right.importedAt - left.importedAt);

  try {
    localStorage.setItem(QUESTION_BANKS_KEY, JSON.stringify(next.map(({ bank: _bank, ...entry }) => entry)));
  } catch (error) {
    throw new Error(`Could not save the question bank in this browser: ${error instanceof Error ? error.message : String(error)}`);
  }
  return { banks: next, error: null };
}
