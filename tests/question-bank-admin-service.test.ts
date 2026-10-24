import assert from 'node:assert/strict';
import test from 'node:test';
import {
  QUESTION_BANK_SOURCES,
  requireQuestionBankSource,
  type QuestionBankSourceDefinition,
} from '../src/questionBanks/sourceRegistry';
import {
  createEmptyQuestionDraft,
  normalizeQuestionInput,
  type QuestionBankQuestionDraft,
} from '../src/questionBanks/questionInput';
import {
  QuestionBankAdminService,
} from '../server/questionBankService';
import type {
  AdminQuestionRepository,
  NormalizedQuestionListQuery,
  QuestionBankSubjectScope,
  SourceBackendStatus,
} from '../server/questionBankRepository';
import { AdminApiError } from '../server/errors';

function draftFor(
  sourceId: 'physics' | 'biology' | 'botany' | 'zoology' | 'chemistry' | 'general' | 'archive',
  overrides: Partial<QuestionBankQuestionDraft> = {},
): QuestionBankQuestionDraft {
  const source = requireQuestionBankSource(sourceId);
  const draft = createEmptyQuestionDraft(source.id);
  draft.chapter = 'Chapter 1';
  draft.question_en = 'What is the correct answer?';
  draft.question_hi = 'सही उत्तर क्या है?';
  draft.options = {
    A: { text_en: 'Option A', text_hi: 'विकल्प A' },
    B: { text_en: 'Option B', text_hi: 'विकल्प B' },
    C: { text_en: 'Option C', text_hi: 'विकल्प C' },
    D: { text_en: 'Option D', text_hi: 'विकल्प D' },
  };
  draft.answer_key = 'B';
  draft.question_code = `Q-${source.id}`;
  draft.subject = source.fixedSubject ?? source.subjects[0];
  draft.source_page = '7';
  draft.source_pdf = 'source.pdf';
  draft.tags = 'verified, source';
  return { ...draft, ...overrides };
}

function rowFor(source: QuestionBankSourceDefinition, id: string, payload: Record<string, unknown> = {}) {
  return {
    id,
    question_code: `Q-${source.id}`,
    chapter: 'Chapter 1',
    topic: 'Topic 1',
    question_en: `Question in ${source.label}`,
    question_hi: null,
    options: {
      A: { text_en: 'A', text_hi: null },
      B: { text_en: 'B', text_hi: null },
      C: { text_en: 'C', text_hi: null },
      D: { text_en: 'D', text_hi: null },
    },
    answer_key: 'A',
    ...(source.subjectField === 'subject_area' ? { subject_area: 'Botany' } : {}),
    ...(source.subjectField === 'subject' ? { subject: source.fixedSubject ?? 'Physics' } : {}),
    ...payload,
  };
}

interface FakeCalls {
  status: string[];
  list: Array<{ source: string; query: NormalizedQuestionListQuery }>;
  create: Array<{ source: string; payload: Record<string, unknown> }>;
  update: Array<{
    source: string;
    id: string;
    payload: Record<string, unknown>;
    scope?: QuestionBankSubjectScope | null;
  }>;
  remove: Array<{ source: string; id: string; scope?: QuestionBankSubjectScope | null }>;
  insertMany: Array<{ source: string; payloads: Record<string, unknown>[] }>;
}

function fakeRepository(overrides: Partial<AdminQuestionRepository> = {}) {
  const calls: FakeCalls = {
    status: [],
    list: [],
    create: [],
    update: [],
    remove: [],
    insertMany: [],
  };
  let counter = 0;
  const repository: AdminQuestionRepository = {
    async status(source) {
      calls.status.push(source.id);
      return { state: 'connected', count: 2, detail: 'connected' };
    },
    async list(source, query) {
      calls.list.push({ source: source.id, query });
      return { rows: [rowFor(source, 'row-1')], count: 1 };
    },
    async create(source, payload) {
      calls.create.push({ source: source.id, payload });
      counter += 1;
      return rowFor(source, `created-${counter}`, payload);
    },
    async update(source, id, payload, scope) {
      calls.update.push({ source: source.id, id, payload, scope });
      return rowFor(source, id, payload);
    },
    async remove(source, id, scope) {
      calls.remove.push({ source: source.id, id, scope });
      return rowFor(source, id);
    },
    async insertMany(source, payloads) {
      calls.insertMany.push({ source: source.id, payloads });
      counter += 1;
      return payloads.map((payload, index) => rowFor(source, `import-${counter}-${index}`, payload));
    },
    ...overrides,
  };
  return { repository, calls };
}

