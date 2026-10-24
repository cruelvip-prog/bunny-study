import {
  getQuestionBankSource,
  type QuestionBankField,
  type QuestionBankSourceDefinition,
  type QuestionBankSourceId,
  type QuestionBankSubject,
} from './sourceRegistry';
import type { AdminQuestionSummary } from './adminContracts';
import type { ExamImage } from '../types/exam';

export interface QuestionBankInputOptions {
  lockedSubject?: QuestionBankSubject | null;
}

export type QuestionBankOptionLetter = 'A' | 'B' | 'C' | 'D';

export interface QuestionBankOptionDraft {
  text_en: string;
  text_hi: string;
}

export interface QuestionBankQuestionDraft {
  question_code: string;
  subject: string;
  chapter: string;
  topic: string;
  section: string;
  exercise: string;
  question_en: string;
  question_hi: string;
  options: Record<QuestionBankOptionLetter, QuestionBankOptionDraft>;
  answer_key: string;
  answer_key_source: string;
  explanation_en: string;
  explanation_hi: string;
  difficulty: string;
  source_pdf: string;
  source_page: string;
  tags: string;
  exam_name: string;
  exam_year: string;
  paper_session: string;
  paper_title: string;
  verification_status: string;
  images: string;
}

export type QuestionBankQuestionPayload = Record<string, unknown>;

export type QuestionBankInputResult =
  | {
      ok: true;
      payload: QuestionBankQuestionPayload;
      draft: QuestionBankQuestionDraft;
    }
  | {
      ok: false;
      errors: string[];
    };

const OPTION_LETTERS: QuestionBankOptionLetter[] = ['A', 'B', 'C', 'D'];
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function optionalText(
  value: unknown,
  field: string,
  label: string,
  errors: string[],
  maxLength: number,
): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') {
    errors.push(`${label}: ${field} must be text.`);
    return '';
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    errors.push(`${label}: ${field} must be ${maxLength} characters or fewer.`);
  }
  return trimmed;
}

function sourcePdfText(value: unknown, label: string, errors: string[]): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') {
    return optionalText(value, 'source PDF', label, errors, 400);
  }
  if (isRecord(value)) {
    const name = value.file_name ?? value.fileName ?? value.name;
    if (typeof name === 'string') {
      return optionalText(name, 'source PDF', label, errors, 400);
    }
  }
  errors.push(`${label}: source PDF must be text or an object with file_name.`);
  return '';
}

function normalizeTags(value: unknown, label: string, errors: string[]): string[] {
  let entries: string[] = [];
  if (value === undefined || value === null || value === '') {
    return [];
  }
  if (typeof value === 'string') {
    entries = value.split(',');
  } else if (Array.isArray(value)) {
    if (!value.every((entry) => typeof entry === 'string')) {
      errors.push(`${label}: tags must contain text values only.`);
      return [];
    }
    entries = value as string[];
  } else {
    errors.push(`${label}: tags must be a comma-separated list or an array of text values.`);
    return [];
  }

  const normalized: string[] = [];
  for (const entry of entries) {
    const tag = entry.trim();
    if (!tag) continue;
    if (tag.length > 80) {
      errors.push(`${label}: each tag must be 80 characters or fewer.`);
      continue;
    }
    if (!normalized.includes(tag)) normalized.push(tag);
  }
  if (normalized.length > 50) {
    errors.push(`${label}: at most 50 tags are supported.`);
    return normalized.slice(0, 50);
  }
  return normalized;
}

function normalizeAnswerKey(value: unknown, label: string, errors: string[]): QuestionBankOptionLetter | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    errors.push(`${label}: answer key must be A, B, C, D, or blank.`);
    return null;
  }
  const answer = value.trim().toUpperCase();
  if (!answer) return null;
  if (!OPTION_LETTERS.includes(answer as QuestionBankOptionLetter)) {
    errors.push(`${label}: answer key must be A, B, C, D, or blank.`);
    return null;
  }
  return answer as QuestionBankOptionLetter;
}

