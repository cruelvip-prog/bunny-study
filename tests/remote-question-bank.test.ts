import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fetchRemoteQuestionsWithReader,
  getRemoteSourceConfiguration,
  getRemoteSourceSubjects,
  getRemoteSourceTable,
  mapRemoteQuestionRow,
  REMOTE_QUESTION_SOURCES,
  type RemoteQuestionReader,
  type RemoteQuestionSource,
} from '../src/utils/remoteQuestionBank';
import { readBookmarks, saveBookmarks } from '../src/utils/studyToolsStorage';
import { setActiveAccountOwnerId } from '../src/utils/accountStorage';
import { createCustomTestQuestions, filterCustomTestQuestions, getBuilderTopicKey, getUniqueBuilderQuestions } from '../src/utils/customTestBuilder';

function row(id: number | string, subject = 'Physics') {
  return {
    id,
    question_code: `Q-${id}`,
    subject,
    subject_area: subject,
    question_en: `Question ${id}`,
    question_hi: `प्रश्न ${id}`,
    options: {
      A: { text_en: 'A', text_hi: 'अ' },
      B: { text_en: 'B', text_hi: 'ब' },
      C: { text_en: 'C', text_hi: 'स' },
      D: { text_en: 'D', text_hi: 'द' },
    },
    answer_key: 'b',
    answer_key_source: 'Checked source',
    explanation_en: 'English explanation',
    explanation_hi: 'हिन्दी व्याख्या',
    chapter: 'Mechanics',
    topic: 'Motion',
    section: 'Kinematics',
    exercise: 'Practice',
    difficulty: 'medium',
    source_pdf: 'sample.pdf',
    source_page: 12,
    tags: ['verified'],
    created_at: '2026-01-01T00:00:00Z',
    images: [{
      id: 'diagram',
      type: 'question',
      mimeType: 'image/png',
      src: 'https://example.test/diagram.png',
      alt: 'Diagram',
      caption: null,
    }],
  };
}

test('maps remote row fields, answers, options, images, metadata, and source-namespaced ids', () => {
  const physics = mapRemoteQuestionRow(row('42'), 'physics', 1);
  const archive = mapRemoteQuestionRow(row('42'), 'archive', 1);
  const chemistry = mapRemoteQuestionRow({
    ...row('4f9f2f8a-7d52-4f0e-8f25-2b77668f8b41', 'Chemistry'),
    subject: undefined,
    subject_area: undefined,
  }, 'chemistry', 1);

  assert.equal(physics.id, 'remote:physics:physics_questions:42');
  assert.equal(archive.id, 'remote:archive:question_bank_archive:42');
  assert.equal(chemistry.id, 'remote:chemistry:chemistry_questions:4f9f2f8a-7d52-4f0e-8f25-2b77668f8b41');
  assert.notEqual(physics.id, archive.id);
  assert.equal(chemistry.subject, 'Chemistry');
  assert.equal(chemistry.questionEn, 'Question 4f9f2f8a-7d52-4f0e-8f25-2b77668f8b41');
  assert.equal(chemistry.options.D.textEn, 'D');
  assert.equal(physics.subject, 'Physics');
  assert.equal(physics.questionEn, 'Question 42');
  assert.equal(physics.questionHi, 'प्रश्न 42');
  assert.equal(physics.options.B.textEn, 'B');
  assert.equal(physics.options.B.textHi, 'ब');
  assert.equal(physics.answerKey, 'B');
  assert.equal(physics.answerKeySource, 'Checked source');
  assert.equal(physics.explanationEn, 'English explanation');
  assert.equal(physics.explanationHi, 'हिन्दी व्याख्या');
  assert.equal(physics.topic, 'Mechanics');
  assert.equal(physics.topicName, 'Motion');
  assert.equal(physics.sourcePage, 12);
  assert.equal(physics.images?.[0].src, 'https://example.test/diagram.png');
  assert.deepEqual(physics.schemaV2?.tags, ['verified']);
});

