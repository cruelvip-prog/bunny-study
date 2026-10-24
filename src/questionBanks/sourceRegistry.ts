export type QuestionBankSourceId = 'physics' | 'biology' | 'botany' | 'zoology' | 'chemistry' | 'pyq' | 'general' | 'archive';
export type QuestionBankSubject = 'Physics' | 'Chemistry' | 'Botany' | 'Zoology';
export type QuestionBankSubjectField = 'subject' | 'subject_area';
export type QuestionBankAdminSectionId = 'physics' | 'chemistry' | 'botany' | 'zoology' | 'pyqs';

export type QuestionBankField =
  | 'question_code'
  | 'chapter'
  | 'topic'
  | 'section'
  | 'exercise'
  | 'question_en'
  | 'question_hi'
  | 'options'
  | 'answer_key'
  | 'answer_key_source'
  | 'explanation_en'
  | 'explanation_hi'
  | 'difficulty'
  | 'source_pdf'
  | 'source_page'
  | 'tags'
  | 'exam_name'
  | 'exam_year'
  | 'paper_session'
  | 'paper_title'
  | 'verification_status'
  | 'images';

export interface QuestionBankEnvironmentNames {
  url: string;
  publishableKey: string;
}

export interface QuestionBankServerEnvironmentNames {
  url: string;
  serviceRoleKey: string;
}

export interface QuestionBankCapabilities {
  publicRead: boolean;
  adminRead: boolean;
  adminCreate: boolean;
  adminUpdate: boolean;
  adminDelete: boolean;
  adminImport: boolean;
}

export interface QuestionBankSourceDefinition {
  id: QuestionBankSourceId;
  label: string;
  table: string;
  subjects: readonly QuestionBankSubject[];
  subjectField: QuestionBankSubjectField | null;
  fixedSubject: QuestionBankSubject | null;
  idKind: 'uuid' | 'opaque';
  fields: readonly QuestionBankField[];
  publicEnvironment: QuestionBankEnvironmentNames;
  serverEnvironment: QuestionBankServerEnvironmentNames;
  capabilities: QuestionBankCapabilities;
}

const STANDARD_FIELDS: readonly QuestionBankField[] = [
  'question_code',
  'chapter',
  'topic',
  'section',
  'exercise',
  'question_en',
  'question_hi',
  'options',
  'answer_key',
  'answer_key_source',
  'explanation_en',
  'explanation_hi',
  'difficulty',
  'source_pdf',
  'source_page',
  'tags',
  'images',
];

const PYQ_FIELDS: readonly QuestionBankField[] = [
  ...STANDARD_FIELDS,
  'exam_name',
  'exam_year',
  'paper_session',
  'paper_title',
  'verification_status',
];

const FULL_ADMIN_CAPABILITIES: QuestionBankCapabilities = {
  publicRead: true,
  adminRead: true,
  adminCreate: true,
  adminUpdate: true,
  adminDelete: true,
  adminImport: true,
};

