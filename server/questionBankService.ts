import {
  QUESTION_BANK_SOURCES,
  QUESTION_BANK_SOURCE_IDS,
  getQuestionBankAdminSection,
  getQuestionBankSource,
  type QuestionBankAdminSectionDefinition,
  type QuestionBankSourceDefinition,
  type QuestionBankSourceId,
  type QuestionBankSubject,
} from '../src/questionBanks/sourceRegistry';
import {
  QUESTION_BANK_IMPORT_BATCH_SIZE,
  QUESTION_BANK_IMPORT_MAX,
  type QuestionBankAdminStatus,
  type QuestionBankListQuery,
  type QuestionBankListResponse,
  type QuestionBankMutationResponse,
  type QuestionBankImportResponse,
} from '../src/questionBanks/adminContracts';
import {
  adminQuestionSummaryFromRow,
  normalizeQuestionInput,
  validateQuestionId,
} from '../src/questionBanks/questionInput';
import type {
  AdminQuestionListResult,
  AdminQuestionRepository,
  NormalizedQuestionListQuery,
  QuestionBankSubjectScope,
} from './questionBankRepository';
import { AdminApiError, errorMessage } from './errors';

export { QUESTION_BANK_IMPORT_MAX, QUESTION_BANK_IMPORT_BATCH_SIZE };

interface Destination {
  source: QuestionBankSourceId;
  label: string;
  table: string;
}

function destinationFor(source: QuestionBankSourceDefinition): Destination {
  return { source: source.id, label: source.label, table: source.table };
}

function unknownSource(value: unknown): AdminApiError {
  return new AdminApiError(
    400,
    `Unknown question-bank source "${String(value)}". No project was changed.`,
    'invalid_source',
    [...QUESTION_BANK_SOURCE_IDS],
  );
}

function requireSource(value: unknown): QuestionBankSourceDefinition {
  const source = getQuestionBankSource(value);
  if (!source) throw unknownSource(value);
  return source;
}

function resolveAdminSection(
  source: QuestionBankSourceDefinition,
  value: unknown,
): QuestionBankAdminSectionDefinition | null {
  if (value === undefined || value === null || value === '') return null;
  const section = getQuestionBankAdminSection(value);
  if (!section) {
    throw new AdminApiError(
      400,
      `Unknown question-bank section "${String(value)}". No project was changed.`,
      'invalid_section',
    );
  }
  if (!section.sourceId) {
    throw new AdminApiError(
      503,
      `${section.label} is not writable yet. ${section.setupRequired ?? 'No verified remote source is configured.'} No project was changed.`,
      'section_setup_required',
    );
  }
  if (section.sourceId !== source.id) {
    throw new AdminApiError(
      400,
      `The ${section.label} section is registered to the ${section.sourceId} source, not ${source.id}. No data was changed.`,
      'section_source_mismatch',
    );
  }
  if (section.subject && source.subjectField && !source.subjects.includes(section.subject)) {
    throw new AdminApiError(
      500,
      `The ${section.label} section has an invalid subject mapping. No data was changed.`,
      'invalid_section_configuration',
    );
  }
  return section;
}

function sectionSubjectLock(
  source: QuestionBankSourceDefinition,
  section: QuestionBankAdminSectionDefinition | null,
): QuestionBankSubject | null {
  if (!source.subjectField || !section?.subject) return null;
  return section.subject;
}

function requireSectionForSharedSource(
  source: QuestionBankSourceDefinition,
  section: QuestionBankAdminSectionDefinition | null,
  operation: string,
): void {
  if (source.id === 'biology' && !section) {
    throw new AdminApiError(
      400,
      `Choose the Botany or Zoology section before this ${operation}. The shared Biology table is not writable without a section subject lock. Nothing was changed.`,
      'section_required',
    );
  }
}

