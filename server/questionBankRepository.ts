import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import type { QuestionBankAdminStatusState } from '../src/questionBanks/adminContracts';
import type {
  QuestionBankSourceDefinition,
  QuestionBankSourceId,
  QuestionBankSubjectField,
} from '../src/questionBanks/sourceRegistry';
import {
  getConfiguredRemoteProjects,
  type RemoteProjectServerConfig,
  type ServerEnvironment,
} from './config';
import { AdminApiError, errorMessage } from './errors';

export type NormalizedLanguageFilter = 'all' | 'with-hindi' | 'without-hindi';
export type NormalizedAnswerFilter = 'all' | 'present' | 'missing';

export interface NormalizedQuestionListQuery {
  page: number;
  pageSize: number;
  search: string;
  subject: string | null;
  chapter: string | null;
  topic: string | null;
  section: string | null;
  exercise: string | null;
  difficulty: string | null;
  sourcePdf: string | null;
  language: NormalizedLanguageFilter;
  answer: NormalizedAnswerFilter;
}

export interface SourceBackendStatus {
  state: QuestionBankAdminStatusState;
  count: number | null;
  detail: string;
}

export interface AdminQuestionListResult {
  rows: Record<string, unknown>[];
  count: number;
}

export interface QuestionBankSubjectScope {
  field: QuestionBankSubjectField;
  value: string;
}

export interface AdminQuestionRepository {
  status(source: QuestionBankSourceDefinition): Promise<SourceBackendStatus>;
  list(source: QuestionBankSourceDefinition, query: NormalizedQuestionListQuery): Promise<AdminQuestionListResult>;
  create(source: QuestionBankSourceDefinition, payload: Record<string, unknown>): Promise<Record<string, unknown>>;
  update(
    source: QuestionBankSourceDefinition,
    id: string,
    payload: Record<string, unknown>,
    subjectScope?: QuestionBankSubjectScope | null,
  ): Promise<Record<string, unknown>>;
  remove(
    source: QuestionBankSourceDefinition,
    id: string,
    subjectScope?: QuestionBankSubjectScope | null,
  ): Promise<Record<string, unknown>>;
  insertMany(
    source: QuestionBankSourceDefinition,
    payloads: Record<string, unknown>[],
  ): Promise<Record<string, unknown>[]>;
}