function normalizeSourcePage(value: unknown, label: string, errors: string[]): number | null {
  if (value === undefined || value === null || value === '') return null;
  const number = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value.trim())
      : Number.NaN;
  if (!Number.isSafeInteger(number) || number < 1 || number > 1_000_000) {
    errors.push(`${label}: source page must be a whole number of 1 or more.`);
    return null;
  }
  return number;
}

function normalizeExamYear(value: unknown, label: string, errors: string[]): number | null {
  if (value === undefined || value === null || value === '') return null;
  const number = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value.trim())
      : Number.NaN;
  if (!Number.isSafeInteger(number) || number < 1900 || number > 9999) {
    errors.push(`${label}: exam year must be a whole number between 1900 and 9999.`);
    return null;
  }
  return number;
}

const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function isSupportedImageReference(value: string): boolean {
  if (/^[A-Za-z0-9._/-]+$/.test(value)) return true;

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeImages(value: unknown, label: string, errors: string[]): Record<string, unknown>[] {
  if (value === undefined || value === null || value === '') return [];
  let parsed: unknown = value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      errors.push(`${label}: images must be a JSON array of image metadata.`);
      return [];
    }
  }
  if (!Array.isArray(parsed)) {
    errors.push(`${label}: images must be an array.`);
    return [];
  }

  const images: Record<string, unknown>[] = [];
  parsed.forEach((entry, index) => {
    const itemLabel = `${label}: image ${index + 1}`;
    if (!isRecord(entry)) {
      errors.push(`${itemLabel} must be an object.`);
      return;
    }
    const id = typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : `image-${index + 1}`;
    const type = entry.type;
    if (!['question', 'option', 'explanation'].includes(String(type))) {
      errors.push(`${itemLabel} type must be question, option, or explanation.`);
      return;
    }
    const mimeType = typeof entry.mimeType === 'string' ? entry.mimeType.trim() : '';
    if (!IMAGE_MIME_TYPES.has(mimeType)) {
      errors.push(`${itemLabel} mimeType must be image/png, image/jpeg, image/webp, or image/gif.`);
      return;
    }
    const alt = typeof entry.alt === 'string' ? entry.alt : '';
    const caption = entry.caption === null || entry.caption === undefined
      ? null
      : typeof entry.caption === 'string'
        ? entry.caption
        : null;
    if (entry.caption !== undefined && entry.caption !== null && typeof entry.caption !== 'string') {
      errors.push(`${itemLabel} caption must be text or null.`);
      return;
    }
    const option = entry.option === undefined || entry.option === null
      ? undefined
      : entry.option;
    if (option !== undefined && !['A', 'B', 'C', 'D'].includes(String(option))) {
      errors.push(`${itemLabel} option must be A, B, C, or D.`);
      return;
    }
    const dataUri = typeof entry.dataUri === 'string' ? entry.dataUri.trim() : '';
    const src = typeof entry.src === 'string'
      ? entry.src.trim()
      : typeof entry.url === 'string'
        ? entry.url.trim()
        : typeof entry.path === 'string'
          ? entry.path.trim()
          : '';
    if (dataUri && !new RegExp(`^data:${mimeType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')};base64,`).test(dataUri)) {
      errors.push(`${itemLabel} has an invalid data URI.`);
      return;
    }
    if (dataUri) {
      const base64 = dataUri.slice(dataUri.indexOf(',') + 1);
      if (!base64 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
        errors.push(`${itemLabel} has an invalid data URI.`);
        return;
      }
      const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
      const decodedLength = (base64.length / 4) * 3 - padding;
      if (decodedLength <= 0) {
        errors.push(`${itemLabel} has an invalid data URI.`);
        return;
      }
    }
    if (src && !isSupportedImageReference(src)) {
      errors.push(`${itemLabel} has an invalid image reference.`);
      return;
    }
    if (!dataUri && !src) {
      errors.push(`${itemLabel} needs a dataUri or src.`);
      return;
    }
    images.push({
      id,
      type,
      mimeType,
      alt,
      caption,
      ...(option ? { option } : {}),
      ...(dataUri ? { dataUri } : { src }),
    });
  });
  return images;
}