test('maps biology subject_area and preserves Hindi-only questions with ordered options', () => {
  const biologyRow = {
    ...row('bio-1', 'Botany'),
    question_en: '',
    question_hi: 'हिन्दी प्रश्न',
    options: ['A', 'B', 'C', 'D'],
  };
  const question = mapRemoteQuestionRow(biologyRow, 'biology', 7);

  assert.equal(question.subject, 'Botany');
  assert.equal(question.id, 'remote:biology:biology_questions:bio-1');
  assert.equal(question.originalQuestionNumber, 7);
  assert.equal(question.questionEn, '');
  assert.equal(question.questionHi, 'हिन्दी प्रश्न');
  assert.equal(question.options.D.textEn, 'D');
});

test('reports incompatible remote rows instead of silently dropping required content', () => {
  assert.throws(
    () => mapRemoteQuestionRow({ ...row(3), options: { A: 'only one' } }, 'physics'),
    /exactly A, B, C, and D/,
  );
  assert.throws(
    () => mapRemoteQuestionRow({ ...row(4), answer_key: 'E' }, 'physics'),
    /invalid answer_key/,
  );
  assert.throws(
    () => mapRemoteQuestionRow({ ...row(5), subject_area: 'Chemistry' }, 'biology'),
    /unsupported subject_area value/,
  );
  assert.throws(
    () => mapRemoteQuestionRow({ ...row(6), images: { question: 'diagram' } }, 'physics'),
    /unsupported image metadata/,
  );
});

test('validates optional project configuration without exposing or requiring unrelated credentials', () => {
  const empty = getRemoteSourceConfiguration('physics', {});
  assert.ok('error' in empty);
  assert.match('error' in empty ? empty.error : '', /VITE_SUPABASE_PHYSICS_URL/);

  const invalid = getRemoteSourceConfiguration('biology', {
    VITE_SUPABASE_BIOLOGY_URL: 'not a URL',
    VITE_SUPABASE_BIOLOGY_PUBLISHABLE_KEY: 'publishable',
  });
  assert.ok('error' in invalid);
  assert.match('error' in invalid ? invalid.error : '', /invalid project URL/);

  const valid = getRemoteSourceConfiguration('general', {
    VITE_SUPABASE_GENERAL_URL: 'https://general.example.test/',
    VITE_SUPABASE_GENERAL_PUBLISHABLE_KEY: 'publishable-key',
  });
  assert.deepEqual(valid, {
    url: 'https://general.example.test',
    publishableKey: 'publishable-key',
  });
  const chemistry = getRemoteSourceConfiguration('chemistry', {
    VITE_SUPABASE_CHEMISTRY_URL: 'https://chemistry.example.test/',
    VITE_SUPABASE_CHEMISTRY_PUBLISHABLE_KEY: 'chemistry-publishable-key',
  });
  assert.deepEqual(chemistry, {
    url: 'https://chemistry.example.test',
    publishableKey: 'chemistry-publishable-key',
  });
  assert.equal(getRemoteSourceTable('archive'), 'question_bank_archive');
  assert.equal(getRemoteSourceTable('chemistry'), 'chemistry_questions');
  assert.deepEqual(getRemoteSourceSubjects('chemistry'), ['Chemistry']);
});

test('filters by source subject and paginates without loading beyond the requested count', async () => {
  const ranges: Array<[number, number]> = [];
  let seenFilters: unknown;
  const reader: RemoteQuestionReader = {
    async readPage(source, filters, from, to) {
      assert.equal(source, 'general');
      seenFilters = filters;
      ranges.push([from, to]);
      return Array.from({ length: Math.min(to - from + 1, 205 - from) }, (_, index) =>
        row(from + index + 1, 'Botany'));
    },
  };

  const questions = await fetchRemoteQuestionsWithReader(reader, 'general', {
    subject: 'Botany',
    chapter: 'Plants',
    topic: 'Roots',
    limit: 205,
  });

  assert.equal(questions.length, 205);
  assert.deepEqual(ranges, [[0, 99], [100, 199], [200, 204]]);
  assert.deepEqual(seenFilters, {
    subject: 'Botany',
    chapter: 'Plants',
    topic: 'Roots',
    limit: 205,
  });
  assert.ok(questions.every((question) => question.subject === 'Botany'));
});

