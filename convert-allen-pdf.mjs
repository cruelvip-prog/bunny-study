#!/usr/bin/env node
/**
 * Draft a bilingual question bank from a PDF with local Ollama.
 * Configure with ALLEN_PDF_PATH, ALLEN_MODEL, ALLEN_OLLAMA_URL, ALLEN_OUT_DIR,
 * ALLEN_MAX_PAGES, and ALLEN_REQUEST_TIMEOUT_MS.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const SUBJECT = process.env.ALLEN_SUBJECT || 'Physics';
const MODEL = process.env.ALLEN_MODEL || 'qwen-local';
const OLLAMA_URL = process.env.ALLEN_OLLAMA_URL || 'http://127.0.0.1:11434/api/generate';
const OUT = path.resolve(process.env.ALLEN_OUT_DIR || 'allen_physics_output');
const CHECKPOINT = path.join(OUT, 'page_records.jsonl');
const FINAL = path.join(OUT, 'questions.json');
const REPORT = path.join(OUT, 'run_report.json');
const MAX_PAGES = parsePositiveInteger(process.env.ALLEN_MAX_PAGES, 0, 'ALLEN_MAX_PAGES');
const REQUEST_TIMEOUT_MS = parsePositiveInteger(
  process.env.ALLEN_REQUEST_TIMEOUT_MS,
  120000,
  'ALLEN_REQUEST_TIMEOUT_MS'
);
const RETRY_FAILED_PAGES = process.env.ALLEN_RETRY_FAILED !== 'false';

const PAGE_STATUSES = new Set([
  'text_extracted_no_question_marker',
  'manual_review_required',
  'page_failed',
  'model_failed',
  'invalid_model_output',
  'model_processed',
  'little_or_no_extractable_text',
  'text_extracted',
]);
const RETRYABLE_STATUSES = new Set([
  'page_failed',
  'model_failed',
  'invalid_model_output',
  'invalid_checkpoint_record',
]);
const QUESTION_LABELS = ['A', 'B', 'C', 'D'];

function parsePositiveInteger(value, fallback, name) {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || (fallback > 0 && parsed === 0)) {
    throw new Error(`${name} must be a ${fallback === 0 ? 'non-negative' : 'positive'} integer.`);
  }
  return parsed;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

class InvalidModelOutputError extends Error {}

function isNullableString(value) {
  return value === null || typeof value === 'string';
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function validateExtractionQuestion(question, expectedSourcePage = null, requireSourcePage = false) {
  const issues = [];
  if (!isRecord(question)) return ['Question must be an object.'];

  if (!(question.question_code === null || typeof question.question_code === 'string')) {
    issues.push('question_code must be a string or null.');
  }
  if (!(question.question_number === null ||
      (Number.isSafeInteger(question.question_number) && question.question_number > 0))) {
    issues.push('question_number must be a positive integer or null.');
  }
  if (typeof question.question_en !== 'string' || !question.question_en.trim()) {
    issues.push('question_en must be a non-empty string.');
  }
  if (requireSourcePage &&
      (!Number.isSafeInteger(question.source_page_pdf) || question.source_page_pdf < 1)) {
    issues.push('source_page_pdf must be a positive integer.');
  }
  if (question.source_page_pdf !== undefined &&
      (!Number.isSafeInteger(question.source_page_pdf) ||
       (expectedSourcePage !== null && question.source_page_pdf !== expectedSourcePage))) {
    issues.push('source_page_pdf must match its containing PDF page record.');
  }
  if (!isNullableString(question.question_hi)) {
    issues.push('question_hi must be a string or null.');
  }
  if (!Array.isArray(question.options) || question.options.length !== 4) {
    issues.push('options must contain exactly four labeled options.');
  } else {
    const labels = new Set();
    for (const option of question.options) {
      if (!isRecord(option)) {
        issues.push('Each option must be an object.');
        continue;
      }
      if (!QUESTION_LABELS.includes(option.label) || labels.has(option.label)) {
        issues.push('Option labels must contain A, B, C, and D exactly once.');
      }
      labels.add(option.label);
      if (typeof option.text_en !== 'string' || !option.text_en.trim()) {
        issues.push(`Option ${String(option.label)} text_en must be a non-empty string.`);
      }
      if (!isNullableString(option.text_hi)) {
        issues.push(`Option ${String(option.label)} text_hi must be a string or null.`);
      }
    }
    if (labels.size !== 4) issues.push('Option labels must contain A, B, C, and D exactly once.');
  }
  if (!(question.answer === null || QUESTION_LABELS.includes(question.answer))) {
    issues.push('answer must be A, B, C, D, or null.');
  }
  if (!isNullableString(question.explanation_en)) {
    issues.push('explanation_en must be a string or null.');
  }
  if (!isNullableString(question.explanation_hi)) {
    issues.push('explanation_hi must be a string or null.');
  }
  if (typeof question.visual_required !== 'boolean') {
    issues.push('visual_required must be a boolean.');
  }
  if (!isStringArray(question.review_flags)) {
    issues.push('review_flags must be an array of strings.');
  }
  return [...new Set(issues)];
}

export function validateQuestionBank(bank) {
  const errors = [];
  const warnings = [];
  if (!isRecord(bank)) return { valid: false, errors: ['Bank root must be a JSON object.'], warnings };
  if (typeof bank.schema_version !== 'string' || !bank.schema_version) {
    errors.push('schema_version must be a non-empty string.');
  }
  if (!isRecord(bank.source_pdf) || typeof bank.source_pdf.file_name !== 'string') {
    errors.push('source_pdf.file_name is required.');
  } else if (!Number.isSafeInteger(bank.source_pdf.total_pages) || bank.source_pdf.total_pages < 1) {
    errors.push('source_pdf.total_pages must be a positive integer.');
  }
  if (!Array.isArray(bank.questions)) {
    errors.push('questions must be an array.');
    return { valid: false, errors, warnings };
  }
  if (!Array.isArray(bank.image_assets)) errors.push('image_assets must be an array.');

  const ids = new Set();
  for (const [index, question] of bank.questions.entries()) {
    const prefix = `questions[${index}]`;
    if (!isRecord(question)) {
      errors.push(`${prefix} must be an object.`);
      continue;
    }
    if (typeof question.id !== 'string' || !question.id.trim()) {
      errors.push(`${prefix}.id must be a non-empty string.`);
    } else if (ids.has(question.id)) {
      errors.push(`${prefix}.id duplicates ${question.id}.`);
    } else {
      ids.add(question.id);
    }
    if (!Number.isSafeInteger(question.question_number) || question.question_number < 1) {
      errors.push(`${prefix}.question_number must be a positive integer.`);
    }
    if (typeof question.chapter !== 'string' || !question.chapter.trim()) {
      errors.push(`${prefix}.chapter must be a non-empty string.`);
    }
    if (typeof question.exercise !== 'string' || !question.exercise.trim()) {
      errors.push(`${prefix}.exercise must be a non-empty string.`);
    }
    if (typeof question.section !== 'string' || !question.section.trim()) {
      errors.push(`${prefix}.section must be a non-empty string.`);
    }
    if (!Number.isSafeInteger(question.source_page) || question.source_page < 1) {
      errors.push(`${prefix}.source_page must be a positive integer.`);
    } else if (isRecord(bank.source_pdf) &&
        Number.isSafeInteger(bank.source_pdf.total_pages) &&
        question.source_page > bank.source_pdf.total_pages) {
      errors.push(`${prefix}.source_page exceeds source_pdf.total_pages.`);
    }
    if (!(question.question_code === null || typeof question.question_code === 'string')) {
      errors.push(`${prefix}.question_code must be a string or null.`);
    }
    if (typeof question.question_en !== 'string' || !question.question_en.trim()) {
      errors.push(`${prefix}.question_en must be a non-empty string.`);
    }
    if (!isNullableString(question.question_hi)) {
      errors.push(`${prefix}.question_hi must be a string or null.`);
    }

    if (!isRecord(question.options)) {
      errors.push(`${prefix}.options must be an object keyed by A, B, C, and D.`);
    } else {
      const optionKeys = Object.keys(question.options).sort();
      if (optionKeys.join(',') !== 'A,B,C,D') {
        errors.push(`${prefix}.options must contain exactly A, B, C, and D.`);
      }
      for (const label of QUESTION_LABELS) {
        const option = question.options[label];
        if (!isRecord(option) || typeof option.text_en !== 'string' || !option.text_en.trim()) {
          errors.push(`${prefix}.options.${label}.text_en must be a non-empty string.`);
          continue;
        }
        if (!isNullableString(option.text_hi)) {
          errors.push(`${prefix}.options.${label}.text_hi must be a string or null.`);
        }
      }
    }

    if (!(question.answer_key === null || QUESTION_LABELS.includes(question.answer_key))) {
      errors.push(`${prefix}.answer_key must be A, B, C, D, or null.`);
    }
    if (!(question.answer_key_source === null || typeof question.answer_key_source === 'string')) {
      errors.push(`${prefix}.answer_key_source must be a string or null.`);
    }
    for (const field of ['explanation_en', 'explanation_hi']) {
      if (!isNullableString(question[field])) {
        errors.push(`${prefix}.${field} must be a string or null.`);
      }
    }
    if (!question.answer_key) warnings.push(`${prefix} has no answer key and cannot be scored.`);
    if (!Array.isArray(question.formulas) || !isStringArray(question.formulas)) {
      errors.push(`${prefix}.formulas must be an array of strings.`);
    }
    if (!isRecord(question.images) ||
        !Array.isArray(question.images.options) ||
        question.images.options.length !== 4) {
      errors.push(`${prefix}.images must include question references and four option image references.`);
    } else {
      for (const field of ['question_en', 'question_hi']) {
        if (!isNullableString(question.images[field])) {
          errors.push(`${prefix}.images.${field} must be a string or null.`);
        }
      }
      if (!question.images.options.every(isNullableString)) {
        errors.push(`${prefix}.images.options must contain only strings or null.`);
      }
    }
    if (!isStringArray(question.review_flags)) {
      errors.push(`${prefix}.review_flags must be an array of strings.`);
    } else if (question.review_flags.length > 0 || (question.missing_content || []).length > 0) {
      warnings.push(`${prefix} has review flags or missing content requiring manual review.`);
    }
    if (!isStringArray(question.missing_content)) {
      errors.push(`${prefix}.missing_content must be an array of strings.`);
    }
    if (question.answer_key && typeof question.answer_key_source !== 'string') {
      warnings.push(`${prefix}.answer_key_source is missing; source verification is not established.`);
    }
  }
  return { valid: errors.length === 0, errors, warnings };
}

export function validatePageRecord(record) {
  if (!isRecord(record)) return ['Page record must be an object.'];
  const issues = [];
  if (!Number.isSafeInteger(record.pdf_page) || record.pdf_page < 1) {
    issues.push('pdf_page must be a positive integer.');
  }
  if (typeof record.source_text !== 'string') issues.push('source_text must be a string.');
  if (typeof record.candidate_question_page !== 'boolean') {
    issues.push('candidate_question_page must be a boolean.');
  }
  if (!PAGE_STATUSES.has(record.extraction_status)) {
    issues.push('extraction_status is not a supported page outcome.');
  }
  if (!Array.isArray(record.questions)) issues.push('questions must be an array.');
  if (!isStringArray(record.page_notes)) issues.push('page_notes must be an array of strings.');
  if (typeof record.needs_visual_review !== 'boolean') {
    issues.push('needs_visual_review must be a boolean.');
  }
  if (!isStringArray(record.errors)) issues.push('errors must be an array of strings.');
  if (Array.isArray(record.questions)) {
    for (const [index, question] of record.questions.entries()) {
      issues.push(...validateExtractionQuestion(question, record.pdf_page, true)
        .map((issue) => `questions[${index}]: ${issue}`));
      if (question && question.needs_review !== undefined && typeof question.needs_review !== 'boolean') {
        issues.push(`questions[${index}]: needs_review must be a boolean when present.`);
      }
    }
  }
  return issues;
}

function validateQuestionOutput(output) {
  return isRecord(output) &&
    typeof output.schema_version === 'string' &&
    Array.isArray(output.questions) &&
    output.questions.every((question) =>
      validateExtractionQuestion(question, null, true).length === 0
    ) &&
    isRecord(output.totals);
}

function validateRunReport(report) {
  if (!isRecord(report) ||
      typeof report.status !== 'string' ||
      !Number.isSafeInteger(report.pdf_pages) ||
      !Array.isArray(report.page_outcomes) ||
      report.page_outcomes.length !== report.pdf_pages ||
      !isRecord(report.totals) ||
      !isRecord(report.outputs)) {
    return false;
  }
  return report.page_outcomes.every((outcome, index) =>
    isRecord(outcome) &&
    outcome.pdf_page === index + 1 &&
    typeof outcome.status === 'string' &&
    Number.isSafeInteger(outcome.questions) &&
    typeof outcome.needs_manual_review === 'boolean' &&
    isStringArray(outcome.errors)
  );
}

export function parseResult(raw, pageNo) {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new InvalidModelOutputError('Model returned an empty response.');
  }
  const jsonText = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let obj;
  try {
    obj = JSON.parse(jsonText);
  } catch (error) {
    throw new InvalidModelOutputError(
      `Model response is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (!isRecord(obj) || !Array.isArray(obj.questions)) {
    throw new InvalidModelOutputError('Model response must be an object containing a questions array.');
  }
  if (obj.page_notes === undefined) obj.page_notes = [];
  if (!isStringArray(obj.page_notes)) {
    throw new InvalidModelOutputError('Model response page_notes must be an array of strings.');
  }
  if (obj.questions.length === 0) {
    throw new InvalidModelOutputError('Model response contained no questions for a candidate question page.');
  }

  for (const [index, question] of obj.questions.entries()) {
    const issues = validateExtractionQuestion(question);
    if (issues.length > 0) {
      throw new InvalidModelOutputError(`Invalid question at questions[${index}]: ${issues.join(' ')}`);
    }
    question.source_page_pdf = pageNo;
    question.needs_review = true;
    question.review_flags = [...new Set([...question.review_flags, 'source_comparison_required'])];
    if (question.visual_required) {
      question.review_flags = [
        ...new Set([...question.review_flags, 'diagram_or_image_needs_visual_review']),
      ];
    }
  }
  return obj;
}

export function readCheckpoint(filePath = CHECKPOINT) {
  const records = new Map();
  const warnings = [];
  if (!fs.existsSync(filePath)) return { records, warnings };

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!line.trim()) continue;
    let record;
    try {
      record = JSON.parse(line);
    } catch (error) {
      warnings.push(`Checkpoint line ${index + 1} is invalid JSON: ${String(error)}`);
      continue;
    }
    if (!isRecord(record) || !Number.isSafeInteger(record.pdf_page) || record.pdf_page < 1) {
      warnings.push(`Checkpoint line ${index + 1} has no valid pdf_page and was ignored.`);
      continue;
    }
    records.set(record.pdf_page, record);
  }
  return { records, warnings };
}

export function isReusableCheckpoint(record) {
  if (validatePageRecord(record).length > 0) return false;
  if (RETRYABLE_STATUSES.has(record.extraction_status)) return false;
  if (record.extraction_status === 'text_extracted' && record.candidate_question_page) return false;
  if (record.extraction_status === 'model_processed' &&
      (!record.questions.length || !record.questions.every((question) => question.needs_review === true))) {
    return false;
  }
  return true;
}

function saveRecord(record, filePath = CHECKPOINT) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf8');
}

function textFromItems(items) {
  return items
    .map((item) => (item && typeof item.str === 'string' ? item.str : ''))
    .filter(Boolean)
    .join(' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function candidatePage(text) {
  return /\b(?:KN|WM)\s*\d{3,}\b|\bEXERCISE\b|\bSOLVED\s+EXAMPLE\b|\bILLUSTRATION\b|\bQUESTION\s*\d+\b|\bQ\s*\.?\s*\d+\b|\(\s*[1-4]\s*\)/i.test(text);
}

function promptFor(pageNo, sourceText) {
  return `Extract only questions actually present in this ${SUBJECT} study-material PDF on page ${pageNo}. Do not solve questions or use outside knowledge. Return one valid JSON object only in this shape:
{"questions":[{"question_code":null,"question_number":null,"question_en":"","question_hi":null,"options":[{"label":"A","text_en":"","text_hi":null},{"label":"B","text_en":"","text_hi":null},{"label":"C","text_en":"","text_hi":null},{"label":"D","text_en":"","text_hi":null}],"answer":null,"explanation_en":null,"explanation_hi":null,"visual_required":false,"review_flags":[]}],"page_notes":[]}
Rules: Never invent or repair missing wording, options, codes, answers, explanations, or translations. Preserve mathematical notation, formula signs, units, superscripts, subscripts, vectors, radicals, fractions, and scientific notation as the source provides them. Do not silently simplify or normalize formulas. Use null where a field is not supported. Translate only clear English text into Hindi. Include review_flags when text or notation is incomplete or uncertain. Keep each question separate. Answer/explanation only if printed on this page.
Exact extracted source text (retained separately without formula rewriting):
${sourceText}`;
}

async function ollama(prompt) {
  let response;
  try {
    response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        model: MODEL,
        prompt,
        stream: false,
        format: 'json',
        options: { temperature: 0, num_ctx: 4096, num_predict: 3000 },
      }),
    });
  } catch (error) {
    throw new Error(`Could not reach Ollama at ${OLLAMA_URL}: ${String(error)}`);
  }

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`Ollama HTTP ${response.status}: ${responseText.slice(0, 400)}`);
  }
  let data;
  try {
    data = JSON.parse(responseText);
  } catch (error) {
    throw new Error(`Ollama returned invalid JSON: ${String(error)}`);
  }
  if (typeof data.error === 'string' && data.error) {
    throw new Error(`Ollama error: ${data.error}`);
  }
  if (!isRecord(data) || typeof data.response !== 'string') {
    throw new InvalidModelOutputError('Ollama response must contain a string response field.');
  }
  if (!data.response.trim()) throw new InvalidModelOutputError('Ollama returned an empty response.');
  return data.response;
}

function pageRecord(pageNo, sourceText, candidate, status, questions = [], notes = [], errors = []) {
  return {
    pdf_page: pageNo,
    source_text: sourceText,
    candidate_question_page: candidate,
    extraction_status: status,
    questions,
    page_notes: notes,
    needs_visual_review: status === 'manual_review_required' ||
      questions.some((question) => question.visual_required || question.needs_review),
    errors,
  };
}

function makeUniquePath(filePath, attempt = 0, stamp = new Date().toISOString().replace(/[:.]/g, '-')) {
  if (attempt === 0 && !fs.existsSync(filePath)) return filePath;
  if (attempt === 0) attempt = 1;
  const extension = path.extname(filePath);
  const base = filePath.slice(0, -extension.length);
  let candidate;
  do {
    const suffix = attempt === 1 ? '' : `-${attempt - 1}`;
    candidate = `${base}.${stamp}${suffix}${extension}`;
    attempt++;
  } while (fs.existsSync(candidate));
  return candidate;
}

function stageJson(filePath, serialized) {
  const directory = path.dirname(filePath);
  const name = path.basename(filePath);
  let descriptor;
  let tempPath;
  for (let attempt = 0; attempt < 10; attempt++) {
    tempPath = path.join(directory, `.${name}.${process.pid}.${randomUUID()}.tmp`);
    try {
      descriptor = fs.openSync(tempPath, 'wx');
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
  if (descriptor === undefined) throw new Error(`Could not allocate a unique temporary file for ${filePath}.`);

  try {
    fs.writeFileSync(descriptor, serialized, 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    return tempPath;
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    try {
      fs.unlinkSync(tempPath);
    } catch (cleanupError) {
      if (cleanupError.code !== 'ENOENT') {
        throw new Error(`Could not clean up owned temporary file ${tempPath}: ${String(cleanupError)}`);
      }
    }
    throw new Error(`Could not safely stage ${filePath}: ${String(error)}`);
  }
}

export function publishStagedFile(tempPath, filePath) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  for (let attempt = 0; ; attempt++) {
    const target = attempt === 0 ? filePath : makeUniquePath(filePath, attempt, stamp);
    try {
      fs.linkSync(tempPath, target);
      return { path: target, versioned: target !== filePath, valid: true };
    } catch (error) {
      if (error.code === 'EEXIST') continue;
      throw error;
    }
  }
}

export function writeJsonOutputsWithoutOverwrite(outputs, publishFile = publishStagedFile) {
  if (!Array.isArray(outputs) || outputs.length === 0) {
    throw new Error('At least one JSON output is required.');
  }
  const prepared = outputs.map(({ filePath, data, validator }) => {
    if (typeof filePath !== 'string' || typeof validator !== 'function') {
      throw new Error('Each JSON output requires a filePath and validator.');
    }
    let serialized;
    try {
      if (!validator(data)) throw new Error('Output data failed validation.');
      serialized = `${JSON.stringify(data, null, 2)}\n`;
      if (!validator(JSON.parse(serialized))) throw new Error('Serialized output failed validation.');
    } catch (error) {
      throw new Error(`Refusing to publish invalid JSON output ${filePath}: ${String(error)}`);
    }
    return { filePath, serialized };
  });

  const staged = [];
  const published = [];
  try {
    for (const output of prepared) staged.push(stageJson(output.filePath, output.serialized));
    for (let index = 0; index < prepared.length; index++) {
      try {
        published.push(publishFile(staged[index], prepared[index].filePath));
      } catch (error) {
        const message = published.length > 0
          ? `Partial publication: ${published.length} of ${prepared.length} outputs were published (${published.map((item) => item.path).join(', ')}); remaining outputs were not published.`
          : `No outputs were published.`;
        throw new Error(`${message} Cause: ${String(error)}`);
      }
    }
    return published;
  } finally {
    for (const tempPath of staged) {
      try {
        fs.unlinkSync(tempPath);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          console.error(`Could not remove owned temporary file ${tempPath}: ${String(error)}`);
        }
      }
    }
  }
}

export function writeJsonWithoutOverwrite(filePath, data, validator, publishFile = publishStagedFile) {
  return writeJsonOutputsWithoutOverwrite([{ filePath, data, validator }], publishFile)[0];
}

function createQuestionOutput(records, pdfPath, totalPdfPages) {
  const ordered = records.slice().sort((left, right) => left.pdf_page - right.pdf_page);
  const questions = ordered.flatMap((record) => record.questions);
  const outcomeCounts = {};
  for (const record of ordered) {
    const status = normalizeLegacyStatus(record);
    outcomeCounts[status] = (outcomeCounts[status] || 0) + 1;
  }
  return {
    schema_version: '1.0-draft',
    subject: SUBJECT,
    source_pdf: path.basename(pdfPath),
    source_page_count: totalPdfPages,
    language_pair: ['en', 'hi'],
    status: 'draft_requires_source_review',
    notes: [
      'AI-assisted draft; not verified transcription or answer key.',
      'Exact extracted per-page source text is retained in page_records.jsonl.',
      'Mathematical notation and extracted text must be checked against the original PDF.',
      'Questions remain drafts and require source review; model output is not verification.',
    ],
    questions,
    page_records_file: path.basename(CHECKPOINT),
    totals: {
      checkpointed_pages: ordered.length,
      source_pages: totalPdfPages,
      candidate_question_pages: ordered.filter((record) => record.candidate_question_page).length,
      draft_questions: questions.length,
      pages_needing_manual_review: ordered.filter((record) =>
        record.needs_visual_review ||
        record.extraction_status === 'model_processed' ||
        record.extraction_status === 'little_or_no_extractable_text'
      ).length,
      failed_pages: ordered.filter((record) => RETRYABLE_STATUSES.has(record.extraction_status)).length,
      page_outcomes: outcomeCounts,
    },
  };
}

function normalizeLegacyStatus(record) {
  if (record.extraction_status === 'model_processed' ||
      record.extraction_status === 'little_or_no_extractable_text') {
    return 'manual_review_required';
  }
  if (record.extraction_status === 'text_extracted' && !record.candidate_question_page) {
    return 'text_extracted_no_question_marker';
  }
  if (record.extraction_status === 'text_extracted' && record.candidate_question_page) {
    return 'manual_review_required';
  }
  return record.extraction_status;
}

async function processPdf() {
  const pdfPath = process.env.ALLEN_PDF_PATH;
  if (!pdfPath) {
    throw new Error('Set ALLEN_PDF_PATH to the source PDF. No machine-specific PDF path is assumed.');
  }
  if (!fs.existsSync(pdfPath)) throw new Error(`PDF not found: ${pdfPath}`);

  let pdfjs;
  try {
    pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  } catch (error) {
    throw new Error(`Could not import pdfjs-dist. Run from the project root. ${String(error)}`);
  }

  fs.mkdirSync(OUT, { recursive: true });
  const checkpoint = readCheckpoint();
  const inputBytes = new Uint8Array(fs.readFileSync(pdfPath));
  const loadingTask = pdfjs.getDocument({
    data: inputBytes,
    useSystemFonts: true,
    isEvalSupported: false,
    disableFontFace: true,
    verbosity: 0,
  });
  const pdf = await loadingTask.promise;

  const pageLimit = MAX_PAGES > 0 ? Math.min(MAX_PAGES, pdf.numPages) : pdf.numPages;
  const currentRecords = new Map(checkpoint.records);
  let newlyProcessed = 0;
  let candidateCount = 0;
  try {
    console.log(`Opened ${pdf.numPages}-page PDF. Processing pages 1-${pageLimit}.`);
    console.log(`Model: ${MODEL}; endpoint: ${OLLAMA_URL}; output: ${OUT}`);
    if (checkpoint.warnings.length) {
      console.warn(`Checkpoint warnings: ${checkpoint.warnings.length}`);
      for (const warning of checkpoint.warnings) console.warn(`- ${warning}`);
    }

    for (let pageNo = 1; pageNo <= pageLimit; pageNo++) {
      const previous = currentRecords.get(pageNo);
      const reusable = previous && isReusableCheckpoint(previous);
      if (reusable || (!RETRY_FAILED_PAGES && previous)) continue;
      let sourceText = '';
      let candidate = false;
      let record;
      try {
        const page = await pdf.getPage(pageNo);
        const content = await page.getTextContent({ includeMarkedContent: true });
        sourceText = textFromItems(content.items || []);
        candidate = candidatePage(sourceText);
        candidateCount += candidate ? 1 : 0;

        if (sourceText.length < 25) {
          record = pageRecord(
            pageNo,
            sourceText,
            candidate,
            'manual_review_required',
            [],
            ['Little or no extractable text; OCR or visual review may be required.']
          );
        } else if (!candidate) {
          record = pageRecord(pageNo, sourceText, false, 'text_extracted_no_question_marker');
        } else {
          try {
            const raw = await ollama(promptFor(pageNo, sourceText));
            const parsed = parseResult(raw, pageNo);
            record = pageRecord(
              pageNo,
              sourceText,
              true,
              'manual_review_required',
              parsed.questions,
              parsed.page_notes
            );
            record.model_raw_response = raw;
          } catch (error) {
            const message = String(error);
            record = pageRecord(
              pageNo,
              sourceText,
              true,
              error instanceof InvalidModelOutputError ? 'invalid_model_output' : 'model_failed',
              [],
              [],
              [message]
            );
          }
        }
      } catch (error) {
        record = pageRecord(pageNo, sourceText, candidate, 'page_failed', [], [], [String(error)]);
      }

      const issues = validatePageRecord(record);
      if (issues.length > 0) {
        throw new Error(`Internal page record validation failed for PDF page ${pageNo}: ${issues.join(' ')}`);
      }
      saveRecord(record);
      currentRecords.set(pageNo, record);
      newlyProcessed++;
      if (pageNo % 10 === 0 || pageNo === pageLimit) {
        console.log(
          `Progress ${pageNo}/${pageLimit} | new/retried pages ${newlyProcessed} | candidates ${candidateCount}`
        );
      }
    }
  } finally {
    await loadingTask.destroy();
  }

  const allCheckpointRecords = [...currentRecords.values()]
    .filter((record) => record.pdf_page <= pdf.numPages);
  const invalidCheckpointRecords = new Map(
    allCheckpointRecords
      .map((record) => [record.pdf_page, validatePageRecord(record)])
      .filter(([, issues]) => issues.length > 0)
  );
  const recordedPages = allCheckpointRecords.filter((record) =>
    !invalidCheckpointRecords.has(record.pdf_page)
  );
  const recordByPage = new Map(recordedPages.map((record) => [record.pdf_page, record]));
  const outcomes = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    const record = recordByPage.get(pageNo);
    const checkpointIssues = invalidCheckpointRecords.get(pageNo);
    outcomes.push(checkpointIssues
      ? {
          pdf_page: pageNo,
          status: 'invalid_checkpoint_record',
          questions: 0,
          needs_manual_review: true,
          errors: checkpointIssues,
        }
      : record
      ? {
          pdf_page: pageNo,
          status: normalizeLegacyStatus(record),
          questions: record.questions.length,
          needs_manual_review: record.needs_visual_review ||
            record.extraction_status === 'model_processed' ||
            record.extraction_status === 'little_or_no_extractable_text',
          errors: record.errors,
        }
      : {
          pdf_page: pageNo,
          status: pageNo > pageLimit ? 'not_processed_page_limit' : 'not_processed',
          questions: 0,
          needs_manual_review: true,
          errors: [],
        });
  }
  const failedPages = outcomes.filter((outcome) => RETRYABLE_STATUSES.has(outcome.status));
  const unprocessedPages = outcomes.filter((outcome) => outcome.status.startsWith('not_processed'));
  const completeCoverage = outcomes.length === pdf.numPages && unprocessedPages.length === 0;

  const questionOutput = createQuestionOutput(recordedPages, pdfPath, pdf.numPages);
  const pageOutcomes = outcomes;
  const runStatus = failedPages.length === 0 && completeCoverage
    ? 'complete_draft_requires_source_review'
    : 'incomplete_requires_retry_or_more_pages';
  const report = {
    finished_at: new Date().toISOString(),
    pdf_path: path.resolve(pdfPath),
    model: MODEL,
    ollama_url: OLLAMA_URL,
    request_timeout_ms: REQUEST_TIMEOUT_MS,
    pdf_pages: pdf.numPages,
    processed_limit: pageLimit,
    status: questionFile.valid && runStatus === 'complete_draft_requires_source_review'
      ? runStatus
      : 'incomplete_outputs_or_pages',
    totals: {
      checkpointed_pages: allCheckpointRecords.length,
      new_pages_processed: newlyProcessed,
      failed_pages: failedPages.length,
      pages_needing_manual_review: outcomes.filter((outcome) => outcome.needs_manual_review).length,
      unprocessed_pages: unprocessedPages.length,
      draft_questions: questionOutput.questions.length,
    },
    failed_pages: failedPages.map((outcome) => ({
      pdf_page: outcome.pdf_page,
      status: outcome.status,
      errors: outcome.errors,
    })),
    page_outcomes: pageOutcomes,
    checkpoint_warnings: checkpoint.warnings,
    outputs: {
      questions_json: makeUniquePath(FINAL),
      questions_json_valid: true,
      questions_json_versioned_to_preserve_existing: fs.existsSync(FINAL),
      page_records_jsonl: CHECKPOINT,
      run_report_json: makeUniquePath(REPORT),
    },
  };
  const [questionFile, reportFile] = writeJsonOutputsWithoutOverwrite([
    { filePath: FINAL, data: questionOutput, validator: validateQuestionOutput },
    { filePath: REPORT, data: report, validator: validateRunReport },
  ]);
  console.log(`Question bank draft: ${questionFile.path}`);
  console.log(`Run report: ${reportFile.path}`);
  console.log(`Status: ${report.status}`);
  console.log(`Failed pages: ${failedPages.length}; manual review required: ${report.totals.pages_needing_manual_review}`);
  if (report.status !== 'complete_draft_requires_source_review') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv[2] === '--validate-bank') {
    const inputPath = process.argv[3];
    if (!inputPath) {
      console.error('Usage: node convert-allen-pdf.mjs --validate-bank <question-bank.json>');
      process.exitCode = 2;
    } else {
      try {
        const bank = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
        const validation = validateQuestionBank(bank);
        console.log(JSON.stringify({
          valid: validation.valid,
          questions: Array.isArray(bank.questions) ? bank.questions.length : null,
          errors: validation.errors,
          warnings: validation.warnings,
        }, null, 2));
        if (!validation.valid) process.exitCode = 1;
      } catch (error) {
        console.error(`Could not validate bank: ${String(error)}`);
        process.exitCode = 1;
      }
    }
  } else {
    processPdf().catch((error) => {
      console.error('\nFAILED:', String(error));
      process.exitCode = 1;
    });
  }
}