test('status service reports all five registered banks and never turns an error into zero', async () => {
  const { repository } = fakeRepository({
    async status(source) {
      if (source.id === 'physics') {
        return { state: 'empty', count: 0, detail: 'empty table' } satisfies SourceBackendStatus;
      }
      if (source.id === 'chemistry') {
        return {
          state: 'missing-table',
          count: null,
          detail: 'chemistry_questions is missing',
        } satisfies SourceBackendStatus;
      }
      if (source.id === 'general') {
        return {
          state: 'permission-denied',
          count: null,
          detail: 'service key was rejected',
        } satisfies SourceBackendStatus;
      }
      if (source.id === 'archive') {
        return {
          state: 'unavailable',
          count: null,
          detail: 'request failed',
        } satisfies SourceBackendStatus;
      }
      return { state: 'connected', count: 4, detail: 'connected' };
    },
  });
  const service = new QuestionBankAdminService(
    repository,
    () => new Date('2026-10-22T10:00:00.000Z'),
  );

  const statuses = await service.statuses();
  assert.equal(statuses.length, 8);
  assert.deepEqual(statuses.map((status) => status.source), QUESTION_BANK_SOURCES.map((source) => source.id));
  assert.equal(statuses.find((status) => status.source === 'physics')?.count, 0);
  assert.equal(statuses.find((status) => status.source === 'chemistry')?.count, null);
  assert.equal(statuses.find((status) => status.source === 'chemistry')?.state, 'missing-table');
  assert.equal(statuses.find((status) => status.source === 'general')?.state, 'permission-denied');
  assert.equal(statuses.find((status) => status.source === 'general')?.count, null);
  assert.equal(statuses.find((status) => status.source === 'archive')?.state, 'unavailable');
  assert.equal(statuses.find((status) => status.source === 'archive')?.count, null);
  assert.equal(statuses[0].lastCheckedAt, '2026-10-22T10:00:00.000Z');
  assert.equal(statuses.find((status) => status.source === 'chemistry')?.table, 'chemistry_questions');
});

test('list service validates pagination and routes only to the selected registered source', async () => {
  const { repository, calls } = fakeRepository();
  const service = new QuestionBankAdminService(repository);
  const result = await service.list('biology', {
    page: '2',
    pageSize: '10',
    search: 'photosynthesis',
    subject: 'Botany',
    chapter: 'Plant Physiology',
    language: 'with-hindi',
    answer: 'present',
  });

  assert.equal(result.source, 'biology');
  assert.equal(result.table, 'biology_questions');
  assert.equal(result.page, 2);
  assert.equal(result.pageSize, 10);
  assert.equal(calls.list.length, 1);
  assert.equal(calls.list[0].source, 'biology');
  assert.equal(calls.list[0].query.page, 2);
  assert.equal(calls.list[0].query.pageSize, 10);
  assert.equal(calls.list[0].query.search, 'photosynthesis');
  assert.equal(calls.list[0].query.subject, 'Botany');
  assert.equal(calls.list[0].query.chapter, 'Plant Physiology');

  await assert.rejects(
    service.list('biology', { page: '0' }),
    (error: unknown) => error instanceof AdminApiError && error.status === 400,
  );
  await assert.rejects(
    service.list('biology', { subject: 'Physics' }),
    (error: unknown) => error instanceof AdminApiError && /does not contain the subject Physics/.test(error.message),
  );
  await assert.rejects(
    service.list('unknown', {}),
    (error: unknown) => error instanceof AdminApiError && error.code === 'invalid_source',
  );
  assert.equal(calls.list.length, 1);
});

test('create, update, and delete use the registry plus the client destination-table check', async () => {
  const { repository, calls } = fakeRepository();
  const service = new QuestionBankAdminService(repository);

  const chemistry = await service.create(
    'chemistry',
    'chemistry_questions',
    draftFor('chemistry', { subject: 'Chemistry' }),
  );
  assert.equal(chemistry.source, 'chemistry');
  assert.equal(chemistry.table, 'chemistry_questions');
  assert.equal(calls.create.length, 1);
  assert.equal(calls.create[0].source, 'chemistry');
  assert.equal(calls.create[0].payload.subject, 'Chemistry');
  assert.equal('subject_area' in calls.create[0].payload, false);

  await assert.rejects(
    service.create('physics', 'chemistry_questions', draftFor('physics')),
    (error: unknown) => error instanceof AdminApiError && error.code === 'destination_table_mismatch',
  );
  assert.equal(calls.create.length, 1);

  await assert.rejects(
    service.create('general', '', draftFor('general')),
    (error: unknown) => error instanceof AdminApiError && error.code === 'destination_table_required',
  );
  assert.equal(calls.create.length, 1);

  await service.update(
    'chemistry',
    '4f9f2f8a-7d52-4f0e-8f25-2b77668f8b41',
    'chemistry_questions',
    draftFor('chemistry'),
  );
  assert.equal(calls.update.length, 1);
  assert.equal(calls.update[0].source, 'chemistry');
  assert.equal(calls.update[0].id, '4f9f2f8a-7d52-4f0e-8f25-2b77668f8b41');

  await assert.rejects(
    service.update('chemistry', 'not-a-uuid', 'chemistry_questions', draftFor('chemistry')),
    (error: unknown) => error instanceof AdminApiError && error.code === 'invalid_question_id',
  );
  assert.equal(calls.update.length, 1);

  const deleted = await service.remove('general', '42', 'question_bank');
  assert.equal(deleted.table, 'question_bank');
  assert.equal(calls.remove.length, 1);
  assert.equal(calls.remove[0].source, 'general');
  assert.equal(calls.remove[0].id, '42');

  await assert.rejects(
    service.remove('archive', '42', 'question_bank'),
    (error: unknown) => error instanceof AdminApiError && error.code === 'destination_table_mismatch',
  );
  assert.equal(calls.remove.length, 1);

  await assert.rejects(
    service.create('not-a-bank', 'physics_questions', draftFor('physics')),
    (error: unknown) => error instanceof AdminApiError && error.code === 'invalid_source',
  );
  assert.equal(calls.create.length, 1);
});