export const QUESTION_BANK_SOURCES: readonly QuestionBankSourceDefinition[] = [
  {
    id: 'physics',
    label: 'Physics project',
    table: 'physics_questions',
    subjects: ['Physics'],
    subjectField: null,
    fixedSubject: 'Physics',
    idKind: 'opaque',
    fields: STANDARD_FIELDS,
    publicEnvironment: {
      url: 'VITE_SUPABASE_PHYSICS_URL',
      publishableKey: 'VITE_SUPABASE_PHYSICS_PUBLISHABLE_KEY',
    },
    serverEnvironment: {
      url: 'OINKIE_PHYSICS_SUPABASE_URL',
      serviceRoleKey: 'OINKIE_PHYSICS_SUPABASE_SERVICE_ROLE_KEY',
    },
    capabilities: FULL_ADMIN_CAPABILITIES,
  },
  {
    id: 'biology',
    label: 'Biology project',
    table: 'biology_questions',
    subjects: ['Botany', 'Zoology'],
    subjectField: 'subject_area',
    fixedSubject: null,
    idKind: 'opaque',
    fields: STANDARD_FIELDS,
    publicEnvironment: {
      url: 'VITE_SUPABASE_BIOLOGY_URL',
      publishableKey: 'VITE_SUPABASE_BIOLOGY_PUBLISHABLE_KEY',
    },
    serverEnvironment: {
      url: 'OINKIE_BIOLOGY_SUPABASE_URL',
      serviceRoleKey: 'OINKIE_BIOLOGY_SUPABASE_SERVICE_ROLE_KEY',
    },
    capabilities: FULL_ADMIN_CAPABILITIES,
  },
  {
    id: 'botany',
    label: 'Botany project',
    table: 'botany_questions',
    subjects: ['Botany'],
    subjectField: null,
    fixedSubject: 'Botany',
    idKind: 'uuid',
    fields: STANDARD_FIELDS,
    publicEnvironment: {
      url: 'VITE_SUPABASE_BIOLOGY_URL',
      publishableKey: 'VITE_SUPABASE_BIOLOGY_PUBLISHABLE_KEY',
    },
    serverEnvironment: {
      url: 'OINKIE_BIOLOGY_SUPABASE_URL',
      serviceRoleKey: 'OINKIE_BIOLOGY_SUPABASE_SERVICE_ROLE_KEY',
    },
    capabilities: FULL_ADMIN_CAPABILITIES,
  },
  {
    id: 'zoology',
    label: 'Zoology project',
    table: 'zoology_questions',
    subjects: ['Zoology'],
    subjectField: null,
    fixedSubject: 'Zoology',
    idKind: 'uuid',
    fields: STANDARD_FIELDS,
    publicEnvironment: {
      url: 'VITE_SUPABASE_BIOLOGY_URL',
      publishableKey: 'VITE_SUPABASE_BIOLOGY_PUBLISHABLE_KEY',
    },
    serverEnvironment: {
      url: 'OINKIE_BIOLOGY_SUPABASE_URL',
      serviceRoleKey: 'OINKIE_BIOLOGY_SUPABASE_SERVICE_ROLE_KEY',
    },
    capabilities: FULL_ADMIN_CAPABILITIES,
  },
  {
    id: 'pyq',
    label: 'PYQ project',
    table: 'pyq_questions',
    subjects: ['Physics', 'Chemistry', 'Botany', 'Zoology'],
    subjectField: 'subject',
    fixedSubject: null,
    idKind: 'uuid',
    fields: PYQ_FIELDS,
    publicEnvironment: {
      url: 'VITE_SUPABASE_PYQ_URL',
      publishableKey: 'VITE_SUPABASE_PYQ_PUBLISHABLE_KEY',
    },
    serverEnvironment: {
      url: 'OINKIE_PYQ_SUPABASE_URL',
      serviceRoleKey: 'OINKIE_PYQ_SUPABASE_SERVICE_ROLE_KEY',
    },
    capabilities: FULL_ADMIN_CAPABILITIES,
  },
  {
    id: 'chemistry',
    label: 'OINKIE Chemistry Bank',
    table: 'chemistry_questions',
    subjects: ['Chemistry'],
    subjectField: 'subject',
    fixedSubject: 'Chemistry',
    idKind: 'uuid',
    fields: STANDARD_FIELDS,
    publicEnvironment: {
      url: 'VITE_SUPABASE_CHEMISTRY_URL',
      publishableKey: 'VITE_SUPABASE_CHEMISTRY_PUBLISHABLE_KEY',
    },
    serverEnvironment: {
      url: 'OINKIE_CHEMISTRY_SUPABASE_URL',
      serviceRoleKey: 'OINKIE_CHEMISTRY_SUPABASE_SERVICE_ROLE_KEY',
    },
    capabilities: FULL_ADMIN_CAPABILITIES,
  },
  {
    id: 'general',
    label: 'General question bank',
    table: 'question_bank',
    subjects: ['Physics', 'Chemistry', 'Botany', 'Zoology'],
    subjectField: 'subject',
    fixedSubject: null,
    idKind: 'opaque',
    fields: STANDARD_FIELDS,
    publicEnvironment: {
      url: 'VITE_SUPABASE_GENERAL_URL',
      publishableKey: 'VITE_SUPABASE_GENERAL_PUBLISHABLE_KEY',
    },
    serverEnvironment: {
      url: 'OINKIE_GENERAL_SUPABASE_URL',
      serviceRoleKey: 'OINKIE_GENERAL_SUPABASE_SERVICE_ROLE_KEY',
    },
    capabilities: FULL_ADMIN_CAPABILITIES,
  },
  {
    id: 'archive',
    label: 'Question-bank archive',
    table: 'question_bank_archive',
    subjects: ['Physics', 'Chemistry', 'Botany', 'Zoology'],
    subjectField: 'subject',
    fixedSubject: null,
    idKind: 'opaque',
    fields: STANDARD_FIELDS,
    publicEnvironment: {
      url: 'VITE_SUPABASE_ARCHIVE_URL',
      publishableKey: 'VITE_SUPABASE_ARCHIVE_PUBLISHABLE_KEY',
    },
    serverEnvironment: {
      url: 'OINKIE_ARCHIVE_SUPABASE_URL',
      serviceRoleKey: 'OINKIE_ARCHIVE_SUPABASE_SERVICE_ROLE_KEY',
    },
    capabilities: FULL_ADMIN_CAPABILITIES,
  },
];