interface BackendErrorRecord {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

function backendErrorRecord(error: unknown): BackendErrorRecord {
  if (error !== null && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    return {
      code: typeof record.code === 'string' ? record.code : undefined,
      message: typeof record.message === 'string' ? record.message : undefined,
      details: typeof record.details === 'string' ? record.details : undefined,
      hint: typeof record.hint === 'string' ? record.hint : undefined,
    };
  }
  return {};
}

function backendMessage(error: unknown): string {
  const record = backendErrorRecord(error);
  const message = record.message || errorMessage(error);
  return message.replace(/\s+/g, ' ').trim().slice(0, 500);
}

function isMissingTable(error: unknown): boolean {
  const record = backendErrorRecord(error);
  return record.code === 'PGRST205'
    || record.code === '42P01'
    || /could not find the table|schema cache|relation .* does not exist|table .* not found/i.test(record.message ?? '');
}

function isPermissionDenied(error: unknown): boolean {
  const record = backendErrorRecord(error);
  return record.code === '42501'
    || record.code === '401'
    || record.code === '403'
    || /permission denied|row-level security|insufficient privilege/i.test(record.message ?? '');
}

function failureState(error: unknown): Exclude<QuestionBankAdminStatusState, 'connected' | 'empty'> {
  if (isMissingTable(error)) return 'missing-table';
  if (isPermissionDenied(error)) return 'permission-denied';
  return 'unavailable';
}

function statusDetail(source: QuestionBankSourceDefinition, error: unknown): string {
  const state = failureState(error);
  const backend = backendMessage(error);
  if (state === 'missing-table') {
    return `${source.label} is connected, but the registered table ${source.table} is missing or not exposed through the Data API. Apply the reviewed SQL for this project. Backend: ${backend}`;
  }
  if (state === 'permission-denied') {
    return `The database rejected the admin count for ${source.table}. Check the server service-role key and table grants. Backend: ${backend}`;
  }
  return `The admin count for ${source.table} failed. Check the project URL, server key, and table schema. Backend: ${backend}`;
}

function remoteFailure(source: QuestionBankSourceDefinition, error: unknown): AdminApiError {
  if (error instanceof AdminApiError) return error;
  const record = backendErrorRecord(error);
  const backend = backendMessage(error);

  if (isMissingTable(error)) {
    return new AdminApiError(
      502,
      `${source.label}: the registered table ${source.table} is missing or unavailable. ${backend}`,
      'missing_table',
    );
  }
  if (isPermissionDenied(error)) {
    return new AdminApiError(
      502,
      `${source.label}: the server-side service key was not permitted to modify ${source.table}. ${backend}`,
      'permission_denied',
    );
  }
  if (record.code === 'PGRST116') {
    return new AdminApiError(
      404,
      `${source.label} did not find a question with that ID in ${source.table}.`,
      'question_not_found',
    );
  }
  if (record.code === '23505') {
    return new AdminApiError(
      409,
      `${source.label} rejected the write because a unique value already exists. ${backend}`,
      'duplicate_value',
    );
  }
  if (record.code === '23514' || record.code === '23503') {
    return new AdminApiError(
      400,
      `${source.label} rejected the question because it violates the table's constraints. ${backend}`,
      'constraint_violation',
    );
  }
  if (record.code === '22P02' || record.code === '22001' || record.code === '22003') {
    return new AdminApiError(
      400,
      `${source.label} rejected a value that does not match the table column type. ${backend}`,
      'invalid_value',
    );
  }
  return new AdminApiError(
    502,
    `${source.label}: the database request failed. ${backend}`,
    'remote_error',
  );
}

export async function uploadRemoteQuestionImages(
  client: SupabaseClient,
  source: QuestionBankSourceDefinition,
  images: unknown[],
): Promise<unknown[]> {
  const bucket = client.storage.from('question-bank-images');
  const uploaded: unknown[] = [];
  for (const entry of images) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      uploaded.push(entry);
      continue;
    }
    const image = entry as Record<string, unknown>;
    const dataUri = typeof image.dataUri === 'string' ? image.dataUri.trim() : '';
    if (!dataUri) {
      uploaded.push(image);
      continue;
    }
    const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUri);
    if (!match) {
      throw new AdminApiError(400, `${source.label}: an embedded image has an invalid data URI.`, 'invalid_value');
    }
    const mimeType = match[1].toLowerCase();
    const base64 = match[2];
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length % 4 !== 0) {
      throw new AdminApiError(400, `${source.label}: an embedded image has an invalid data URI.`, 'invalid_value');
    }
    const bytes = Buffer.from(base64, 'base64');
    if (bytes.length === 0) {
      throw new AdminApiError(400, `${source.label}: an embedded image has an invalid data URI.`, 'invalid_value');
    }
    const safeId = String(image.id ?? 'image').replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 80) || 'image';
    const contentHash = createHash('sha256').update(bytes).digest('hex');
    const extension = mimeType.split('/')[1]?.replace(/[^a-z0-9]/g, '') || 'bin';
    const path = `${source.table}/${safeId}/${contentHash}.${extension}`;
    const { error } = await bucket.upload(path, new Uint8Array(bytes), {
      contentType: mimeType,
      upsert: true,
    });
    if (error) {
      throw new AdminApiError(
        502,
        `${source.label}: could not upload an embedded image to Storage. ${backendMessage(error)}`,
        'remote_error',
      );
    }
    const { data } = bucket.getPublicUrl(path);
    const { dataUri: _dataUri, ...persisted } = image;
    uploaded.push({
      ...persisted,
      src: data.publicUrl,
    });
  }
  return uploaded;
}

