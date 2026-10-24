import assert from 'node:assert/strict';
import test from 'node:test';
import { extractQuestionBankImport } from '../src/questionBanks/importQuestions';
import { normalizeQuestionInput } from '../src/questionBanks/questionInput';

const legacyQuestion = {
  id: 'legacy-1',
  question_number: 1,
  chapter: 'Mechanics',
  topic: 'Motion',
  section: 'Kinematics',
  exercise: 'Practice',
  question_en: 'A body moves uniformly.',
  question_hi: null,
  source_page: 3,
  options: {
    A: { text_en: 'A', text_hi: null },
    B: { text_en: 'B', text_hi: null },
    C: { text_en: 'C', text_hi: null },
    D: { text_en: 'D', text_hi: null },
  },
  answer_key: 'A',
  answer_key_source: 'Official key',
  tags: ['mechanics'],
};

test('import extraction accepts arrays, question objects, and legacy bank exports', () => {
  const array = extractQuestionBankImport([legacyQuestion]);
  assert.equal(array.ok, true);
  if (array.ok) {
    assert.equal(array.value.questions.length, 1);
    assert.equal(array.value.format, 'array');
  }

  const object = extractQuestionBankImport({ questions: [legacyQuestion] });
  assert.equal(object.ok, true);
  if (object.ok) {
    assert.equal(object.value.format, 'questions-object');
  }

  const legacy = extractQuestionBankImport({
    schema_version: '1.0',
    source_pdf: { file_name: 'physics-source.pdf', subject: 'Physics', total_pages: 20 },
    questions: [legacyQuestion],
  });
  assert.equal(legacy.ok, true);
  if (legacy.ok) {
    assert.equal(legacy.value.format, 'legacy-bank');
    assert.match(legacy.value.warnings.join(' '), /local question-bank export/i);
    assert.equal(
      (legacy.value.questions[0] as Record<string, unknown>).source_pdf,
      'physics-source.pdf',
    );
  }
});

test('import extraction rejects malformed files and reports empty lists', () => {
  assert.equal(extractQuestionBankImport({}).ok, false);
  assert.equal(extractQuestionBankImport({ questions: [] }).ok, false);
  assert.equal(extractQuestionBankImport('not json').ok, false);
  assert.equal(extractQuestionBankImport(null).ok, false);
});

test('import preview normalization reports valid and invalid records without writing', () => {
  const extracted = extractQuestionBankImport([
    legacyQuestion,
    { ...legacyQuestion, id: 'bad', options: { A: 'only one' } },
  ]);
  assert.equal(extracted.ok, true);
  if (!extracted.ok) return;

  const results = extracted.value.questions.map((question) =>
    normalizeQuestionInput(question, 'physics'));
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(results.filter((result) => !result.ok).length, 1);
  const invalid = results.find((result) => !result.ok);
  assert.ok(invalid && !invalid.ok);
  assert.match(invalid.errors.join(' '), /exactly A, B, C, and D/);
});