test('caps remote requests and rejects subject filters unsupported by a source', async () => {
  const reader: RemoteQuestionReader = { readPage: async () => [] };
  await assert.rejects(
    fetchRemoteQuestionsWithReader(reader, 'physics', { subject: 'Chemistry', limit: 1 }),
    /Physics project contains Physics/,
  );
  await assert.rejects(
    fetchRemoteQuestionsWithReader(reader, 'chemistry', { subject: 'Physics', limit: 1 }),
    /OINKIE Chemistry Bank contains Chemistry/,
  );
  await assert.rejects(
    fetchRemoteQuestionsWithReader(reader, 'general', { subject: 'Physics', limit: 301 }),
    /between 1 and 300/,
  );
});

test('loads chemistry rows with forced Chemistry subject and UUID-safe source ids', async () => {
  const uuid = '8e32ab62-9f1e-4f4d-a854-39c92e520cf7';
  let seenSource: RemoteQuestionSource | null = null;
  let seenFilters: unknown;
  const reader: RemoteQuestionReader = {
    async readPage(source, filters) {
      seenSource = source;
      seenFilters = filters;
      return [{
        ...row(uuid, 'Physics'),
        subject: undefined,
        subject_area: undefined,
        answer_key: 'c',
      }];
    },
  };

  const questions = await fetchRemoteQuestionsWithReader(reader, 'chemistry', {
    subject: 'Chemistry',
    chapter: 'Atomic Structure',
    limit: 25,
  });

  assert.equal(seenSource, 'chemistry');
  assert.deepEqual(seenFilters, {
    subject: 'Chemistry',
    chapter: 'Atomic Structure',
    topic: undefined,
    limit: 25,
  });
  assert.equal(questions.length, 1);
  assert.equal(questions[0].id, `remote:chemistry:chemistry_questions:${uuid}`);
  assert.equal(questions[0].subject, 'Chemistry');
  assert.equal(questions[0].answerKey, 'C');
  assert.equal(questions[0].schemaV2?.sourceProject, 'chemistry');
  assert.equal(questions[0].schemaV2?.sourceTable, 'chemistry_questions');
});

test('remote request failures leave local bookmarks available and unchanged', async () => {
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
  setActiveAccountOwnerId(null);
  const bookmark = {
    id: 'Physics:q1',
    savedAt: 1,
    question: mapRemoteQuestionRow(row('local-q'), 'physics'),
  };
  try {
    saveBookmarks([bookmark]);
    const before = values.get('oinkie_prep_bookmarks_v1');
    const reader: RemoteQuestionReader = {
      readPage: async () => { throw new Error('network offline'); },
    };
    await assert.rejects(
      fetchRemoteQuestionsWithReader(reader, 'physics', { subject: 'Physics', limit: 1 }),
      /Physics project questions: network offline/,
    );
    assert.deepEqual(readBookmarks().items, [bookmark]);
    assert.equal(values.get('oinkie_prep_bookmarks_v1'), before);
  } finally {
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
    setActiveAccountOwnerId(null);
  }
});

test('short remote pages return normally and rows receive deterministic source-specific ids', async () => {
  const ids = REMOTE_QUESTION_SOURCES.map((source) => mapRemoteQuestionRow(
    row('same-id', source === 'biology' ? 'Botany' : source === 'chemistry' ? 'Chemistry' : 'Physics'),
    source,
  ).id);
  assert.equal(new Set(ids).size, REMOTE_QUESTION_SOURCES.length);
  assert.ok(ids.includes('remote:chemistry:chemistry_questions:same-id'));

  let calls = 0;
  const reader: RemoteQuestionReader = {
    async readPage() {
      calls++;
      return [row('one')];
    },
  };
  const questions = await fetchRemoteQuestionsWithReader(reader, 'physics', {
    subject: 'Physics',
    limit: 300,
  });
  assert.equal(questions.length, 1);
  assert.equal(calls, 1);
});