test('source-specific validation rejects wrong subjects, answers, options, and page values before writes', async () => {
  const { repository, calls } = fakeRepository();
  const service = new QuestionBankAdminService(repository);

  await assert.rejects(
    service.create('chemistry', 'chemistry_questions', draftFor('chemistry', { subject: 'Physics' })),
    (error: unknown) => error instanceof AdminApiError && error.issues?.some((issue) => /only accepts the subject Chemistry/.test(issue)),
  );
  assert.equal(calls.create.length, 0);

  await assert.rejects(
    service.create('general', 'question_bank', draftFor('general', { answer_key: 'E' })),
    (error: unknown) => error instanceof AdminApiError && error.issues?.some((issue) => /answer key must be A, B, C, D/.test(issue)),
  );

  await assert.rejects(
    service.create('physics', 'physics_questions', draftFor('physics', {
      options: {
        A: { text_en: 'Only A', text_hi: '' },
        B: { text_en: '', text_hi: '' },
        C: { text_en: '', text_hi: '' },
        D: { text_en: '', text_hi: '' },
      },
    })),
    (error: unknown) => error instanceof AdminApiError && error.issues?.some((issue) => /option B/.test(issue)),
  );

  await assert.rejects(
    service.create('physics', 'physics_questions', draftFor('physics', { source_page: '0' })),
    (error: unknown) => error instanceof AdminApiError && error.issues?.some((issue) => /source page must be/.test(issue)),
  );
  assert.equal(calls.create.length, 0);
});

test('admin sections route independent Botany and Zoology sources', async () => {
  const { repository, calls } = fakeRepository();
  const service = new QuestionBankAdminService(repository);

  const botany = await service.list('botany', { subject: 'Botany' }, 'botany');
  assert.equal(botany.source, 'botany');
  assert.equal(botany.table, 'botany_questions');
  assert.equal(calls.list.length, 1);
  assert.equal(calls.list[0].source, 'botany');

  const zoology = await service.list('zoology', {}, 'zoology');
  assert.equal(zoology.source, 'zoology');
  assert.equal(zoology.table, 'zoology_questions');

  const created = await service.create('botany', 'botany_questions', draftFor('botany'), 'botany');
  assert.equal(created.source, 'botany');
  assert.equal(created.table, 'botany_questions');
  assert.equal(calls.create.length, 1);
  assert.equal('subject' in calls.create[0].payload, false);
  assert.equal('subject_area' in calls.create[0].payload, false);

  const chemistry = await service.create(
    'chemistry',
    'chemistry_questions',
    draftFor('chemistry', { subject: 'Chemistry' }),
    'chemistry',
  );
  assert.equal(chemistry.table, 'chemistry_questions');
  assert.equal(calls.create[1].payload.subject, 'Chemistry');

  await assert.rejects(
    service.create('botany', 'botany_questions', draftFor('botany'), 'zoology'),
    (error) => error instanceof AdminApiError && error.code === 'section_source_mismatch',
  );
  assert.equal(calls.create.length, 2);

  await assert.rejects(
    service.create('biology', 'biology_questions', draftFor('biology'), 'botany'),
    (error) => error instanceof AdminApiError && error.code === 'section_source_mismatch',
  );
  assert.equal(calls.create.length, 2);

  await assert.rejects(
    service.create('archive', 'question_bank_archive', draftFor('archive'), 'pyqs'),
    (error) => error instanceof AdminApiError && error.code === 'section_source_mismatch',
  );
  assert.equal(calls.create.length, 2);

  await assert.rejects(
    service.list('botany', {}, 'general'),
    (error) => error instanceof AdminApiError && error.code === 'invalid_section',
  );

  const id = '11111111-2222-4333-8444-555555555555';
  await service.update(
    'botany',
    id,
    'botany_questions',
    draftFor('botany'),
    'botany',
  );
  assert.equal(calls.update.length, 1);
  assert.equal(calls.update[0].scope, null);

  await assert.rejects(
    service.update(
      'botany',
      id,
      'botany_questions',
      draftFor('botany'),
      'zoology',
    ),
    (error: unknown) => error instanceof AdminApiError && error.code === 'section_source_mismatch',
  );
  assert.equal(calls.update.length, 1);

  await service.remove('botany', id, 'botany_questions', 'botany');
  assert.equal(calls.remove.length, 1);
  assert.equal(calls.remove[0].scope, null);

  const importRepository = fakeRepository();
  const importService = new QuestionBankAdminService(importRepository.repository);
  const imported = await importService.import(
    'botany',
    'botany_questions',
    [draftFor('botany')],
    'botany',
  );
  assert.equal(imported.inserted.length, 1);
  assert.equal(importRepository.calls.insertMany.length, 1);
  assert.equal('subject' in importRepository.calls.insertMany[0].payloads[0], false);

  await assert.rejects(
    importService.import(
      'biology',
      'biology_questions',
      [draftFor('biology', { subject: 'Botany' })],
      'zoology',
    ),
    (error: unknown) => error instanceof AdminApiError && error.code === 'section_source_mismatch',
  );
  assert.equal(importRepository.calls.insertMany.length, 1);
});

