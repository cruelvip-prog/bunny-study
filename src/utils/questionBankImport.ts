import { BankValidationResult } from './questionBank';

export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MiB`;
  return `${Math.ceil(bytes / 1024)} KiB`;
}

export function formatQuestionBankStorageError(error: unknown, fileSize: number): string {
  const cause = error instanceof Error ? error : new Error(String(error));
  if (cause.name === 'QuotaExceededError') {
    return `Browser storage is full; this ${formatFileSize(fileSize)} bank was not saved. Export or remove unused saved banks, reduce embedded image size/count, or split the bank into smaller JSON files. No questions or images were discarded.`;
  }
  return `Could not save the question bank: ${cause.message}. No questions or images were discarded.`;
}

export function validateQuestionBankFile(
  file: Blob,
  onProgress: (stage: string) => void,
): Promise<BankValidationResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./questionBankValidationWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<{
      type: 'progress' | 'result' | 'error';
      stage?: string;
      result?: BankValidationResult;
      message?: string;
    }>) => {
      if (event.data.type === 'progress' && event.data.stage) {
        onProgress(event.data.stage);
      } else if (event.data.type === 'result' && event.data.result) {
        worker.terminate();
        resolve(event.data.result);
      } else if (event.data.type === 'error') {
        worker.terminate();
        reject(new Error(event.data.message || 'Could not parse the question-bank file.'));
      }
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(`Question-bank validation worker failed: ${event.message || 'unknown worker error'}`));
    };
    worker.postMessage(file);
  });
}
