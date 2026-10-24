import {
  QUESTION_BANK_TEMPLATE_FORMAT,
  QUESTION_BANK_TEMPLATE_SCHEMA_VERSION,
} from './questionTemplate';

interface ImportSourceMetadata {
  fileName: string | null;
}

export interface QuestionImportExpectedDestination {
  sectionId?: string | null;
  sourceId: string;
  table: string;
}

export interface ExtractedQuestionImport {
  questions: unknown[];
  warnings: string[];
  format: 'array' | 'questions-object' | 'legacy-bank' | 'admin-template';
}

export type QuestionImportExtraction =
  | { ok: true; value: ExtractedQuestionImport }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sourceMetadata(value: unknown): ImportSourceMetadata {
  if (!isRecord(value)) return { fileName: null };
  const fileName = value.file_name ?? value.fileName ?? value.name;
  return { fileName: typeof fileName === 'string' ? fileName.trim() || null : null };
}

function applySourceMetadata(value: unknown, metadata: ImportSourceMetadata): unknown {
  if (!metadata.fileName || !isRecord(value)) return value;
  if (typeof value.source_pdf === 'string' && value.source_pdf.trim()) return value;
  return { ...value, source_pdf: metadata.fileName };
}

function validateTemplateDestination(
  value: Record<string, unknown>,
  expected: QuestionImportExpectedDestination,
): string | null {
  const destination = value.destination;
  if (!isRecord(destination)) {
    return 'The OINKIE template is missing its destination metadata. Download a fresh template for the selected section.';
  }
  const source = typeof destination.source === 'string' ? destination.source : '';
  const table = typeof destination.table === 'string' ? destination.table : '';
  if (!source || !table) {
    return 'The OINKIE template destination must include a source and table. No records were imported.';
  }
  if (source !== expected.sourceId || table !== expected.table) {
    return `This template targets ${source} (${table}), but the selected section uses ${expected.sourceId} (${expected.table}). No records were imported.`;
  }
  if (expected.sectionId) {
    const section = isRecord(value.section) ? value.section : null;
    const sectionId = typeof section?.id === 'string' ? section.id : '';
    if (sectionId !== expected.sectionId) {
      return `This template targets the ${sectionId || 'unknown'} section, but ${expected.sectionId} is selected. No records were imported.`;
    }
  }
  return null;
}

/**
 * Extracts question candidates from an admin JSON file or a legacy/local bank
 * export. This is deliberately only a format adapter: every candidate still
 * passes through the destination source's normalizer before import.
 */
export function extractQuestionBankImport(
  value: unknown,
  expectedDestination?: QuestionImportExpectedDestination,
): QuestionImportExtraction {
  if (Array.isArray(value)) {
    if (!value.length) return { ok: false, error: 'The JSON array contains no questions.' };
    return {
      ok: true,
      value: {
        questions: value,
        warnings: [],
        format: 'array',
      },
    };
  }

  if (!isRecord(value)) {
    return {
      ok: false,
      error: 'The import file must contain a JSON array or an object with a questions array.',
    };
  }

  const isAdminTemplate = value.format === QUESTION_BANK_TEMPLATE_FORMAT;
  if (isAdminTemplate && value.schema_version !== QUESTION_BANK_TEMPLATE_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Unsupported OINKIE template schema_version. This importer accepts ${QUESTION_BANK_TEMPLATE_SCHEMA_VERSION} only.`,
    };
  }

  if (!Array.isArray(value.questions)) {
    return {
      ok: false,
      error: 'The import object must contain a questions array.',
    };
  }
  if (!value.questions.length) {
    return { ok: false, error: 'The questions array is empty.' };
  }

  if (isAdminTemplate && expectedDestination) {
    const destinationError = validateTemplateDestination(value, expectedDestination);
    if (destinationError) return { ok: false, error: destinationError };
  }

  const warnings: string[] = [];
  const metadata = sourceMetadata(value.source_pdf);
  const format: ExtractedQuestionImport['format'] = isAdminTemplate
    ? 'admin-template'
    : 'schema_version' in value || 'schemaVersion' in value
      ? 'legacy-bank'
      : 'questions-object';

  if (format === 'legacy-bank') {
    warnings.push(
      'A local question-bank export was detected. Question text, options, answers, explanations, chapter/topic metadata, tags, and the PDF filename are reused. Embedded image metadata is normalized and uploaded when supported; schema-v2-only structures are not sent to a remote bank.',
    );
  }

  const questions = value.questions.map((question) => applySourceMetadata(question, metadata));

  return {
    ok: true,
    value: {
      questions,
      warnings,
      format,
    },
  };
}
