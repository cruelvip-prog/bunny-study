import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ExamImage, ExamQuestion, OptionLetter } from '../types/exam';
import {
  QUESTION_BANK_SOURCES,
  QUESTION_BANK_SOURCE_IDS,
  getQuestionBankSource,
  type QuestionBankSourceId,
  type QuestionBankSubject,
} from '../questionBanks/sourceRegistry';

export type RemoteQuestionSource = QuestionBankSourceId;
export type RemoteQuestionSubject = QuestionBankSubject;

export const REMOTE_QUESTION_SOURCES: readonly RemoteQuestionSource[] = QUESTION_BANK_SOURCE_IDS;

export const REMOTE_QUESTION_SUBJECTS = Object.fromEntries(
  QUESTION_BANK_SOURCES.map((source) => [source.id, source.subjects]),
) as Record<RemoteQuestionSource, readonly RemoteQuestionSubject[]>;

export interface RemoteQuestionFilters {
  subject: RemoteQuestionSubject;
  chapter?: string;
  topic?: string;
  limit: number;
}

export interface RemoteQuestionReader {
  readPage(
    source: RemoteQuestionSource,
    filters: RemoteQuestionFilters,
    from: number,
    to: number,
  ): Promise<unknown>;
}

export const REMOTE_QUESTION_PAGE_SIZE = 100;
export const REMOTE_QUESTION_MAX_COUNT = 300;

function sourceDefinition(source: RemoteQuestionSource) {
  const definition = getQuestionBankSource(source);
  if (!definition) throw new Error(`Unknown remote question-bank source "${source}".`);
  return definition;
}

function sourceTable(source: RemoteQuestionSource): string {
  return sourceDefinition(source).table;
}

function sourceLabel(source: RemoteQuestionSource): string {
  return sourceDefinition(source).label;
}

const remoteEnvironment: Record<string, string | undefined> = {
  VITE_SUPABASE_PHYSICS_URL: import.meta.env?.VITE_SUPABASE_PHYSICS_URL,
  VITE_SUPABASE_PHYSICS_PUBLISHABLE_KEY: import.meta.env?.VITE_SUPABASE_PHYSICS_PUBLISHABLE_KEY,
  VITE_SUPABASE_BIOLOGY_URL: import.meta.env?.VITE_SUPABASE_BIOLOGY_URL,
  VITE_SUPABASE_BIOLOGY_PUBLISHABLE_KEY: import.meta.env?.VITE_SUPABASE_BIOLOGY_PUBLISHABLE_KEY,
  VITE_SUPABASE_CHEMISTRY_URL: import.meta.env?.VITE_SUPABASE_CHEMISTRY_URL,
  VITE_SUPABASE_CHEMISTRY_PUBLISHABLE_KEY: import.meta.env?.VITE_SUPABASE_CHEMISTRY_PUBLISHABLE_KEY,
  VITE_SUPABASE_GENERAL_URL: import.meta.env?.VITE_SUPABASE_GENERAL_URL,
  VITE_SUPABASE_GENERAL_PUBLISHABLE_KEY: import.meta.env?.VITE_SUPABASE_GENERAL_PUBLISHABLE_KEY,
  VITE_SUPABASE_ARCHIVE_URL: import.meta.env?.VITE_SUPABASE_ARCHIVE_URL,
  VITE_SUPABASE_ARCHIVE_PUBLISHABLE_KEY: import.meta.env?.VITE_SUPABASE_ARCHIVE_PUBLISHABLE_KEY,
};

const OPTION_LETTERS: OptionLetter[] = ['A', 'B', 'C', 'D'];
const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function sourceEnvironmentKeys(source: RemoteQuestionSource): [string, string] {
  const definition = sourceDefinition(source);
  return [definition.publicEnvironment.url, definition.publicEnvironment.publishableKey];
}