function sectionSubjectScope(
  source: QuestionBankSourceDefinition,
  section: QuestionBankAdminSectionDefinition | null,
): QuestionBankSubjectScope | null {
  const subject = sectionSubjectLock(source, section);
  if (!subject || !source.subjectField) return null;
  return { field: source.subjectField, value: subject };
}

function assertRegisteredTable(source: QuestionBankSourceDefinition, suppliedTable: unknown): void {
  if (typeof suppliedTable !== 'string' || !suppliedTable.trim()) {
    throw new AdminApiError(
      400,
      `The destination table is required before changing ${source.label}.`,
      'destination_table_required',
    );
  }
  if (suppliedTable.trim() !== source.table) {
    throw new AdminApiError(
      400,
      `The requested table does not match the registered destination for ${source.label}. Expected ${source.table}; no data was changed.`,
      'destination_table_mismatch',
    );
  }
}

function numericQueryValue(
  value: number | string | undefined,
  fallback: number,
  min: number,
  max: number,
  field: string,
): number {
  if (value === undefined || value === '') return fallback;
  const number = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value)
      : Number.NaN;
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw new AdminApiError(
      400,
      `${field} must be a whole number between ${min} and ${max}.`,
      'invalid_query',
    );
  }
  return number;
}

function textFilter(
  value: unknown,
  field: string,
  maxLength: number,
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new AdminApiError(400, `${field} must be text.`, 'invalid_query');
  }
  const text = value.trim();
  if (text.length > maxLength) {
    throw new AdminApiError(400, `${field} must be ${maxLength} characters or fewer.`, 'invalid_query');
  }
  return text || null;
}

function supportedFilter(source: QuestionBankSourceDefinition, field: string): void {
  if (!source.fields.includes(field as never)) {
    throw new AdminApiError(
      400,
      `${source.label} does not expose the ${field} field.`,
      'unsupported_filter',
    );
  }
}

export function normalizeQuestionListQuery(
  source: QuestionBankSourceDefinition,
  query: QuestionBankListQuery,
  lockedSubject: QuestionBankSubject | null = null,
): NormalizedQuestionListQuery {
  const page = numericQueryValue(query.page, 1, 1, 1_000_000, 'page');
  const pageSize = numericQueryValue(query.pageSize, 25, 1, 100, 'page size');
  let subject = textFilter(query.subject, 'subject', 80);
  if (lockedSubject) {
    if (!source.subjects.includes(lockedSubject)) {
      throw new AdminApiError(
        500,
        `${source.label} has an invalid section subject lock. No query was sent.`,
        'invalid_section_configuration',
      );
    }
    if (subject && subject !== lockedSubject) {
      throw new AdminApiError(
        400,
        `This section is locked to ${lockedSubject}; the request asked for ${subject}. No query was sent.`,
        'subject_scope_mismatch',
      );
    }
    subject = lockedSubject;
  }
  if (subject) {
    if (!source.subjects.includes(subject as never)) {
      throw new AdminApiError(
        400,
        `${source.label} does not contain the subject ${subject}.`,
        'invalid_subject',
      );
    }
  }

  const chapter = textFilter(query.chapter, 'chapter', 200);
  const topic = textFilter(query.topic, 'topic', 200);
  const section = textFilter(query.section, 'section', 200);
  const exercise = textFilter(query.exercise, 'exercise', 200);
  const difficulty = textFilter(query.difficulty, 'difficulty', 60);
  const sourcePdf = textFilter(query.sourcePdf, 'source PDF', 400);
  const search = textFilter(query.search, 'search', 120);

  for (const [field, value] of [
    ['chapter', chapter],
    ['topic', topic],
    ['section', section],
    ['exercise', exercise],
    ['difficulty', difficulty],
    ['source_pdf', sourcePdf],
  ] as const) {
    if (value) supportedFilter(source, field);
  }

  const language = query.language ?? 'all';
  if (language !== 'all' && language !== 'with-hindi' && language !== 'without-hindi') {
    throw new AdminApiError(
      400,
      'language filter must be all, with-hindi, or without-hindi.',
      'invalid_query',
    );
  }
  const answer = query.answer ?? 'all';
  if (answer !== 'all' && answer !== 'present' && answer !== 'missing') {
    throw new AdminApiError(
      400,
      'answer filter must be all, present, or missing.',
      'invalid_query',
    );
  }

  return {
    page,
    pageSize,
    search: search ?? '',
    subject,
    chapter,
    topic,
    section,
    exercise,
    difficulty,
    sourcePdf,
    language,
    answer,
  };
}