function optionText(
  value: unknown,
  letter: QuestionBankOptionLetter,
  label: string,
  errors: string[],
): QuestionBankOptionDraft {
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) errors.push(`${label}: option ${letter} must contain English or Hindi text.`);
    return { text_en: text, text_hi: '' };
  }
  if (!isRecord(value)) {
    errors.push(`${label}: option ${letter} must be an object with text_en and text_hi.`);
    return { text_en: '', text_hi: '' };
  }

  const english = value.text_en ?? value.textEn ?? value.text;
  const hindi = value.text_hi ?? value.textHi;
  if (!(english === undefined || english === null || typeof english === 'string')) {
    errors.push(`${label}: option ${letter} English text must be a string.`);
  }
  if (!(hindi === undefined || hindi === null || typeof hindi === 'string')) {
    errors.push(`${label}: option ${letter} Hindi text must be a string or null.`);
  }
  const textEn = typeof english === 'string' ? english.trim() : '';
  const textHi = typeof hindi === 'string' ? hindi.trim() : '';
  if (!textEn && !textHi) {
    errors.push(`${label}: option ${letter} must contain English or Hindi text.`);
  }
  return { text_en: textEn, text_hi: textHi };
}

function normalizeOptions(
  value: unknown,
  label: string,
  errors: string[],
): Record<QuestionBankOptionLetter, QuestionBankOptionDraft> {
  const fallback = (): Record<QuestionBankOptionLetter, QuestionBankOptionDraft> => ({
    A: { text_en: '', text_hi: '' },
    B: { text_en: '', text_hi: '' },
    C: { text_en: '', text_hi: '' },
    D: { text_en: '', text_hi: '' },
  });

  if (Array.isArray(value)) {
    if (value.length !== 4) {
      errors.push(`${label}: options must contain exactly A, B, C, and D.`);
      return fallback();
    }
    return {
      A: optionText(value[0], 'A', label, errors),
      B: optionText(value[1], 'B', label, errors),
      C: optionText(value[2], 'C', label, errors),
      D: optionText(value[3], 'D', label, errors),
    };
  }

  if (!isRecord(value)) {
    errors.push(`${label}: options must be an object containing exactly A, B, C, and D.`);
    return fallback();
  }
  const keys = Object.keys(value).sort();
  if (keys.join(',') !== 'A,B,C,D') {
    errors.push(`${label}: options must contain exactly A, B, C, and D and no other keys.`);
    return fallback();
  }
  return {
    A: optionText(value.A, 'A', label, errors),
    B: optionText(value.B, 'B', label, errors),
    C: optionText(value.C, 'C', label, errors),
    D: optionText(value.D, 'D', label, errors),
  };
}

function includesField(source: QuestionBankSourceDefinition, field: QuestionBankField): boolean {
  return source.fields.includes(field);
}

function resolveSubject(
  source: QuestionBankSourceDefinition,
  value: unknown,
  label: string,
  errors: string[],
  lockedSubject: QuestionBankSubject | null,
): string {
  if (!source.subjectField) return '';
  if (lockedSubject && !source.subjects.includes(lockedSubject)) {
    errors.push(`${label}: the ${lockedSubject} section is not valid for this source.`);
    return '';
  }

  const requiredSubject = source.fixedSubject ?? lockedSubject;
  if (requiredSubject) {
    if (value !== undefined && value !== null && value !== '') {
      if (typeof value !== 'string' || value.trim() !== requiredSubject) {
        errors.push(
          lockedSubject
            ? `${label}: this section only accepts the subject ${requiredSubject}.`
            : `${label}: this bank only accepts the subject ${requiredSubject}.`,
        );
      }
    }
    return requiredSubject;
  }

  if (typeof value !== 'string' || !value.trim()) {
    errors.push(`${label}: choose a subject (${source.subjects.join(', ')}).`);
    return '';
  }
  const subject = value.trim();
  if (!source.subjects.includes(subject as QuestionBankSubject)) {
    errors.push(`${label}: subject must be one of ${source.subjects.join(', ')}.`);
    return '';
  }
  return subject;
}