export function getRemoteSourceConfiguration(
  source: RemoteQuestionSource,
  environment: Record<string, string | undefined> = remoteEnvironment,
): { url: string; publishableKey: string } | { error: string } {
  const definition = sourceDefinition(source);
  const [urlKey, publishableKeyName] = sourceEnvironmentKeys(source);
  const url = environment[urlKey]?.trim();
  const publishableKey = environment[publishableKeyName]?.trim();
  if (!url || !publishableKey) {
    return { error: `${definition.label} is not configured. Set ${urlKey} and ${publishableKeyName}.` };
  }
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { error: `${definition.label} has an invalid project URL in ${urlKey}.` };
  }
  if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
    return { error: `${definition.label} project URL must use HTTP or HTTPS.` };
  }
  return { url: parsedUrl.toString().replace(/\/$/, ''), publishableKey };
}

const clients = new Map<RemoteQuestionSource, SupabaseClient>();

function makeClient(source: RemoteQuestionSource): SupabaseClient {
  const existing = clients.get(source);
  if (existing) return existing;
  const configuration = getRemoteSourceConfiguration(source);
  if ('error' in configuration) throw new Error(configuration.error);
  const client = createClient(configuration.url, configuration.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  clients.set(source, client);
  return client;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function optionalText(
  value: unknown,
  field: string,
  source: RemoteQuestionSource,
  rowId: string,
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new Error(`${sourceLabel(source)} row "${rowId}" has invalid ${field}.`);
  }
  return value;
}

function optionText(value: unknown, field: string, source: RemoteQuestionSource, rowId: string): {
  textEn: string;
  textHi: string | null;
} {
  const option = typeof value === 'string' ? { text_en: value } : value;
  if (!isRecord(option)) {
    throw new Error(`${sourceLabel(source)} row "${rowId}" has an invalid option ${field}.`);
  }
  const english = option.text_en ?? option.textEn ?? option.text;
  const hindi = option.text_hi ?? option.textHi;
  if (!(english === undefined || english === null || typeof english === 'string') ||
      !(hindi === undefined || hindi === null || typeof hindi === 'string')) {
    throw new Error(`${sourceLabel(source)} row "${rowId}" has invalid bilingual text for option ${field}.`);
  }
  const textEn = typeof english === 'string' ? english : '';
  const textHi = typeof hindi === 'string' ? hindi : null;
  if (!textEn.trim() && !textHi?.trim()) {
    throw new Error(`${sourceLabel(source)} row "${rowId}" has no text for option ${field}.`);
  }
  return { textEn, textHi };
}

function mapOptions(
  value: unknown,
  source: RemoteQuestionSource,
  rowId: string,
): ExamQuestion['options'] {
  const options: Record<OptionLetter, { textEn: string; textHi: string | null }> = {
    A: { textEn: '', textHi: null },
    B: { textEn: '', textHi: null },
    C: { textEn: '', textHi: null },
    D: { textEn: '', textHi: null },
  };
  if (Array.isArray(value)) {
    if (value.length !== OPTION_LETTERS.length) {
      throw new Error(`${sourceLabel(source)} row "${rowId}" must contain exactly four options.`);
    }
    value.forEach((entry, index) => {
      options[OPTION_LETTERS[index]] = optionText(entry, OPTION_LETTERS[index], source, rowId);
    });
  } else if (isRecord(value)) {
    if (Object.keys(value).some((key) => !OPTION_LETTERS.includes(key as OptionLetter)) ||
        OPTION_LETTERS.some((letter) => !(letter in value))) {
      throw new Error(`${sourceLabel(source)} row "${rowId}" options must use exactly A, B, C, and D.`);
    }
    OPTION_LETTERS.forEach((letter) => {
      options[letter] = optionText(value[letter], letter, source, rowId);
    });
  } else {
    throw new Error(`${sourceLabel(source)} row "${rowId}" has an unsupported options format.`);
  }
  return options;
}

function mapImages(value: unknown, source: RemoteQuestionSource, rowId: string): ExamImage[] | undefined {
  if (value === undefined || value === null) return undefined;
  let parsedValue = value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    try {
      parsedValue = JSON.parse(trimmed);
    } catch {
      throw new Error(`${sourceLabel(source)} row "${rowId}" has unsupported image metadata; expected an image array.`);
    }
  }
  if (!Array.isArray(parsedValue)) {
    throw new Error(`${sourceLabel(source)} row "${rowId}" has unsupported image metadata; expected an image array.`);
  }
  return (parsedValue as unknown[]).map((entry, index) => {
    if (!isRecord(entry) || typeof entry.id !== 'string' ||
        !['question', 'option', 'explanation'].includes(String(entry.type)) ||
        typeof entry.mimeType !== 'string' || !IMAGE_MIME_TYPES.has(entry.mimeType) ||
        typeof entry.alt !== 'string' ||
        !(entry.caption === null || typeof entry.caption === 'string')) {
      throw new Error(`${sourceLabel(source)} row "${rowId}" image ${index + 1} has incompatible metadata.`);
    }
    const dataUri = text(entry.dataUri);
    const src = text(entry.src) || text(entry.url);
    if (dataUri && !new RegExp(`^data:${entry.mimeType.replace('/', '\\/')};base64,`).test(dataUri)) {
      throw new Error(`${sourceLabel(source)} row "${rowId}" image ${index + 1} has an invalid data URI.`);
    }
    if (src && !/^https?:\/\//i.test(src)) {
      throw new Error(`${sourceLabel(source)} row "${rowId}" image ${index + 1} must use an HTTP(S) URL.`);
    }
    if (!dataUri && !src) {
      throw new Error(`${sourceLabel(source)} row "${rowId}" image ${index + 1} has no supported image source.`);
    }
    if (entry.option !== undefined && !OPTION_LETTERS.includes(entry.option as OptionLetter)) {
      throw new Error(`${sourceLabel(source)} row "${rowId}" image ${index + 1} has an invalid option label.`);
    }
    return {
      id: `${source}:${sourceTable(source)}:${rowId}:${entry.id}`,
      type: entry.type as ExamImage['type'],
      mimeType: entry.mimeType,
      ...(dataUri ? { dataUri } : {}),
      ...(src ? { src } : {}),
      alt: entry.alt,
      caption: entry.caption,
      ...(entry.option ? { option: entry.option as OptionLetter } : {}),
    };
  });
}

