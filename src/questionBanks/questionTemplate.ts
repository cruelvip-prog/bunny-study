import type {
  QuestionBankAdminSectionDefinition,
  QuestionBankSourceDefinition,
  QuestionBankSubject,
} from './sourceRegistry';

export const QUESTION_BANK_TEMPLATE_FORMAT = 'oinkie-question-bank-template';
export const QUESTION_BANK_TEMPLATE_SCHEMA_VERSION = '1.0';

const SAMPLE_IMAGE_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aWQAAAAASUVORK5CYII=';

export interface QuestionBankTemplateDestination {
  source: string;
  table: string;
  subject_field: string | null;
  subject: string | null;
  id_kind: 'uuid' | 'opaque';
}

export interface QuestionBankTemplateDocument {
  schema_version: typeof QUESTION_BANK_TEMPLATE_SCHEMA_VERSION;
  format: typeof QUESTION_BANK_TEMPLATE_FORMAT;
  generated_by: 'OINKIE Study admin';
  section: {
    id: string;
    label: string;
    subject: string | null;
  } | null;
  destination: QuestionBankTemplateDestination;
  documentation: {
    accepted_root: string;
    questions: string;
    schema: string;
    subject_routing: string;
    source_metadata: string;
    images: string;
    import_limits: string;
    safety: string;
  };
  questions: Array<Record<string, unknown>>;
}

export interface BuildQuestionBankTemplateOptions {
  section?: QuestionBankAdminSectionDefinition | null;
  subjectLock?: QuestionBankSubject | null;
}

function templateSubject(
  source: QuestionBankSourceDefinition,
  options: BuildQuestionBankTemplateOptions,
): QuestionBankSubject | null {
  const candidate = options.subjectLock
    ?? options.section?.subject
    ?? source.fixedSubject
    ?? source.subjects[0]
    ?? null;
  if (!source.subjectField) return null;
  if (candidate && source.subjects.includes(candidate)) return candidate;
  return source.fixedSubject ?? source.subjects[0] ?? null;
}

export function buildQuestionBankTemplate(
  source: QuestionBankSourceDefinition,
  options: BuildQuestionBankTemplateOptions = {},
): QuestionBankTemplateDocument {
  const section = options.section ?? null;
  const subject = templateSubject(source, options);
  const subjectField = source.subjectField;
  const destinationSubject = source.subjectField
    ? source.fixedSubject ?? section?.subject ?? null
    : source.fixedSubject ?? null;
  const sectionId = section?.id ?? source.id;
  const sample: Record<string, unknown> = {
    question_code: `SAMPLE-${sectionId.toUpperCase()}-001`,
    chapter: 'Sample chapter',
    topic: 'Sample topic',
    section: 'Sample section',
    exercise: 'Sample exercise',
    question_en: `Sample ${section?.label ?? source.label} question. Replace this with verified exam text.`,
    question_hi: `नमूना ${section?.label ?? source.label} प्रश्न। इसे सत्यापित प्रश्न पाठ से बदलें।`,
    options: {
      A: { text_en: 'Sample option A', text_hi: 'नमूना विकल्प अ' },
      B: { text_en: 'Sample option B', text_hi: 'नमूना विकल्प ब' },
      C: { text_en: 'Sample option C', text_hi: 'नमूना विकल्प स' },
      D: { text_en: 'Sample option D', text_hi: 'नमूना विकल्प द' },
    },
    answer_key: 'A',
    answer_key_source: 'Replace with the verified answer-key source',
    explanation_en: 'Replace this explanation with the verified explanation.',
    explanation_hi: 'इस व्याख्या को सत्यापित व्याख्या से बदलें।',
    difficulty: 'easy',
    source_pdf: 'sample-source.pdf',
    source_page: 1,
    tags: ['sample', sectionId],
    images: [
      {
        id: 'sample-question-image',
        type: 'question',
        mimeType: 'image/png',
        dataUri: SAMPLE_IMAGE_DATA_URI,
        alt: 'Sample question image',
        caption: 'Sample image',
      },
    ],
  };
  if (subjectField && subject) {
    sample[subjectField] = subject;
  }

  const sectionLabel = section?.label ?? source.label;
  const subjectRouting = subjectField && subject
    ? section
      ? `This template sets ${subjectField} to "${subject}". The server locks the selected ${section.label} section to that subject.`
      : `This template uses ${subject} as the sample subject for the secondary ${source.label} bank. Change ${subjectField} to the intended subject; this secondary bank accepts ${source.subjects.join(', ')} and does not apply a fixed subject lock.`
    : 'The Physics project has no subject column. Questions are routed only by the selected source and table.';

  return {
    schema_version: QUESTION_BANK_TEMPLATE_SCHEMA_VERSION,
    format: QUESTION_BANK_TEMPLATE_FORMAT,
    generated_by: 'OINKIE Study admin',
    section: section
      ? { id: section.id, label: section.label, subject: section.subject }
      : null,
    destination: {
      source: source.id,
      table: source.table,
      subject_field: subjectField,
      subject: destinationSubject,
      id_kind: source.idKind,
    },
    documentation: {
      accepted_root:
        'A JSON object with a "questions" array is recommended. The existing importer also accepts a bare question array or a { "questions": [...] } object.',
      questions: 'Each array entry is one question object using the fields shown in the sample.',
      schema: `Template schema_version ${QUESTION_BANK_TEMPLATE_SCHEMA_VERSION}, format ${QUESTION_BANK_TEMPLATE_FORMAT}. The importer validates every question before any insert.`,
      subject_routing: `${sectionLabel}: ${subjectRouting}`,
      source_metadata:
        'source_pdf accepts a filename string or an object with file_name. source_page must be a whole number of 1 or more. tags accepts a string array or comma-separated text.',
      images:
        'Embedded images are supported in the shared images array. Each item has id, type (question, option, or explanation), mimeType, alt, caption, optional option (A-D), and either dataUri or src. Embedded data URIs are validated and uploaded through the trusted server API during import.',
      import_limits:
        'Maximum 1,000 questions and 20 MiB per file. The server inserts accepted questions in batches of 25 and does not overwrite existing rows.',
      safety:
        'Downloaded template destination metadata is checked by the admin importer. Server routing still uses the selected admin section and is not trusted from this file.',
    },
    questions: [sample],
  };
}

export function questionBankTemplateFileName(
  source: QuestionBankSourceDefinition,
  section: QuestionBankAdminSectionDefinition | null = null,
): string {
  return `oinkie-${section?.id ?? source.id}-questions-template.json`;
}