function summaryFor(source: QuestionBankSourceDefinition, row: Record<string, unknown>) {
  const summary = adminQuestionSummaryFromRow(source, row);
  if (!summary.id) {
    throw new AdminApiError(
      502,
      `${source.label} returned a row without a stable question ID.`,
      'invalid_remote_response',
    );
  }
  return summary;
}

export class QuestionBankAdminService {
  private readonly repository: AdminQuestionRepository;
  private readonly now: () => Date;

  constructor(repository: AdminQuestionRepository, now: () => Date = () => new Date()) {
    this.repository = repository;
    this.now = now;
  }

  async statuses(): Promise<QuestionBankAdminStatus[]> {
    return Promise.all(QUESTION_BANK_SOURCES.map(async (source) => {
      let backend;
      try {
        backend = await this.repository.status(source);
      } catch (error) {
        backend = {
          state: 'unavailable' as const,
          count: null,
          detail: `${source.label} status check failed: ${errorMessage(error)}`,
        };
      }
      return {
        source: source.id,
        label: source.label,
        table: source.table,
        subjects: [...source.subjects],
        state: backend.state,
        count: backend.count,
        detail: backend.detail,
        lastCheckedAt: this.now().toISOString(),
      };
    }));
  }

  async list(
    sourceId: unknown,
    query: QuestionBankListQuery,
    sectionValue?: unknown,
  ): Promise<QuestionBankListResponse> {
    const source = requireSource(sourceId);
    const section = resolveAdminSection(source, sectionValue);
    const normalized = normalizeQuestionListQuery(
      source,
      query,
      sectionSubjectLock(source, section),
    );
    const result: AdminQuestionListResult = await this.repository.list(source, normalized);
    return {
      ...destinationFor(source),
      count: result.count,
      page: normalized.page,
      pageSize: normalized.pageSize,
      questions: result.rows.map((row) => summaryFor(source, row)),
    };
  }

  async create(
    sourceId: unknown,
    table: unknown,
    input: unknown,
    sectionValue?: unknown,
  ): Promise<QuestionBankMutationResponse> {
    const source = requireSource(sourceId);
    const section = resolveAdminSection(source, sectionValue);
    assertRegisteredTable(source, table);
    requireSectionForSharedSource(source, section, 'create');
    const normalized = normalizeQuestionInput(input, source, {
      lockedSubject: sectionSubjectLock(source, section),
    });
    if (!normalized.ok) {
      throw new AdminApiError(
        400,
        `${source.label} rejected the question before any write.`,
        'validation_failed',
        normalized.errors,
      );
    }
    const row = await this.repository.create(source, normalized.payload);
    return {
      ...destinationFor(source),
      question: summaryFor(source, row),
    };
  }

  async update(
    sourceId: unknown,
    questionId: unknown,
    table: unknown,
    input: unknown,
    sectionValue?: unknown,
  ): Promise<QuestionBankMutationResponse> {
    const source = requireSource(sourceId);
    const section = resolveAdminSection(source, sectionValue);
    assertRegisteredTable(source, table);
    requireSectionForSharedSource(source, section, 'update');
    const id = validateQuestionId(source, questionId);
    if (!id.ok) {
      throw new AdminApiError(400, id.message, 'invalid_question_id');
    }
    const normalized = normalizeQuestionInput(input, source, {
      lockedSubject: sectionSubjectLock(source, section),
    });
    if (!normalized.ok) {
      throw new AdminApiError(
        400,
        `${source.label} rejected the question before any update.`,
        'validation_failed',
        normalized.errors,
      );
    }
    const row = await this.repository.update(
      source,
      id.id,
      normalized.payload,
      sectionSubjectScope(source, section),
    );
    return {
      ...destinationFor(source),
      question: summaryFor(source, row),
    };
  }