export function createEmptyQuestionDraft(
  sourceId: QuestionBankSourceId,
  lockedSubject: QuestionBankSubject | null = null,
): QuestionBankQuestionDraft {
  const source = getQuestionBankSource(sourceId);
  return {
    question_code: '',
    subject: source?.fixedSubject ?? lockedSubject ?? '',
    chapter: '',
    topic: '',
    section: '',
    exercise: '',
    question_en: '',
    question_hi: '',
    options: {
      A: { text_en: '', text_hi: '' },
      B: { text_en: '', text_hi: '' },
      C: { text_en: '', text_hi: '' },
      D: { text_en: '', text_hi: '' },
    },
    answer_key: '',
    answer_key_source: '',
    explanation_en: '',
    explanation_hi: '',
    difficulty: '',
    source_pdf: '',
    source_page: '',
    tags: '',
    exam_name: '',
    exam_year: '',
    paper_session: '',
    paper_title: '',
    verification_status: '',
    images: '',
  };
}

/**
 * Validates a question against one registered source. The returned payload uses
 * only fields declared by that source and writes the correct subject column
 * (`subject`, `subject_area`, or no subject column for Physics).
 */
export function normalizeQuestionInput(
  value: unknown,
  sourceOrId: QuestionBankSourceDefinition | QuestionBankSourceId | string,
  inputOptions: QuestionBankInputOptions = {},
): QuestionBankInputResult {
  const source = typeof sourceOrId === 'string'
    ? getQuestionBankSource(sourceOrId)
    : sourceOrId;
  if (!source || !source.table) {
    return {
      ok: false,
      errors: [`Unknown question-bank source "${String(sourceOrId)}".`],
    };
  }

  const label = source.label;
  if (!isRecord(value)) {
    return { ok: false, errors: [`${label}: a question object is required.`] };
  }

  const errors: string[] = [];
  const questionCode = optionalText(value.question_code, 'question code', label, errors, 160);
  const chapter = optionalText(value.chapter, 'chapter', label, errors, 200);
  const topic = optionalText(value.topic, 'topic', label, errors, 200);
  const section = optionalText(value.section, 'section', label, errors, 200);
  const exercise = optionalText(value.exercise, 'exercise', label, errors, 200);
  const questionEn = optionalText(value.question_en, 'English question text', label, errors, 100_000);
  const questionHi = optionalText(value.question_hi, 'Hindi question text', label, errors, 100_000);
  const answerKeySource = optionalText(value.answer_key_source, 'answer-key source', label, errors, 300);
  const explanationEn = optionalText(value.explanation_en, 'English explanation', label, errors, 100_000);
  const explanationHi = optionalText(value.explanation_hi, 'Hindi explanation', label, errors, 100_000);
  const difficulty = optionalText(value.difficulty, 'difficulty', label, errors, 60);
  const sourcePdf = sourcePdfText(value.source_pdf, label, errors);
  const sourcePage = normalizeSourcePage(value.source_page, label, errors);
  const tags = normalizeTags(value.tags, label, errors);
  const images = normalizeImages(value.images, label, errors);
  const examName = optionalText(value.exam_name, 'exam name', label, errors, 120);
  const examYear = normalizeExamYear(value.exam_year, label, errors);
  const paperSession = optionalText(value.paper_session, 'paper session', label, errors, 120);
  const paperTitle = optionalText(value.paper_title, 'paper title', label, errors, 200);
  const verificationStatus = optionalText(value.verification_status, 'verification status', label, errors, 40);
  const answerKey = normalizeAnswerKey(value.answer_key, label, errors);
  const options = normalizeOptions(value.options, label, errors);
  const subject = resolveSubject(
    source,
    value.subject,
    label,
    errors,
    inputOptions.lockedSubject ?? null,
  );

  if (!chapter) errors.push(`${label}: chapter is required.`);
  if (!questionEn && !questionHi) {
    errors.push(`${label}: enter English or Hindi question text.`);
  }
  if (!questionCode && !questionEn && !questionHi) {
    errors.push(`${label}: a question code or question text is required.`);
  }

  if (errors.length) return { ok: false, errors };

  const payload: QuestionBankQuestionPayload = {};
  const put = (field: QuestionBankField, valueToWrite: unknown) => {
    if (includesField(source, field)) payload[field] = valueToWrite;
  };
  put('question_code', questionCode || null);
  put('chapter', chapter);
  put('topic', topic || null);
  put('section', section || null);
  put('exercise', exercise || null);
  put('question_en', questionEn);
  put('question_hi', questionHi || null);
  put('options', {
    A: { text_en: options.A.text_en, text_hi: options.A.text_hi || null },
    B: { text_en: options.B.text_en, text_hi: options.B.text_hi || null },
    C: { text_en: options.C.text_en, text_hi: options.C.text_hi || null },
    D: { text_en: options.D.text_en, text_hi: options.D.text_hi || null },
  });
  put('answer_key', answerKey);
  put('answer_key_source', answerKeySource || null);
  put('explanation_en', explanationEn || null);
  put('explanation_hi', explanationHi || null);
  put('difficulty', difficulty || null);
  put('source_pdf', sourcePdf || null);
  put('source_page', sourcePage);
  put('tags', tags);
  put('images', images.length ? images : null);
  put('exam_name', examName || null);
  put('exam_year', examYear);
  put('paper_session', paperSession || null);
  put('paper_title', paperTitle || null);
  put('verification_status', verificationStatus || 'unverified');
  if (source.subjectField) payload[source.subjectField] = subject;

  return {
    ok: true,
    payload,
    draft: {
      question_code: questionCode,
      subject,
      chapter,
      topic,
      section,
      exercise,
      question_en: questionEn,
      question_hi: questionHi,
      options,
      answer_key: answerKey ?? '',
      answer_key_source: answerKeySource,
      explanation_en: explanationEn,
      explanation_hi: explanationHi,
      difficulty,
      source_pdf: sourcePdf,
      source_page: sourcePage === null ? '' : String(sourcePage),
      tags: tags.join(', '),
      images: images.length ? JSON.stringify(images) : '',
      exam_name: examName,
      exam_year: examYear === null ? '' : String(examYear),
      paper_session: paperSession,
      paper_title: paperTitle,
      verification_status: verificationStatus || 'unverified',
    },
  };
}

