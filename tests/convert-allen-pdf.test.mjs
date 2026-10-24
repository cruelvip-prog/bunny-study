import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  isReusableCheckpoint,
  parseResult,
  publishStagedFile,
  readCheckpoint,
  validateQuestionBank,
  writeJsonOutputsWithoutOverwrite,
  writeJsonWithoutOverwrite,
} from '../convert-allen-pdf.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');

function extractionQuestion() {
  return {
    question_code: 'KN0001',
    question_number: 1,
    question_en: 'Evaluate √2 + 2⁻¹.',
    question_hi: null,
    options: ['A', 'B', 'C', 'D'].map((label) => ({
      label,
      text_en: `${label} option`,
      text_hi: null,
    })),
    answer: null,
    explanation_en: null,
    explanation_hi: null,
    visual_required: false,
    review_flags: [],
  };
}

test('validates the actual sample question-bank structure', () => {
  const bankPath = path.join(projectRoot, 'sample_output', 'sample_physics_bank.json');
  const bank = JSON.parse(fs.readFileSync(bankPath, 'utf8'));
  const validation = validateQuestionBank(bank);

  assert.equal(bank.questions.length, 9);
  assert.equal(validation.valid, true, validation.errors.join('\n'));
  assert.equal(validation.errors.length, 0);
});

test('rejects duplicate IDs and malformed answer/options in a bank', () => {
  const bank = JSON.parse(
    fs.readFileSync(path.join(projectRoot, 'sample_output', 'sample_physics_bank.json'), 'utf8')
  );
  bank.questions[1].id = bank.questions[0].id;
  bank.questions[1].answer_key = 'E';
  bank.questions[1].source_page = bank.source_pdf.total_pages + 1;
  delete bank.questions[1].options.D;

  const validation = validateQuestionBank(bank);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.includes('duplicates')));
  assert.ok(validation.errors.some((error) => error.includes('answer_key')));
  assert.ok(validation.errors.some((error) => error.includes('options must contain exactly')));
  assert.ok(validation.errors.some((error) => error.includes('exceeds source_pdf.total_pages')));
});

test('validates extraction responses without rewriting mathematical notation', () => {
  const question = extractionQuestion();
  const parsed = parseResult(JSON.stringify({ questions: [question], page_notes: [] }), 42);

  assert.equal(parsed.questions[0].question_en, 'Evaluate √2 + 2⁻¹.');
  assert.equal(parsed.questions[0].source_page_pdf, 42);
  assert.equal(parsed.questions[0].needs_review, true);
  assert.ok(parsed.questions[0].review_flags.includes('source_comparison_required'));
});

test('rejects malformed model JSON and incomplete option sets', () => {
  assert.throws(() => parseResult('{not json', 1), /not valid JSON/);
  const question = extractionQuestion();
  question.options.pop();
  assert.throws(
    () => parseResult(JSON.stringify({ questions: [question] }), 1),
    /exactly four labeled options/
  );
});

test('reads the persisted JSONL checkpoint and retries failed or malformed pages only', () => {
  const checkpointPath = path.join(projectRoot, 'allen_physics_output', 'page_records.jsonl');
  const checkpoint = readCheckpoint(checkpointPath);

  assert.equal(checkpoint.warnings.length, 0);
  assert.equal(checkpoint.records.size, 9);
  assert.equal(isReusableCheckpoint(checkpoint.records.get(7)), true);
  assert.equal(isReusableCheckpoint(checkpoint.records.get(8)), false);
  assert.equal(isReusableCheckpoint(checkpoint.records.get(9)), false);
});