  async remove(
    sourceId: unknown,
    questionId: unknown,
    table: unknown,
    sectionValue?: unknown,
  ): Promise<QuestionBankMutationResponse> {
    const source = requireSource(sourceId);
    const section = resolveAdminSection(source, sectionValue);
    assertRegisteredTable(source, table);
    requireSectionForSharedSource(source, section, 'delete');
    const id = validateQuestionId(source, questionId);
    if (!id.ok) {
      throw new AdminApiError(400, id.message, 'invalid_question_id');
    }
    const row = await this.repository.remove(
      source,
      id.id,
      sectionSubjectScope(source, section),
    );
    return {
      ...destinationFor(source),
      question: summaryFor(source, row),
    };
  }

  async import(
    sourceId: unknown,
    table: unknown,
    inputs: unknown,
    sectionValue?: unknown,
  ): Promise<QuestionBankImportResponse> {
    const source = requireSource(sourceId);
    const section = resolveAdminSection(source, sectionValue);
    assertRegisteredTable(source, table);
    requireSectionForSharedSource(source, section, 'import');
    if (!Array.isArray(inputs)) {
      throw new AdminApiError(400, 'The import must contain an array of questions.', 'invalid_import');
    }
    if (!inputs.length) {
      throw new AdminApiError(400, 'The import contains no questions.', 'invalid_import');
    }
    if (inputs.length > QUESTION_BANK_IMPORT_MAX) {
      throw new AdminApiError(
        400,
        `Import at most ${QUESTION_BANK_IMPORT_MAX} questions per confirmed file. No rows were written.`,
        'invalid_import',
      );
    }

    const payloads: Record<string, unknown>[] = [];
    const issues: string[] = [];
    const lockedSubject = sectionSubjectLock(source, section);
    inputs.forEach((input, index) => {
      const normalized = normalizeQuestionInput(input, source, { lockedSubject });
      if (normalized.ok) payloads.push(normalized.payload);
      else issues.push(...normalized.errors.map((issue) => `Question ${index + 1}: ${issue}`));
    });
    if (issues.length) {
      throw new AdminApiError(
        400,
        `${source.label} rejected the import before any row was inserted.`,
        'validation_failed',
        issues,
      );
    }

    const inserted: Record<string, unknown>[] = [];
    const failures: Array<{ index: number; message: string }> = [];

    for (let offset = 0; offset < payloads.length; offset += QUESTION_BANK_IMPORT_BATCH_SIZE) {
      const batch = payloads.slice(offset, offset + QUESTION_BANK_IMPORT_BATCH_SIZE);
      try {
        const batchRows = await this.repository.insertMany(source, batch);
        if (batchRows.length !== batch.length) {
          throw new AdminApiError(
            502,
            `${source.label} returned an incomplete insert result for a batch.`,
            'partial_remote_response',
          );
        }
        inserted.push(...batchRows);
      } catch (batchError) {
        if (batchError instanceof AdminApiError
          && ['source_not_configured', 'missing_table', 'permission_denied'].includes(batchError.code)
          && inserted.length === 0) {
          throw batchError;
        }
        for (let index = 0; index < batch.length; index += 1) {
          try {
            inserted.push(await this.repository.create(source, batch[index]));
          } catch (rowError) {
            failures.push({
              index: offset + index,
              message: errorMessage(rowError),
            });
          }
        }
      }
    }

    return {
      ...destinationFor(source),
      inserted: inserted.map((row) => summaryFor(source, row)),
      failures,
    };
  }
}
