import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileJson,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
import { useRef, type ChangeEvent } from 'react';
import { QUESTION_BANK_IMPORT_MAX } from '../questionBanks/adminContracts';
import type {
  QuestionBankAdminSectionDefinition,
  QuestionBankSourceDefinition,
  QuestionBankSubject,
} from '../questionBanks/sourceRegistry';
import type { QuestionBankImportResponse } from '../questionBanks/adminContracts';
import type { ExamImage } from '../types/exam';
import { QuestionImages } from '../components/QuestionImages';

const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60';
const secondaryButtonClass =
  'inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60';

export interface QuestionBankImportPreviewSummary {
  fileName: string;
  format: string;
  validCount: number;
  invalid: string[];
  warnings: string[];
  tooMany: boolean;
  sample: string;
  images?: ExamImage[];
}

interface QuestionBankImportPanelProps {
  source: QuestionBankSourceDefinition;
  section: QuestionBankAdminSectionDefinition | null;
  lockedSubject: QuestionBankSubject | null;
  preview: QuestionBankImportPreviewSummary | null;
  importError: string;
  result: QuestionBankImportResponse | null;
  isImporting: boolean;
  onFile: (file: File) => void;
  onCancelPreview: () => void;
  onConfirmImport: () => void;
  onDownloadTemplate: () => void;
}