export const QUESTION_BANK_SOURCE_IDS: readonly QuestionBankSourceId[] =
  QUESTION_BANK_SOURCES.map((source) => source.id);

const SOURCE_BY_ID = new Map<QuestionBankSourceId, QuestionBankSourceDefinition>(
  QUESTION_BANK_SOURCES.map((source) => [source.id, source]),
);

export function isQuestionBankSourceId(value: unknown): value is QuestionBankSourceId {
  return typeof value === 'string' && SOURCE_BY_ID.has(value as QuestionBankSourceId);
}

export function getQuestionBankSource(
  value: unknown,
): QuestionBankSourceDefinition | null {
  return isQuestionBankSourceId(value) ? SOURCE_BY_ID.get(value) ?? null : null;
}

export function requireQuestionBankSource(value: unknown): QuestionBankSourceDefinition {
  const source = getQuestionBankSource(value);
  if (!source) {
    throw new Error(
      `Unknown question-bank source "${String(value)}". Use one of: ${QUESTION_BANK_SOURCE_IDS.join(', ')}.`,
    );
  }
  return source;
}

export function getQuestionBankSourceSubjects(
  value: unknown,
): QuestionBankSubject[] {
  return [...requireQuestionBankSource(value).subjects];
}

export interface QuestionBankAdminSectionDefinition {
  id: QuestionBankAdminSectionId;
  label: string;
  description: string;
  sourceId: QuestionBankSourceId | null;
  subject: QuestionBankSubject | null;
  setupRequired: string | null;
}

export const QUESTION_BANK_PYQ_SETUP_REQUIRED =
  'No remote PYQ question bank is registered. The existing NEET PYQ Tests feature reads root-level pyqPaper metadata from locally saved question banks; that local paper catalog is not a remote admin source. Admin PYQ writes stay disabled until a source-specific table and migration are reviewed and approved.';

export const QUESTION_BANK_ADMIN_SECTIONS: readonly QuestionBankAdminSectionDefinition[] = [
  {
    id: 'physics',
    label: 'Physics',
    description: 'Manage questions in the dedicated Physics project bank.',
    sourceId: 'physics',
    subject: 'Physics',
    setupRequired: null,
  },
  {
    id: 'chemistry',
    label: 'Chemistry',
    description: 'Manage questions in the dedicated Chemistry project bank.',
    sourceId: 'chemistry',
    subject: 'Chemistry',
    setupRequired: null,
  },
  {
    id: 'botany',
    label: 'Botany',
    description: 'Manage Botany questions in the independent Botany table.',
    sourceId: 'botany',
    subject: 'Botany',
    setupRequired: null,
  },
  {
    id: 'zoology',
    label: 'Zoology',
    description: 'Manage Zoology questions in the independent Zoology table.',
    sourceId: 'zoology',
    subject: 'Zoology',
    setupRequired: null,
  },
  {
    id: 'pyqs',
    label: 'PYQs',
    description: 'Manage previous-year questions in the dedicated PYQ bank.',
    sourceId: 'pyq',
    subject: null,
    setupRequired: null,
  },
];

export const QUESTION_BANK_PRIMARY_SECTION_IDS: readonly QuestionBankAdminSectionId[] =
  QUESTION_BANK_ADMIN_SECTIONS.map((section) => section.id);

export const QUESTION_BANK_OTHER_SOURCE_IDS = ['biology', 'general', 'archive'] as const;

const ADMIN_SECTION_BY_ID = new Map<QuestionBankAdminSectionId, QuestionBankAdminSectionDefinition>(
  QUESTION_BANK_ADMIN_SECTIONS.map((section) => [section.id, section]),
);

export function isQuestionBankAdminSectionId(
  value: unknown,
): value is QuestionBankAdminSectionId {
  return typeof value === 'string' && ADMIN_SECTION_BY_ID.has(value as QuestionBankAdminSectionId);
}

export function getQuestionBankAdminSection(
  value: unknown,
): QuestionBankAdminSectionDefinition | null {
  return isQuestionBankAdminSectionId(value)
    ? ADMIN_SECTION_BY_ID.get(value) ?? null
    : null;
}

export function requireQuestionBankAdminSection(
  value: unknown,
): QuestionBankAdminSectionDefinition {
  const section = getQuestionBankAdminSection(value);
  if (!section) {
    throw new Error(
      `Unknown question-bank admin section "${String(value)}". Use one of: ${QUESTION_BANK_PRIMARY_SECTION_IDS.join(', ')}.`,
    );
  }
  return section;
}

export function getQuestionBankAdminSectionSource(
  value: unknown,
): QuestionBankSourceDefinition | null {
  const section = getQuestionBankAdminSection(value);
  return section?.sourceId ? getQuestionBankSource(section.sourceId) : null;
}