function parseSubject(row: Record<string, unknown>, source: RemoteQuestionSource, rowId: string): RemoteQuestionSubject {
  const definition = sourceDefinition(source);
  const rawSubject = definition.fixedSubject
    ?? (definition.subjectField ? row[definition.subjectField] : undefined);
  if (source === 'biology' && rawSubject !== 'Botany' && rawSubject !== 'Zoology') {
    throw new Error(`${sourceLabel(source)} row "${rowId}" has an unsupported subject_area value.`);
  }
  if (rawSubject === 'Physics' || rawSubject === 'Chemistry' ||
      rawSubject === 'Botany' || rawSubject === 'Zoology') return rawSubject;
  throw new Error(`${sourceLabel(source)} row "${rowId}" has an unsupported subject value.`);
}

export function mapRemoteQuestionRow(
  value: unknown,
  source: RemoteQuestionSource,
  ordinal = 1,
): ExamQuestion {
  if (!isRecord(value)) throw new Error(`${sourceLabel(source)} returned a row that is not an object.`);
  const rawId = value.id;
  if (!(typeof rawId === 'string' || typeof rawId === 'number') || !String(rawId).trim()) {
    throw new Error(`${sourceLabel(source)} returned a row with no stable id.`);
  }
  const rowId = String(rawId);
  const subject = parseSubject(value, source, rowId);
  if (!(value.question_en === undefined || value.question_en === null || typeof value.question_en === 'string')) {
    throw new Error(`${sourceLabel(source)} row "${rowId}" has invalid question_en.`);
  }
  if (!(value.question_hi === undefined || value.question_hi === null || typeof value.question_hi === 'string')) {
    throw new Error(`${sourceLabel(source)} row "${rowId}" has invalid question_hi.`);
  }
  const questionEn = text(value.question_en) || '';
  const questionHi = text(value.question_hi);
  if (!questionEn.trim() && !questionHi?.trim()) {
    throw new Error(`${sourceLabel(source)} row "${rowId}" has no English or Hindi question text.`);
  }
  const answerValue = value.answer_key;
  const answerKey = answerValue === null || answerValue === undefined || answerValue === ''
    ? null
    : typeof answerValue === 'string' && OPTION_LETTERS.includes(answerValue.toUpperCase() as OptionLetter)
      ? answerValue.toUpperCase() as OptionLetter
      : (() => { throw new Error(`${sourceLabel(source)} row "${rowId}" has an invalid answer_key.`); })();
  const chapter = text(value.chapter) || text(value.topic) || 'Uncategorized';
  const topic = optionalText(value.topic, 'topic', source, rowId);
  const chapterValue = optionalText(value.chapter, 'chapter', source, rowId);
  const section = optionalText(value.section, 'section', source, rowId);
  const questionCode = optionalText(value.question_code, 'question_code', source, rowId);
  const answerKeySource = optionalText(value.answer_key_source, 'answer_key_source', source, rowId);
  const explanationEn = optionalText(value.explanation_en, 'explanation_en', source, rowId);
  const explanationHi = optionalText(value.explanation_hi, 'explanation_hi', source, rowId);
  const exercise = optionalText(value.exercise, 'exercise', source, rowId);
  const createdAt = optionalText(value.created_at, 'created_at', source, rowId);
  if (value.question_number !== undefined && value.question_number !== null &&
      (!Number.isSafeInteger(value.question_number) || Number(value.question_number) < 1)) {
    throw new Error(`${sourceLabel(source)} row "${rowId}" has invalid question_number.`);
  }
  const questionNumber = Number.isSafeInteger(value.question_number) && Number(value.question_number) > 0
    ? Number(value.question_number)
    : ordinal;
  if (value.source_page !== undefined && value.source_page !== null &&
      (!Number.isSafeInteger(value.source_page) || Number(value.source_page) < 1)) {
    throw new Error(`${sourceLabel(source)} row "${rowId}" has invalid source_page.`);
  }
  const sourcePage = Number.isSafeInteger(value.source_page) && Number(value.source_page) > 0
    ? Number(value.source_page)
    : 0;
  const formulas = value.formulas === undefined || value.formulas === null
    ? []
    : Array.isArray(value.formulas) && value.formulas.every((entry) => typeof entry === 'string')
      ? value.formulas
      : (() => { throw new Error(`${sourceLabel(source)} row "${rowId}" has invalid formulas metadata.`); })();
  const tags = value.tags === undefined || value.tags === null
    ? []
    : Array.isArray(value.tags) && value.tags.every((entry) => typeof entry === 'string')
      ? value.tags
      : (() => { throw new Error(`${sourceLabel(source)} row "${rowId}" has invalid tags metadata.`); })();
  if (value.review_required !== undefined && typeof value.review_required !== 'boolean') {
    throw new Error(`${sourceLabel(source)} row "${rowId}" has invalid review_required metadata.`);
  }
  const images = mapImages(value.images, source, rowId);
  return {
    id: `remote:${source}:${sourceTable(source)}:${rowId}`,
    originalQuestionNumber: questionNumber,
    subject,
    topic: chapter,
    ...(topic ? { topicName: topic } : {}),
    section: section || subject,
    sourcePage,
    questionEn,
    questionHi,
    options: mapOptions(value.options, source, rowId),
    answerKey,
    answerKeySource,
    reviewRequired: value.review_required === true,
    reviewFlags: [],
    missingContent: [],
    formulas,
    ...(value.explanation_en === undefined ? {} : { explanationEn }),
    ...(value.explanation_hi === undefined ? {} : { explanationHi }),
    ...(images ? { images } : {}),
    schemaV2: {
      sourceProject: source,
      sourceTable: sourceTable(source),
      questionCode,
      chapter: chapterValue || chapter,
      ...(topic ? { topic } : {}),
      ...(exercise ? { exercise } : {}),
      ...(value.difficulty === undefined ? {} : { difficulty: value.difficulty }),
      ...(value.source_pdf === undefined ? {} : { sourcePdf: value.source_pdf }),
      ...(value.tags === undefined ? {} : { tags }),
      ...(value.exam_name === undefined ? {} : { examName: value.exam_name }),
      ...(value.exam_year === undefined ? {} : { examYear: value.exam_year }),
      ...(value.paper_session === undefined ? {} : { paperSession: value.paper_session }),
      ...(value.paper_title === undefined ? {} : { paperTitle: value.paper_title }),
      ...(value.verification_status === undefined ? {} : { verificationStatus: value.verification_status }),
      ...(createdAt ? { createdAt } : {}),
    },
  };
}