test('import validates the complete payload first, batches inserts, and reports partial row failures', async () => {
  const insertCalls: number[] = [];
  let importedCreateCount = 0;
  const failingRepository: AdminQuestionRepository = {
    async status(source) {
      return { state: 'connected', count: 0, detail: source.label };
    },
    async list() {
      return { rows: [], count: 0 };
    },
    async create(source, payload) {
      importedCreateCount += 1;
      if (importedCreateCount === 3) throw new Error('simulated row constraint failure');
      return rowFor(source, `fallback-${importedCreateCount}`, payload);
    },
    async update() {
      throw new Error('not used');
    },
    async remove() {
      throw new Error('not used');
    },
    async insertMany(source, payloads) {
      insertCalls.push(payloads.length);
      if (insertCalls.length === 1) throw new Error('simulated batch collision');
      return payloads.map((payload, index) => rowFor(source, `batch-${insertCalls.length}-${index}`, payload));
    },
  };
  const service = new QuestionBankAdminService(failingRepository);
  const questions = Array.from({ length: 30 }, (_, index) =>
    draftFor('general', { question_code: `IMPORT-${index + 1}` }));

  const result = await service.import('general', 'question_bank', questions);
  assert.equal(result.source, 'general');
  assert.equal(result.table, 'question_bank');
  assert.equal(result.inserted.length, 29);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].index, 2);
  assert.deepEqual(insertCalls, [25, 5]);
  assert.equal(importedCreateCount, 25);

  const noWritesRepository = fakeRepository();
  const noWritesService = new QuestionBankAdminService(noWritesRepository.repository);
  await assert.rejects(
    noWritesService.import('general', 'question_bank', [
      draftFor('general'),
      draftFor('general', { chapter: '' }),
    ]),
    (error: unknown) => error instanceof AdminApiError && error.code === 'validation_failed',
  );
  assert.equal(noWritesRepository.calls.insertMany.length, 0);
  assert.equal(noWritesRepository.calls.create.length, 0);
});

test('normalizer writes only the subject column declared for each bank', () => {
  const physics = normalizeQuestionInput(draftFor('physics'), 'physics');
  assert.equal(physics.ok, true);
  if (physics.ok) {
    assert.equal('subject' in physics.payload, false);
    assert.equal('subject_area' in physics.payload, false);
  }

  const biology = normalizeQuestionInput(draftFor('biology'), 'biology');
  assert.equal(biology.ok, true);
  if (biology.ok) {
    assert.equal(biology.payload.subject_area, 'Botany');
    assert.equal('subject' in biology.payload, false);
  }

  const chemistry = normalizeQuestionInput(draftFor('chemistry'), 'chemistry');
  assert.equal(chemistry.ok, true);
  if (chemistry.ok) {
    assert.equal(chemistry.payload.subject, 'Chemistry');
    assert.deepEqual(chemistry.payload.tags, ['verified', 'source']);
    assert.equal(chemistry.payload.source_page, 7);
  }

  const general = normalizeQuestionInput(
    draftFor('general', { subject: 'Chemistry' }),
    'general',
  );
  assert.equal(general.ok, true);
  if (general.ok) assert.equal(general.payload.subject, 'Chemistry');

  const archive = normalizeQuestionInput(
    draftFor('archive', { subject: 'Zoology' }),
    'archive',
  );
  assert.equal(archive.ok, true);
  if (archive.ok) assert.equal(archive.payload.subject, 'Zoology');
});
