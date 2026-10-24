import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export { pdfjsLib };

export async function validatePdfFile(file: File): Promise<void> {
  if (file.size === 0) {
    throw new Error('The selected PDF is empty.');
  }

  const fileNameIsPdf = file.name.toLowerCase().endsWith('.pdf');
  if (file.type.toLowerCase() !== 'application/pdf' && !fileNameIsPdf) {
    throw new Error('Select a PDF file with a .pdf extension.');
  }

  const data = await file.arrayBuffer();
  const header = new TextDecoder('ascii').decode(data.slice(0, 1024));
  if (!header.includes('%PDF-')) {
    throw new Error('The selected file does not contain a valid PDF header.');
  }

  try {
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdf = await loadingTask.promise;
    try {
      if (pdf.numPages < 1) {
        throw new Error('The selected PDF contains no pages.');
      }
      await pdf.getPage(1);
    } finally {
      await loadingTask.destroy();
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`The selected PDF could not be opened: ${detail}`);
  }
}