export function QuestionBankImportPanel({
  source,
  section,
  lockedSubject,
  preview,
  importError,
  result,
  isImporting,
  onFile,
  onCancelPreview,
  onConfirmImport,
  onDownloadTemplate,
}: QuestionBankImportPanelProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const destinationSubject = source.subjectField
    ? lockedSubject ?? source.fixedSubject
    : null;
  const canConfirm = Boolean(
    preview
      && preview.validCount > 0
      && preview.invalid.length === 0
      && !preview.tooMany
      && !isImporting,
  );

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) onFile(file);
  };

  return (
    <section className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <FileJson className="h-4 w-4 text-emerald-700" />
            <h2 className="text-sm font-extrabold text-slate-900">Import / Export JSON</h2>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Download a schema-correct template or import a validated JSON file for{' '}
            <strong className="text-slate-700">{section?.label ?? source.label}</strong> (
            <span className="font-mono text-[10px]">{source.table}</span>
            {destinationSubject ? ` · ${source.subjectField ?? 'subject'} = ${destinationSubject}` : ''}).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className={primaryButtonClass}
          >
            <Upload className="h-4 w-4" /> Import JSON
          </button>
          <button type="button" onClick={onDownloadTemplate} className={secondaryButtonClass}>
            <Download className="h-4 w-4" /> Download JSON Template
          </button>
        </div>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        className="sr-only"
        aria-label={`Import JSON for ${section?.label ?? source.label}`}
        onChange={handleFile}
      />

      <p className="mt-3 text-[11px] leading-5 text-slate-500">
        Maximum {QUESTION_BANK_IMPORT_MAX.toLocaleString('en-US')} questions and 20 MiB per file.
        Every record is validated for this section before the preview appears. Nothing is written
        until you confirm, and existing rows are never overwritten. Image metadata is supported and is normalized and uploaded through the
        trusted server API during import.
      </p>

      {importError && (
        <div
          role="alert"
          className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800"
        >
          <p className="flex items-center gap-2 font-bold">
            <AlertCircle className="h-4 w-4" /> Import file rejected
          </p>
          <p className="mt-1">{importError}</p>
        </div>
      )}

      {preview && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs font-extrabold text-slate-800">
                Preview · {preview.fileName}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Format: <span className="font-mono">{preview.format}</span> · Destination:{' '}
                <span className="font-mono">{source.table}</span>
                {destinationSubject ? ` · ${source.subjectField ?? 'subject'} = ${destinationSubject}` : ''}
              </p>
            </div>
            <div className="flex gap-2 text-[11px] font-bold">
              <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-800">
                {preview.validCount} valid
              </span>
              <span
                className={`rounded-full px-2 py-1 ${
                  preview.invalid.length
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {preview.invalid.length} invalid
              </span>
            </div>
          </div>

          {preview.sample && (
            <p className="mt-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] leading-5 text-slate-600">
              <strong className="text-slate-800">Sample:</strong> {preview.sample}
            </p>
          )}

          {preview.images && preview.images.length > 0 && (
            <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Image preview</p>
              {preview.images.some((image) => image.type === 'question') && (
                <QuestionImages images={preview.images} type="question" />
              )}
              {(['A', 'B', 'C', 'D'] as const).map((letter) =>
                preview.images?.some((image) => image.type === 'option' && image.option === letter) ? (
                  <div key={letter} className="mt-2">
                    <p className="text-[10px] font-medium text-slate-500">Option {letter}</p>
                    <QuestionImages images={preview.images} type="option" option={letter} />
                  </div>
                ) : null,
              )}
              {preview.images.some((image) => image.type === 'explanation') && (
                <div className="mt-2">
                  <p className="text-[10px] font-medium text-slate-500">Explanation image</p>
                  <QuestionImages images={preview.images} type="explanation" />
                </div>
              )}
            </div>
          )}

          {preview.tooMany && (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] font-bold leading-5 text-amber-900">
              This file has more than {QUESTION_BANK_IMPORT_MAX.toLocaleString('en-US')} questions.
              Reduce it before importing. Nothing will be written.
            </p>
          )}

          {preview.warnings.length > 0 && (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] leading-5 text-amber-900">
              {preview.warnings.map((warning, index) => (
                <p key={`${warning}-${index}`}>{warning}</p>
              ))}
            </div>
          )}

          {preview.invalid.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-[11px] font-bold text-rose-700">
                Show {preview.invalid.length} validation issue
                {preview.invalid.length === 1 ? '' : 's'}
              </summary>
              <ul className="mt-1 max-h-44 list-disc space-y-1 overflow-y-auto pl-5 text-[10px] leading-4 text-rose-700">
                {preview.invalid.map((issue, index) => (
                  <li key={`${issue}-${index}`}>{issue}</li>
                ))}
              </ul>
            </details>
          )}

          {preview.invalid.length > 0 && (
            <p className="mt-2 text-[11px] font-bold text-rose-700">
              Fix every invalid record and re-import. Invalid records are never sent to the server.
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onConfirmImport}
              disabled={!canConfirm}
              className={primaryButtonClass}
            >
              {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {isImporting
                ? 'Importing...'
                : `Confirm import${preview.validCount ? ` (${preview.validCount})` : ''}`}
            </button>
            <button
              type="button"
              onClick={onCancelPreview}
              disabled={isImporting}
              className={secondaryButtonClass}
            >
              <X className="h-4 w-4" /> Cancel preview
            </button>
          </div>
        </div>
      )}

      {result && (
        <div
          className={`mt-3 rounded-xl border px-3 py-2 text-xs leading-5 ${
            result.failures.length
              ? 'border-amber-200 bg-amber-50 text-amber-900'
              : 'border-emerald-200 bg-emerald-50 text-emerald-900'
          }`}
        >
          <p className="flex items-center gap-2 font-extrabold">
            {result.failures.length
              ? <AlertCircle className="h-4 w-4" />
              : <CheckCircle2 className="h-4 w-4" />}
            Inserted {result.inserted.length} question{result.inserted.length === 1 ? '' : 's'} into{' '}
            {result.label} ({result.table})
          </p>
          {result.failures.length > 0 && (
            <>
              <p className="mt-1">{result.failures.length} record(s) failed. Existing rows were not overwritten.</p>
              <ul className="mt-1 max-h-40 list-disc space-y-1 overflow-y-auto pl-5 text-[10px]">
                {result.failures.slice(0, 20).map((failure) => (
                  <li key={`${failure.index}-${failure.message}`}>
                    Record {failure.index + 1}: {failure.message}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