export function validateQuestionId(
  sourceOrId: QuestionBankSourceDefinition | QuestionBankSourceId | string,
  value: unknown,
): { ok: true; id: string } | { ok: false; message: string } {
  const source = typeof sourceOrId === 'string'
    ? getQuestionBankSource(sourceOrId)
    : sourceOrId;
  if (!source) return { ok: false, message: 'Unknown question-bank source.' };
  if (!(typeof value === 'string' || typeof value === 'number')) {
    return { ok: false, message: 'A question ID is required.' };
  }
  const id = String(value).trim();
  if (!id || id.length > 200 || CONTROL_CHARACTERS.test(id)) {
    return { ok: false, message: 'The question ID is not valid.' };
  }
  if (source.idKind === 'uuid' && !UUID_PATTERN.test(id)) {
    return {
      ok: false,
      message: `${source.label} uses UUID question IDs. The supplied ID is not a UUID.`,
    };
  }
  return { ok: true, id };
}

function textValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
}

export function adminQuestionSummaryFromRow(
  source: QuestionBankSourceDefinition,
  value: Record<string, unknown>,
): AdminQuestionSummary {
  const id = textValue(value.id).trim();
  const subject = source.subjectField
    ? textValue(value[source.subjectField]).trim() || source.fixedSubject || null
    : source.fixedSubject ?? null;
  const topic = textValue(value.topic).trim() || null;
  const chapter = textValue(value.chapter).trim() || topic || 'Uncategorized';
  const questionCode = textValue(value.question_code).trim() || null;
  const preview = (textValue(value.question_en) || textValue(value.question_hi))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
  const rawAnswer = textValue(value.answer_key).trim().toUpperCase();
  const answerKey = OPTION_LETTERS.includes(rawAnswer as QuestionBankOptionLetter)
    ? rawAnswer as QuestionBankOptionLetter
    : null;
  const sourcePdfValue = value.source_pdf;
  const sourcePdf = typeof sourcePdfValue === 'string'
    ? sourcePdfValue.trim() || null
    : isRecord(sourcePdfValue)
      ? textValue(sourcePdfValue.file_name ?? sourcePdfValue.fileName).trim() || null
      : null;

  const examYearValue = value.exam_year;
  const examYear = typeof examYearValue === 'number' && Number.isSafeInteger(examYearValue)
    ? examYearValue
    : typeof examYearValue === 'string' && examYearValue.trim()
      ? Number(examYearValue.trim())
      : null;

  return {
    id,
    questionCode,
    subject,
    chapter,
    topic,
    preview,
    answerKey,
    hasHindi: Boolean(textValue(value.question_hi).trim()),
    sourcePdf,
    examName: textValue(value.exam_name).trim() || null,
    examYear: Number.isSafeInteger(examYear) ? examYear : null,
    paperSession: textValue(value.paper_session).trim() || null,
    paperTitle: textValue(value.paper_title).trim() || null,
    verificationStatus: textValue(value.verification_status).trim() || null,
    raw: value,
  };
}