function validateFilters(source: RemoteQuestionSource, filters: RemoteQuestionFilters): RemoteQuestionFilters {
  const definition = sourceDefinition(source);
  if (!Number.isSafeInteger(filters.limit) || filters.limit < 1 || filters.limit > REMOTE_QUESTION_MAX_COUNT) {
    throw new Error(`Remote question count must be between 1 and ${REMOTE_QUESTION_MAX_COUNT}.`);
  }
  if (definition.fixedSubject && filters.subject !== definition.fixedSubject) {
    if (source === 'physics') {
      throw new Error('The Physics project contains Physics questions only.');
    }
    if (source === 'chemistry') {
      throw new Error('The OINKIE Chemistry Bank contains Chemistry questions only.');
    }
    throw new Error(`${definition.label} contains ${definition.fixedSubject} questions only.`);
  }
  if (!definition.fixedSubject && !definition.subjects.includes(filters.subject)) {
    throw new Error(`Choose ${definition.subjects.join(' or ')} for the ${definition.label}.`);
  }
  return {
    ...filters,
    chapter: filters.chapter?.trim() || undefined,
    topic: filters.topic?.trim() || undefined,
  };
}

export async function fetchRemoteQuestionsWithReader(
  reader: RemoteQuestionReader,
  source: RemoteQuestionSource,
  requestedFilters: RemoteQuestionFilters,
): Promise<ExamQuestion[]> {
  const filters = validateFilters(source, requestedFilters);
  const questions: ExamQuestion[] = [];
  for (let from = 0; from < filters.limit; from += REMOTE_QUESTION_PAGE_SIZE) {
    const to = Math.min(from + REMOTE_QUESTION_PAGE_SIZE, filters.limit) - 1;
    let response: unknown;
    try {
      response = await reader.readPage(source, filters, from, to);
    } catch (error) {
      throw new Error(`Could not read ${sourceLabel(source)} questions: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!Array.isArray(response)) {
      throw new Error(`${sourceLabel(source)} returned an invalid page of questions.`);
    }
    response.forEach((row, index) => {
      questions.push(mapRemoteQuestionRow(row, source, from + index + 1));
    });
    if (response.length < to - from + 1) break;
  }
  return questions;
}

function createSupabaseReader(): RemoteQuestionReader {
  const readPage = async (
    source: RemoteQuestionSource,
    filters: RemoteQuestionFilters,
    from: number,
    to: number,
  ): Promise<unknown> => {
    const client = makeClient(source);
    const definition = sourceDefinition(source);
    let query = client.from(definition.table).select('*');
    if (definition.subjectField) {
      query = query.eq(definition.subjectField, filters.subject);
    }
    if (filters.chapter) query = query.eq('chapter', filters.chapter);
    if (filters.topic) query = query.eq('topic', filters.topic);
    const { data, error } = await query
      .order('id', { ascending: true })
      .range(from, to);
    if (error) throw error;
    return data;
  };
  return { readPage };
}

export function fetchRemoteQuestions(
  source: RemoteQuestionSource,
  filters: RemoteQuestionFilters,
): Promise<ExamQuestion[]> {
  return fetchRemoteQuestionsWithReader(createSupabaseReader(), source, filters);
}

export async function countRemoteQuestions(
  source: RemoteQuestionSource,
  requestedFilters: RemoteQuestionFilters,
): Promise<number> {
  const filters = validateFilters(source, requestedFilters);
  const client = makeClient(source);
  const definition = sourceDefinition(source);
  let query = client.from(definition.table).select('*', { count: 'exact', head: true });
  if (definition.subjectField) {
    query = query.eq(definition.subjectField, filters.subject);
  }
  if (filters.chapter) query = query.eq('chapter', filters.chapter);
  if (filters.topic) query = query.eq('topic', filters.topic);
  const { count, error } = await query;
  if (error) throw error;
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
    throw new Error(`${sourceLabel(source)} did not return a valid exact question count.`);
  }
  return count;
}

export function getRemoteSourceLabel(source: RemoteQuestionSource): string {
  return sourceLabel(source);
}

export function getRemoteSourceTable(source: RemoteQuestionSource): string {
  return sourceTable(source);
}

export function getRemoteSourceSubjects(source: RemoteQuestionSource): RemoteQuestionSubject[] {
  return [...REMOTE_QUESTION_SUBJECTS[source]];
}