test('uses the newest valid checkpoint record and reports malformed JSONL lines', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'allen-checkpoint-test-'));
  const checkpointPath = path.join(tempDir, 'records.jsonl');
  const reusableRecord = {
    pdf_page: 1,
    source_text: 'Text without a question marker.',
    candidate_question_page: false,
    extraction_status: 'text_extracted_no_question_marker',
    questions: [],
    page_notes: [],
    needs_visual_review: false,
    errors: [],
  };
  const failedRecord = { ...reusableRecord, extraction_status: 'model_failed', errors: ['offline'] };
  try {
    fs.writeFileSync(
      checkpointPath,
      `${JSON.stringify(reusableRecord)}\nnot-json\n${JSON.stringify(failedRecord)}\n`,
      'utf8'
    );
    const checkpoint = readCheckpoint(checkpointPath);
    assert.equal(checkpoint.records.size, 1);
    assert.equal(checkpoint.records.get(1).extraction_status, 'model_failed');
    assert.equal(checkpoint.warnings.length, 1);
    assert.equal(isReusableCheckpoint(checkpoint.records.get(1)), false);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('preserves an existing output and writes a validated versioned file', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'allen-output-test-'));
  const outputPath = path.join(tempDir, 'questions.json');
  const existing = { source: 'existing-data' };
  const replacement = { source: 'new-data' };
  try {
    fs.writeFileSync(outputPath, JSON.stringify(existing), 'utf8');
    const written = writeJsonWithoutOverwrite(
      outputPath,
      replacement,
      (value) => value && typeof value.source === 'string'
    );

    assert.equal(written.versioned, true);
    assert.equal(JSON.parse(fs.readFileSync(outputPath, 'utf8')).source, 'existing-data');
    assert.equal(JSON.parse(fs.readFileSync(written.path, 'utf8')).source, 'new-data');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('retries an exclusive-create collision without changing the competing file', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'allen-output-race-test-'));
  const outputPath = path.join(tempDir, 'questions.json');
  const competingContents = 'created by another process';
  let raced = false;
  try {
    const written = writeJsonWithoutOverwrite(
      outputPath,
      { source: 'our-data' },
      (value) => value && typeof value.source === 'string',
      (tempPath, targetPath) => {
        if (!raced) {
          fs.writeFileSync(targetPath, competingContents, { flag: 'wx' });
          raced = true;
        }
        return publishStagedFile(tempPath, targetPath);
      }
    );
    assert.equal(raced, true);
    assert.equal(JSON.parse(fs.readFileSync(written.path, 'utf8')).source, 'our-data');
    assert.equal(fs.readFileSync(outputPath, 'utf8'), competingContents);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('does not publish outputs when report validation fails', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'allen-report-validation-test-'));
  const questionsPath = path.join(tempDir, 'questions.json');
  const reportPath = path.join(tempDir, 'run_report.json');
  try {
    assert.throws(() => writeJsonOutputsWithoutOverwrite([
      { filePath: questionsPath, data: { valid: true }, validator: (value) => value.valid === true },
      { filePath: reportPath, data: { valid: false }, validator: (value) => value.valid === true },
    ]), /Refusing to publish invalid JSON output/);
    assert.equal(fs.existsSync(questionsPath), false);
    assert.equal(fs.existsSync(reportPath), false);
    assert.deepEqual(fs.readdirSync(tempDir), []);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('reports partial publication and preserves pre-existing outputs on second publish failure', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'allen-partial-publication-test-'));
  const questionsPath = path.join(tempDir, 'questions.json');
  const reportPath = path.join(tempDir, 'run_report.json');
  const existingQuestions = '{"existing":"questions"}';
  const existingReport = '{"existing":"report"}';
  let publishCount = 0;
  try {
    fs.writeFileSync(questionsPath, existingQuestions, 'utf8');
    fs.writeFileSync(reportPath, existingReport, 'utf8');
    assert.throws(() => writeJsonOutputsWithoutOverwrite([
      {
        filePath: questionsPath,
        data: { generated: 'questions' },
        validator: (value) => typeof value.generated === 'string',
      },
      {
        filePath: reportPath,
        data: { generated: 'report' },
        validator: (value) => typeof value.generated === 'string',
      },
    ], (tempPath, targetPath) => {
      publishCount++;
      if (publishCount === 2) throw new Error('simulated second publication failure');
      return publishStagedFile(tempPath, targetPath);
    }), /Partial publication: 1 of 2 outputs were published/);
    assert.equal(fs.readFileSync(questionsPath, 'utf8'), existingQuestions);
    assert.equal(fs.readFileSync(reportPath, 'utf8'), existingReport);
    const versionedQuestions = fs.readdirSync(tempDir)
      .find((name) => name.startsWith('questions.') && name.endsWith('.json'));
    assert.ok(versionedQuestions);
    assert.deepEqual(fs.readdirSync(tempDir).filter((name) => name.endsWith('.tmp')), []);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