export interface RemoteQuestionImagePreview {
  images: ExamImage[];
  error: string | null;
}

export function parseRemoteQuestionImagePreview(value: string): RemoteQuestionImagePreview {
  const trimmed = value.trim();
  if (!trimmed) return { images: [], error: null };

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    return {
      images: [],
      error: `Image preview unavailable: ${error instanceof Error ? error.message : 'invalid JSON'}.`,
    };
  }

  if (!Array.isArray(parsed)) {
    return { images: [], error: 'Image preview unavailable: images must be a JSON array.' };
  }

  const images: ExamImage[] = [];
  parsed.forEach((entry, index) => {
    if (!isRecord(entry)) return;
    const type = entry.type;
    if (!['question', 'option', 'explanation'].includes(String(type))) return;
    const mimeType = typeof entry.mimeType === 'string' && entry.mimeType.trim()
      ? entry.mimeType.trim()
      : 'image/png';
    const dataUri = typeof entry.dataUri === 'string' ? entry.dataUri.trim() : '';
    const src = typeof entry.src === 'string'
      ? entry.src.trim()
      : typeof entry.url === 'string'
        ? entry.url.trim()
        : '';
    if (!dataUri && !src) return;

    const option = entry.option;
    images.push({
      id: typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : `preview-${index + 1}`,
      type: type as ExamImage['type'],
      mimeType,
      ...(dataUri ? { dataUri } : {}),
      ...(src ? { src } : {}),
      alt: typeof entry.alt === 'string' ? entry.alt : '',
      caption: typeof entry.caption === 'string' ? entry.caption : null,
      ...(option === 'A' || option === 'B' || option === 'C' || option === 'D'
        ? { option: option as ExamImage['option'] }
        : {}),
    });
  });

  return { images, error: null };
}
