import { supabase, supabaseConfigurationError } from '../lib/supabaseClient';
import type {
  QuestionBankAdminStatus,
  QuestionBankApiErrorBody,
  QuestionBankImportResponse,
  QuestionBankListQuery,
  QuestionBankListResponse,
  QuestionBankMutationResponse,
} from '../questionBanks/adminContracts';
import type {
  QuestionBankAdminSectionId,
  QuestionBankSourceId,
} from '../questionBanks/sourceRegistry';
import type { QuestionBankQuestionDraft } from '../questionBanks/questionInput';

const API_BASE = (import.meta.env?.VITE_ADMIN_API_BASE_URL?.trim() || '/api').replace(/\/$/, '');

export class AdminQuestionBankApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly issues: string[];

  constructor(message: string, status = 0, code = 'admin_api_error', issues: string[] = []) {
    super(message);
    this.name = 'AdminQuestionBankApiError';
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

function parseErrorBody(value: unknown): QuestionBankApiErrorBody['error'] | null {
  if (value === null || typeof value !== 'object') return null;
  const error = (value as Record<string, unknown>).error;
  if (error === null || typeof error !== 'object') return null;
  const record = error as Record<string, unknown>;
  if (typeof record.message !== 'string') return null;
  return {
    message: record.message,
    ...(typeof record.code === 'string' ? { code: record.code } : {}),
    ...(Array.isArray(record.issues) && record.issues.every((issue) => typeof issue === 'string')
      ? { issues: record.issues as string[] }
      : {}),
  };
}

async function accessToken(): Promise<string> {
  if (!supabase) {
    throw new AdminQuestionBankApiError(
      supabaseConfigurationError || 'The main Supabase project is not configured.',
      0,
      'main_project_not_configured',
    );
  }
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw new AdminQuestionBankApiError(
      `Could not read the admin session: ${error.message}`,
      0,
      'session_error',
    );
  }
  const token = data.session?.access_token?.trim();
  if (!token) {
    throw new AdminQuestionBankApiError(
      'Your admin session has ended. Sign in again before managing question banks.',
      401,
      'missing_session',
    );
  }
  return token;
}

async function adminRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await accessToken();
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/admin/question-banks${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${token}`,
      },
    });
  } catch {
    throw new AdminQuestionBankApiError(
      'The trusted admin API could not be reached. Start the OINKIE admin server or check the deployment.',
      0,
      'api_unreachable',
    );
  }

  let body: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!response.ok) {
    const error = parseErrorBody(body);
    throw new AdminQuestionBankApiError(
      error?.message || `The admin API returned HTTP ${response.status}.`,
      response.status,
      error?.code || 'admin_api_error',
      error?.issues ?? [],
    );
  }
  if (body === null) {
    throw new AdminQuestionBankApiError(
      'The admin API returned an empty response.',
      response.status,
      'invalid_response',
    );
  }
  return body as T;
}

function listSearchParams(
  query: QuestionBankListQuery,
  section: QuestionBankAdminSectionId | null,
): string {
  const parameters = new URLSearchParams();
  const add = (key: string, value: string | number | undefined) => {
    if (value !== undefined && value !== '') parameters.set(key, String(value));
  };
  add('adminSection', section ?? undefined);
  add('page', query.page);
  add('pageSize', query.pageSize);
  add('search', query.search);
  add('subject', query.subject);
  add('chapter', query.chapter);
  add('topic', query.topic);
  add('section', query.section);
  add('exercise', query.exercise);
  add('difficulty', query.difficulty);
  add('language', query.language);
  add('answer', query.answer);
  add('sourcePdf', query.sourcePdf);
  const encoded = parameters.toString();
  return encoded ? `?${encoded}` : '';
}

export async function loadAdminQuestionBankStatuses(): Promise<QuestionBankAdminStatus[]> {
  const response = await adminRequest<{ statuses: QuestionBankAdminStatus[] }>('/status');
  return response.statuses;
}

export function loadAdminQuestions(
  source: QuestionBankSourceId,
  query: QuestionBankListQuery,
  section: QuestionBankAdminSectionId | null = null,
): Promise<QuestionBankListResponse> {
  return adminRequest<QuestionBankListResponse>(
    `/${encodeURIComponent(source)}/questions${listSearchParams(query, section)}`,
  );
}

export function createAdminQuestion(
  source: QuestionBankSourceId,
  table: string,
  question: QuestionBankQuestionDraft,
  section: QuestionBankAdminSectionId | null = null,
): Promise<QuestionBankMutationResponse> {
  return adminRequest<QuestionBankMutationResponse>(
    `/${encodeURIComponent(source)}/questions`,
    {
      method: 'POST',
      body: JSON.stringify({ table, question, adminSection: section }),
    },
  );
}

export function updateAdminQuestion(
  source: QuestionBankSourceId,
  table: string,
  id: string,
  question: QuestionBankQuestionDraft,
  section: QuestionBankAdminSectionId | null = null,
): Promise<QuestionBankMutationResponse> {
  return adminRequest<QuestionBankMutationResponse>(
    `/${encodeURIComponent(source)}/questions/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ table, question, adminSection: section }),
    },
  );
}

export function deleteAdminQuestion(
  source: QuestionBankSourceId,
  table: string,
  id: string,
  section: QuestionBankAdminSectionId | null = null,
): Promise<QuestionBankMutationResponse> {
  const parameters = new URLSearchParams({ table });
  if (section) parameters.set('adminSection', section);
  return adminRequest<QuestionBankMutationResponse>(
    `/${encodeURIComponent(source)}/questions/${encodeURIComponent(id)}?${parameters.toString()}`,
    { method: 'DELETE' },
  );
}

export function importAdminQuestions(
  source: QuestionBankSourceId,
  table: string,
  questions: unknown[],
  section: QuestionBankAdminSectionId | null = null,
): Promise<QuestionBankImportResponse> {
  return adminRequest<QuestionBankImportResponse>(
    `/${encodeURIComponent(source)}/questions/import`,
    {
      method: 'POST',
      body: JSON.stringify({ table, questions, adminSection: section }),
    },
  );
}
