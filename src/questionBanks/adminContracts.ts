import type { QuestionBankSourceId, QuestionBankSubject } from './sourceRegistry';

export const QUESTION_BANK_IMPORT_MAX = 1_000;
export const QUESTION_BANK_IMPORT_MAX_BYTES = 20 * 1024 * 1024;
export const QUESTION_BANK_IMPORT_BATCH_SIZE = 25;

export type QuestionBankAdminStatusState =
  | 'connected'
  | 'empty'
  | 'unavailable'
  | 'permission-denied'
  | 'missing-table'
  | 'invalid-configuration';

export interface QuestionBankAdminStatus {
  source: QuestionBankSourceId;
  label: string;
  table: string;
  subjects: QuestionBankSubject[];
  state: QuestionBankAdminStatusState;
  count: number | null;
  detail: string;
  lastCheckedAt: string;
}

export type QuestionBankLanguageFilter = 'all' | 'with-hindi' | 'without-hindi';
export type QuestionBankAnswerFilter = 'all' | 'present' | 'missing';

export interface QuestionBankListQuery {
  page?: number | string;
  pageSize?: number | string;
  search?: string;
  subject?: string;
  chapter?: string;
  topic?: string;
  section?: string;
  exercise?: string;
  difficulty?: string;
  language?: QuestionBankLanguageFilter | string;
  answer?: QuestionBankAnswerFilter | string;
  sourcePdf?: string;
}

export interface AdminQuestionSummary {
  id: string;
  questionCode: string | null;
  subject: string | null;
  chapter: string;
  topic: string | null;
  preview: string;
  answerKey: 'A' | 'B' | 'C' | 'D' | null;
  hasHindi: boolean;
  sourcePdf: string | null;
  examName: string | null;
  examYear: number | null;
  paperSession: string | null;
  paperTitle: string | null;
  verificationStatus: string | null;
  raw: Record<string, unknown>;
}

export interface QuestionBankListResponse {
  source: QuestionBankSourceId;
  label: string;
  table: string;
  count: number;
  page: number;
  pageSize: number;
  questions: AdminQuestionSummary[];
}

export interface QuestionBankMutationResponse {
  source: QuestionBankSourceId;
  label: string;
  table: string;
  question: AdminQuestionSummary;
}

export interface QuestionBankImportFailure {
  index: number;
  message: string;
}

export interface QuestionBankImportResponse {
  source: QuestionBankSourceId;
  label: string;
  table: string;
  inserted: AdminQuestionSummary[];
  failures: QuestionBankImportFailure[];
}

export interface QuestionBankApiErrorBody {
  error: {
    message: string;
    code?: string;
    issues?: string[];
  };
}