function sanitizeSearch(value: string): string {
  return value
    .replace(/[(),]/g, ' ')
    .replace(/[%_\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function registerBackendError(source: QuestionBankSourceDefinition, error: unknown): never {
  throw remoteFailure(source, error);
}

export class SupabaseQuestionBankRepository implements AdminQuestionRepository {
  private readonly configurations: Record<QuestionBankSourceId, RemoteProjectServerConfig>;
  private readonly clients = new Map<QuestionBankSourceId, SupabaseClient>();

  constructor(environment: ServerEnvironment = process.env) {
    this.configurations = getConfiguredRemoteProjects(environment);
  }

  private clientFor(source: QuestionBankSourceDefinition): SupabaseClient {
    const existing = this.clients.get(source.id);
    if (existing) return existing;

    const configuration = this.configurations[source.id];
    if (!configuration || configuration.error || !configuration.url || !configuration.serviceRoleKey) {
      throw new AdminApiError(
        503,
        configuration?.error
          ?? `${source.label} admin access is not configured in the server environment.`,
        'source_not_configured',
      );
    }

    const client = createClient(configuration.url, configuration.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    this.clients.set(source.id, client);
    return client;
  }

  async status(source: QuestionBankSourceDefinition): Promise<SourceBackendStatus> {
    const configuration = this.configurations[source.id];
    if (!configuration || configuration.error) {
      return {
        state: 'invalid-configuration',
        count: null,
        detail: configuration?.error
          ?? `${source.label} admin access is not configured in the server environment.`,
      };
    }

    try {
      const { count, error } = await this.clientFor(source)
        .from(source.table)
        .select('*', { count: 'exact', head: true });
      if (error) throw error;
      if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
        return {
          state: 'unavailable',
          count: null,
          detail: `${source.label} did not return a valid exact question count.`,
        };
      }
      return count === 0
        ? {
            state: 'empty',
            count: 0,
            detail: `${source.label} is connected. The table is registered and currently contains zero rows.`,
          }
        : {
            state: 'connected',
            count,
            detail: `${source.label} is connected. Exact row count verified through the trusted admin API.`,
          };
    } catch (error) {
      return {
        state: failureState(error),
        count: null,
        detail: statusDetail(source, error),
      };
    }
  }

  async list(
    source: QuestionBankSourceDefinition,
    query: NormalizedQuestionListQuery,
  ): Promise<AdminQuestionListResult> {
    let request = this.clientFor(source)
      .from(source.table)
      .select('*', { count: 'exact' });

    if (query.subject && source.subjectField) {
      request = request.eq(source.subjectField, query.subject);
    }
    if (query.chapter) request = request.eq('chapter', query.chapter);
    if (query.topic) request = request.eq('topic', query.topic);
    if (query.section) request = request.eq('section', query.section);
    if (query.exercise) request = request.eq('exercise', query.exercise);
    if (query.difficulty) request = request.eq('difficulty', query.difficulty);
    if (query.sourcePdf) request = request.eq('source_pdf', query.sourcePdf);

    if (query.language === 'with-hindi') {
      request = request.not('question_hi', 'is', null).neq('question_hi', '');
    } else if (query.language === 'without-hindi') {
      request = request.or('question_hi.is.null,question_hi.eq.');
    }

    if (query.answer === 'present') {
      request = request.not('answer_key', 'is', null).neq('answer_key', '');
    } else if (query.answer === 'missing') {
      request = request.or('answer_key.is.null,answer_key.eq.');
    }

    const search = sanitizeSearch(query.search);
    if (search) {
      request = request.or(
        `question_en.ilike.%${search}%,question_hi.ilike.%${search}%,question_code.ilike.%${search}%`,
      );
    }

    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;
    const { data, error, count } = await request
      .order('id', { ascending: true })
      .range(from, to);
    if (error) registerBackendError(source, error);
    if (!Array.isArray(data) || typeof count !== 'number') {
      throw new AdminApiError(
        502,
        `${source.label} returned an invalid question list response.`,
        'invalid_remote_response',
      );
    }
    return {
      rows: data as Record<string, unknown>[],
      count,
    };
  }

  async create(
    source: QuestionBankSourceDefinition,
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const payloadToWrite = { ...payload };
    if (Array.isArray(payloadToWrite.images)) {
      payloadToWrite.images = await uploadRemoteQuestionImages(
        this.clientFor(source),
        source,
        payloadToWrite.images,
      );
    }
    const { data, error } = await this.clientFor(source)
      .from(source.table)
      .insert(payloadToWrite)
      .select('*')
      .single();
    if (error) registerBackendError(source, error);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new AdminApiError(
        502,
        `${source.label} did not return the created question.`,
        'invalid_remote_response',
      );
    }
    return data as Record<string, unknown>;
  }

  async update(
    source: QuestionBankSourceDefinition,
    id: string,
    payload: Record<string, unknown>,
    subjectScope: QuestionBankSubjectScope | null = null,
  ): Promise<Record<string, unknown>> {
    const payloadToWrite = { ...payload };
    if (Array.isArray(payloadToWrite.images)) {
      payloadToWrite.images = await uploadRemoteQuestionImages(
        this.clientFor(source),
        source,
        payloadToWrite.images,
      );
    }
    let request = this.clientFor(source)
      .from(source.table)
      .update(payloadToWrite)
      .eq('id', id);
    if (subjectScope) request = request.eq(subjectScope.field, subjectScope.value);
    const { data, error } = await request.select('*').single();
    if (error) registerBackendError(source, error);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new AdminApiError(
        404,
        `${source.label} did not find a question with that ID in ${source.table}.`,
        'question_not_found',
      );
    }
    return data as Record<string, unknown>;
  }

  async remove(
    source: QuestionBankSourceDefinition,
    id: string,
    subjectScope: QuestionBankSubjectScope | null = null,
  ): Promise<Record<string, unknown>> {
    let request = this.clientFor(source)
      .from(source.table)
      .delete()
      .eq('id', id);
    if (subjectScope) request = request.eq(subjectScope.field, subjectScope.value);
    const { data, error } = await request.select('*').single();
    if (error) registerBackendError(source, error);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new AdminApiError(
        404,
        `${source.label} did not find a question with that ID in ${source.table}.`,
        'question_not_found',
      );
    }
    return data as Record<string, unknown>;
  }

  async insertMany(
    source: QuestionBankSourceDefinition,
    payloads: Record<string, unknown>[],
  ): Promise<Record<string, unknown>[]> {
    const payloadsToWrite = await Promise.all(payloads.map(async (payload) => {
      const payloadToWrite = { ...payload };
      if (Array.isArray(payloadToWrite.images)) {
        payloadToWrite.images = await uploadRemoteQuestionImages(
          this.clientFor(source),
          source,
          payloadToWrite.images,
        );
      }
      return payloadToWrite;
    }));
    const { data, error } = await this.clientFor(source)
      .from(source.table)
      .insert(payloadsToWrite)
      .select('*');
    if (error) registerBackendError(source, error);
    if (!Array.isArray(data)) {
      throw new AdminApiError(
        502,
        `${source.label} did not return the imported questions.`,
        'invalid_remote_response',
      );
    }
    return data as Record<string, unknown>[];
  }
}