test('remote banks deduplicate only by stable IDs, preserving distinct matching records', () => {
  const first = mapRemoteQuestionRow(row('first'), 'general');
  const second = { ...first, id: 'remote:general:question_bank:second' };
  assert.equal(getUniqueBuilderQuestions([first, second]).length, 1);
  assert.equal(getUniqueBuilderQuestions([first, second], 'id').length, 2);
  assert.equal(createCustomTestQuestions([first, second], {
    subjects: ['Physics'],
    classLevel: 'All',
    selectedTopicKeys: null,
    deduplicateById: true,
  }, 2).length, 2);
});

test('maps pyq rows with subject metadata and UUID-safe source ids', async () => {
  const uuid = '8e32ab62-9f1e-4f4d-a854-39c92e520cf7';
  const reader: RemoteQuestionReader = {
    async readPage(source, filters) {
      assert.equal(source, 'pyq');
      assert.equal(filters.subject, 'Physics');
      return [{
        id: uuid,
        question_code: 'PYQ-2024-001',
        subject: 'Physics',
        chapter: 'Motion',
        topic: 'Kinematics',
        question_en: 'PYQ question',
        question_hi: '????????? ??????',
        options: {
          A: { text_en: 'A', text_hi: '?' },
          B: { text_en: 'B', text_hi: '?' },
          C: { text_en: 'C', text_hi: '?' },
          D: { text_en: 'D', text_hi: '?' },
        },
        answer_key: 'A',
        exam_name: 'NEET UG',
        exam_year: 2024,
        paper_session: 'Phase 1',
        paper_title: 'NEET UG 2024',
        verification_status: 'verified',
      }];
    },
  };

  const questions = await fetchRemoteQuestionsWithReader(reader, 'pyq', {
    subject: 'Physics',
    chapter: 'Motion',
    limit: 5,
  });

  assert.equal(questions.length, 1);
  assert.equal(questions[0].id, `remote:pyq:pyq_questions:${uuid}`);
  assert.equal(questions[0].subject, 'Physics');
  assert.equal(questions[0].schemaV2?.examName, 'NEET UG');
  assert.equal(questions[0].schemaV2?.examYear, 2024);
});

test('pyq custom-test filtering keeps selected topics and reports insufficient counts', () => {
  const first = mapRemoteQuestionRow({
    id: '11111111-2222-4333-8444-555555555555',
    subject: 'Physics',
    chapter: 'Motion',
    topic: 'Kinematics',
    question_en: 'First',
    options: { A: 'A', B: 'B', C: 'C', D: 'D' },
  }, 'pyq');
  const second = mapRemoteQuestionRow({
    id: '22222222-3333-4444-8555-666666666666',
    subject: 'Physics',
    chapter: 'Motion',
    topic: 'Kinematics',
    question_en: 'Second',
    options: { A: 'A', B: 'B', C: 'C', D: 'D' },
  }, 'pyq');
  const other = mapRemoteQuestionRow({
    id: '33333333-4444-5555-8666-777777777777',
    subject: 'Physics',
    chapter: 'Thermodynamics',
    topic: 'Heat',
    question_en: 'Other',
    options: { A: 'A', B: 'B', C: 'C', D: 'D' },
  }, 'pyq');

  const questions = getUniqueBuilderQuestions([first, second, other], 'id');
  const selectedKey = getBuilderTopicKey(first);
  const eligible = filterCustomTestQuestions(questions, {
    subjects: ['Physics'],
    classLevel: 'All',
    selectedTopicKeys: [selectedKey],
    deduplicateById: true,
  });

  assert.equal(eligible.length, 2);
  assert.throws(
    () => createCustomTestQuestions(eligible, {
      subjects: ['Physics'],
      classLevel: 'All',
      selectedTopicKeys: [selectedKey],
      deduplicateById: true,
    }, 3),
    /Only 2 unique eligible question/,
  );

  const selected = createCustomTestQuestions(eligible, {
    subjects: ['Physics'],
    classLevel: 'All',
    selectedTopicKeys: [selectedKey],
    deduplicateById: true,
  }, 2);
  assert.equal(selected.length, 2);
  assert.equal(new Set(selected.map((question) => question.id)).size, 2);
});
