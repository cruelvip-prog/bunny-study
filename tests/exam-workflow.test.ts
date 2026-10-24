import assert from 'node:assert/strict';
import { loadImage } from 'canvas';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TestConfig } from '../src/types/exam';
import {
  createImportedAnswerKey,
  generatePracticeQuestions,
  QUESTION_BANK_MAX_IMAGE_BYTES,
  validateQuestionBankImageDecoding,
  validateQuestionBankText,
} from '../src/utils/questionBank';
import { formatQuestionBankStorageError } from '../src/utils/questionBankImport';
import { parseAnswerKeyInput } from '../src/utils/answerKeyParser';
import {
  buildAnswerReport,
  formatAnswerReportStatus,
  paginateAnswerReportRows,
} from '../src/utils/answerReport';
import {
  calculateExamResults,
  getDeadlineRemainingSeconds,
  validateAndNormalizeSession,
} from '../src/utils/examLogic';
import {
  getDashboardOverview,
  getPracticeStreak,
  readDashboardHistory,
  recordCompletedSession,
  normalizeDashboardSubject,
  summarizeDashboardSession,
} from '../src/utils/dashboardHistory';
import { ExamSessionState } from '../src/types/exam';
import { splitMathText } from '../src/utils/mathText';
import { getOptionDisplayLabel, getQuestionLanguageView } from '../src/utils/questionLanguage';
import { QuestionBankViewer } from '../src/components/QuestionBankViewer';
import { QuestionLanguageView } from '../src/components/QuestionLanguageView';
import { QuestionControl } from '../src/components/QuestionControl';
import { Dashboard } from '../src/components/Dashboard';
import { ThemeProvider } from '../src/ThemeContext';
import { FeatureScreens, questionBankTemplate } from '../src/components/FeatureScreens';
import { ResultsView } from '../src/components/ResultsView';
import {
  createCustomTestQuestions,
  getCustomTestImportedAnswerKey,
  getCustomTestConfigurationError,
  filterCustomTestQuestions,
  getBuilderChapterSelectionKeys,
  getBuilderQuestionMetadata,
  getBuilderSelectionState,
  getBuilderTopicKey,
  getUniqueBuilderQuestions,
  toggleBuilderSelection,
} from '../src/utils/customTestBuilder';
import { readStoredQuestionBanks, saveQuestionBank } from '../src/utils/questionBankStorage';
import { getPrebuiltPyqPapers } from '../src/utils/pyqPapers';
import {
  ACCOUNT_DATABASE_NAME,
  ACCOUNT_STORES,
  deleteAccountRecord,
  getAllAccountRecords,
  getAccountLocalStorageKey,
  getAccountRecord,
  putAccountRecord,
  readAccountLocalValue,
  removeAccountLocalValue,
  validateOwnerId,
  writeAccountLocalValue,
} from '../src/utils/accountStorage';
import {
  readBookmarks,
  readSyllabusProgress,
  readStudyFlashcards,
  readStudyNotes,
  saveBookmarks,
  saveSyllabusProgress,
  saveStudyFlashcards,
  saveStudyNotes,
} from '../src/utils/studyToolsStorage';

const projectRoot = path.resolve(import.meta.dirname, '..');
const fixturePath = path.join(projectRoot, 'sample_output', 'sample_physics_bank.json');
const fixtureText = fs.readFileSync(fixturePath, 'utf8');

function getBank() {
  const result = validateQuestionBankText(fixtureText);
  assert.ok(result.bank, result.errors.join('\n'));
  return result.bank;
}

function config(totalQuestions: number): TestConfig {
  return {
    id: 'practice-1',
    title: 'Test',
    totalQuestions,
    durationMinutes: 30,
    candidateName: 'Candidate',
    rollNumber: '1',
    sections: [{ id: 'physics', name: 'Physics', startQ: 1, endQ: totalQuestions, total: totalQuestions }],
    hasCustomPdf: false,
    preset: 'custom',
    sourceType: 'question-bank',
  };
}

const embeddedPng = fs.readFileSync(path.join(projectRoot, 'sample_output', 'page001_review.png')).toString('base64');
const embeddedJpeg = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD5/ooooA//2Q==';

function createAccountIndexedDbTestDouble() {
  const databases = new Map<string, Map<string, Map<string, Record<string, unknown>>>>();
  const openedNames: string[] = [];

  const createStore = (
    databaseStores: Map<string, Map<string, Record<string, unknown>>>,
    storeName: string,
    completeTransaction: () => void = () => undefined,
  ) => {
    const records = databaseStores.get(storeName) || new Map<string, Record<string, unknown>>();
    const indexes = new Set<string>();
    databaseStores.set(storeName, records);
    return {
      indexNames: { contains: (name: string) => indexes.has(name) },
      createIndex: (name: string) => indexes.add(name),
      put: (record: Record<string, unknown>) => {
        const key = JSON.stringify([record.ownerId, record.id]);
        const request: { onsuccess?: () => void; result?: unknown } = {};
        setTimeout(() => {
          records.set(key, record);
          request.result = key;
          request.onsuccess?.();
          completeTransaction();
        }, 0);
        return request;
      },
      get: (key: IDBValidKey) => {
        const request: { onsuccess?: () => void; result?: unknown } = {};
        setTimeout(() => {
          request.result = records.get(JSON.stringify(key));
          request.onsuccess?.();
          completeTransaction();
        }, 0);
        return request;
      },
      delete: (key: IDBValidKey) => {
        const request: { onsuccess?: () => void; result?: unknown } = {};
        setTimeout(() => {
          records.delete(JSON.stringify(key));
          request.result = undefined;
          request.onsuccess?.();
          completeTransaction();
        }, 0);
        return request;
      },
      index: () => ({
        getAll: (ownerId: IDBValidKey) => {
          const request: { onsuccess?: () => void; result?: unknown } = {};
          setTimeout(() => {
            request.result = [...records.values()].filter((record) => record.ownerId === ownerId);
            request.onsuccess?.();
            completeTransaction();
          }, 0);
          return request;
        },
      }),
    };
  };

  const factory = {
    open(name: string) {
      openedNames.push(name);
      let stores = databases.get(name);
      const isNew = !stores;
      if (!stores) {
        stores = new Map();
        databases.set(name, stores);
      }
      const databaseStores = stores;
      const database = {
        objectStoreNames: { contains: (storeName: string) => databaseStores.has(storeName) },
        createObjectStore: (storeName: string) => createStore(databaseStores, storeName),
        transaction: (storeNames: string[]) => {
          const transaction = {
            oncomplete: null as null | (() => void),
            onerror: null as null | (() => void),
            onabort: null as null | (() => void),
            error: null,
            objectStore: (storeName: string) => createStore(databaseStores, storeName),
          };
          transaction.objectStore = (storeName: string) => {
            if (!storeNames.includes(storeName) || !databaseStores.has(storeName)) {
              throw new Error(`Unknown test object store: ${storeName}`);
            }
            return createStore(databaseStores, storeName, () => transaction.oncomplete?.());
          };
          return transaction;
        },
        close: () => undefined,
        onversionchange: null as null | (() => void),
      };
      const request: {
        result: typeof database;
        transaction?: { objectStore: (storeName: string) => ReturnType<typeof createStore> };
        onupgradeneeded?: (event: { target: unknown }) => void;
        onsuccess?: () => void;
        onerror?: () => void;
        onblocked?: () => void;
        error?: Error;
      } = {
        result: database,
        transaction: { objectStore: (storeName) => createStore(databaseStores, storeName) },
      };
      setTimeout(() => {
        if (isNew) request.onupgradeneeded?.({ target: request });
        request.onsuccess?.();
      }, 0);
      return request;
    },
  };

  return { factory: factory as unknown as IDBFactory, openedNames, databases };
}

function bankWithEmbeddedImages(): string {
  const bank = JSON.parse(fixtureText);
  bank.image_assets = [
    { id: 'question-figure', type: 'question', mimeType: 'image/png', dataUri: `data:image/png;base64,${embeddedPng}`, alt: 'A small figure', caption: 'Question figure' },
    { id: 'option-figure', type: 'option', mimeType: 'image/png', dataUri: `data:image/png;base64,${embeddedPng}`, alt: 'Option diagram', caption: null },
    { id: 'explanation-figure', type: 'explanation', mimeType: 'image/png', dataUri: `data:image/png;base64,${embeddedPng}`, alt: 'Explanation figure', caption: 'Worked explanation' },
  ];
  bank.questions[0].images = {
    question_en: 'question-figure',
    question_hi: null,
    options: ['option-figure', null, null, null],
    explanation: 'explanation-figure',
  };
  return JSON.stringify(bank);
}

function schemaV2Bank(correctAnswer: unknown = 'option-b'): string {
  return JSON.stringify({
    schemaVersion: 2,
    bankNote: 'Preserve root metadata',
    questions: [{
      id: 'q-v2-1',
      subject: 'Physics',
      chapter: 'Mechanics',
      topic: 'Kinematics',
      subtopic: 'Displacement',
      difficulty: 'medium',
      questionType: 'single_choice',
      languages: {
        en: {
          question: 'English question?',
          options: [
            { optionId: 'option-a', text: 'English A' },
            { optionId: 'option-b', text: 'English B' },
            { optionId: 'option-c', text: 'English C' },
            { optionId: 'option-d', text: 'English D' },
          ],
          explanation: 'English explanation.',
          solution: 'English solution.',
        },
        hi: {
          question: 'हिंदी प्रश्न?',
          options: [
            { optionId: 'option-b', text: 'हिंदी B' },
            { optionId: 'option-a', text: 'हिंदी A' },
            { optionId: 'option-d', text: 'हिंदी D' },
            { optionId: 'option-c', text: 'हिंदी C' },
          ],
          explanation: 'हिंदी व्याख्या।',
          solution: 'हिंदी समाधान।',
        },
      },
      correctAnswer,
      marks: 4,
      negativeMarks: 1,
      timeEstimateSeconds: 75,
      images: [
        {
          id: 'v2-question-image',
          type: 'question',
          mimeType: 'image/png',
          dataUri: `data:image/png;base64,${embeddedPng}`,
          alt: 'Question diagram',
          caption: 'Diagram',
        },
        { type: 'question', path: 'images/local-diagram.png' },
      ],
      syllabus: { unit: 'Mechanics', code: 'M-1' },
      tags: ['motion', 'practice'],
      source: { title: 'Source text', page: 12 },
      status: 'published',
      customMetadata: { retained: true },
    }],
  });
}

test('imports the supplied schema and reports content requiring manual review', () => {
  const result = validateQuestionBankText(fixtureText);
  assert.ok(result.bank);
  assert.equal(result.summary.totalQuestions, 9);
  assert.equal(result.summary.validQuestions, 9);
  assert.equal(result.summary.rejectedQuestions, 0);
  assert.deepEqual(result.summary.subjects, ['Physics']);
  assert.ok(result.summary.reviewRequired > 0);
});

test('preserves explicit NEET PYQ metadata and catalogs only explicitly identified papers', () => {
  const source = JSON.parse(fixtureText);
  source.pyqPaper = {
    type: 'neet-pyq',
    title: 'NEET Previous-Year Paper',
    year: 2024,
    session: 'May',
    durationMinutes: 200,
    marks: 720,
  };
  const validated = validateQuestionBankText(JSON.stringify(source));
  assert.ok(validated.bank, validated.errors.join('\n'));
  assert.deepEqual(validated.bank.sourceMetadata?.pyqPaper, source.pyqPaper);

  const paperBank = {
    id: 'neet-pyq-2024',
    fileName: 'neet-pyq.json',
    importedAt: 1,
    bank: validated.bank,
  };
  const [paper] = getPrebuiltPyqPapers([paperBank]);
  assert.ok(paper);
  assert.equal(paper.title, 'NEET Previous-Year Paper');
  assert.equal(paper.year, 2024);
  assert.equal(paper.session, 'May');
  assert.equal(paper.questions.length, 9);
  assert.deepEqual(paper.subjects, ['Physics']);
  assert.equal(paper.durationMinutes, 200);
  assert.equal(paper.marks, 720);

  const unlabelledBank = {
    ...paperBank,
    id: 'unlabelled',
    fileName: 'NEET 2025 question paper.json',
    bank: getBank(),
  };
  assert.deepEqual(getPrebuiltPyqPapers([unlabelledBank]), []);
});

test('validates schema v2, maps one bilingual question, and preserves all source metadata', () => {
  const result = validateQuestionBankText(schemaV2Bank());
  assert.ok(result.bank, result.errors.join('\n'));
  assert.equal(result.bank.schemaVersion, '2');
  assert.equal(result.bank.questions.length, 1);
  const question = result.bank.questions[0];
  assert.equal(question.id, 'q-v2-1');
  assert.equal(question.questionEn, 'English question?');
  assert.equal(question.questionHi, 'हिंदी प्रश्न?');
  assert.equal(question.options.A.textHi, 'हिंदी A');
  assert.equal(question.options.B.textEn, 'English B');
  assert.equal(question.options.B.textHi, 'हिंदी B');
  assert.equal(question.answerKey, 'B');
  assert.equal(question.explanationEn, 'English explanation.');
  assert.equal(question.explanationHi, 'हिंदी व्याख्या।');
  assert.equal(question.schemaV2?.marks, 4);
  assert.equal(question.schemaV2?.negativeMarks, 1);
  assert.equal(question.schemaV2?.timeEstimateSeconds, 75);
  assert.deepEqual(question.schemaV2?.syllabus, { unit: 'Mechanics', code: 'M-1' });
  assert.deepEqual(question.schemaV2?.tags, ['motion', 'practice']);
  assert.deepEqual(question.schemaV2?.source, { title: 'Source text', page: 12 });
  assert.equal(question.schemaV2?.status, 'published');
  assert.deepEqual(question.schemaV2?.customMetadata, { retained: true });
  assert.equal(question.images?.length, 1);
  assert.equal(question.images?.[0].dataUri, `data:image/png;base64,${embeddedPng}`);
  assert.match(question.missingContent.join(' '), /local-diagram\.png.*file paths are not treated as image bytes/);
  assert.equal(result.bank.sourceMetadata?.bankNote, 'Preserve root metadata');
});

test('imports schema 1.0 topic names for Custom Test while retaining chapter and section metadata', () => {
  const source = JSON.parse(fixtureText);
  source.source_pdf.subject = 'Chemistry';
  const topicNames = [
    '  Atomic mass; subatomic particle masses  ',
    'Isotope abundance',
    'Nuclear composition',
  ];
  source.questions.slice(0, topicNames.length).forEach((question: Record<string, unknown>, index: number) => {
    question.subject = 'Chemistry';
    question.chapter = 'Atomic Structure';
    question.section = 'Build Up Your Understanding';
    question.topic = topicNames[index];
  });

  const result = validateQuestionBankText(JSON.stringify(source));
  assert.ok(result.bank, result.errors.join('\n'));
  const questions = result.bank.questions.slice(0, topicNames.length);
  assert.deepEqual(questions.map((question) => question.topicName), topicNames);
  assert.ok(questions.every((question) => question.topic === 'Atomic Structure'));
  assert.ok(questions.every((question) => question.section === 'Build Up Your Understanding'));

  const metadata = questions.map((question) => getBuilderQuestionMetadata(question));
  assert.deepEqual(metadata.map((entry) => entry.chapter), ['Atomic Structure', 'Atomic Structure', 'Atomic Structure']);
  assert.deepEqual(metadata.map((entry) => entry.topic), topicNames.map((topic) => topic.trim()));
  assert.deepEqual([...new Set(metadata.map((entry) => entry.topic))], topicNames.map((topic) => topic.trim()));
  const chapterKeys = getBuilderChapterSelectionKeys(questions, 'Chemistry', 'Atomic Structure');
  assert.equal(chapterKeys.length, 3);
  assert.deepEqual(
    filterCustomTestQuestions(questions, {
      subjects: ['Chemistry'],
      classLevel: 'All',
      selectedTopicKeys: [getBuilderTopicKey(questions[0], metadata[0])],
    }).map((question) => question.id),
    [questions[0].id],
  );
  assert.equal(
    filterCustomTestQuestions(questions, {
      subjects: ['Chemistry'],
      classLevel: 'All',
      selectedTopicKeys: chapterKeys,
    }).length,
    3,
  );
});

test('schema 1.0 questions with missing or empty topic names remain whole-chapter selectable', () => {
  const source = JSON.parse(fixtureText);
  source.questions[0].topic = '   ';
  delete source.questions[1].topic;
  const result = validateQuestionBankText(JSON.stringify(source));
  assert.ok(result.bank, result.errors.join('\n'));
  const questions = result.bank.questions.slice(0, 2);

  assert.deepEqual(questions.map((question) => getBuilderQuestionMetadata(question).topic), [null, null]);
  const chapterKeys = getBuilderChapterSelectionKeys(questions, 'Physics', questions[0].topic);
  assert.equal(chapterKeys.length, 1);
  assert.equal(
    filterCustomTestQuestions(questions, {
      subjects: ['Physics'],
      classLevel: 'All',
      selectedTopicKeys: chapterKeys,
    }).length,
    2,
  );
});

test('imports, renders, exports, and scores legacy bilingual question-bank content without remapping answers', () => {
  const source = JSON.parse(fixtureText);
  const rawQuestion = source.questions[0];
  rawQuestion.question_hi = 'हिंदी में प्रश्न?';
  rawQuestion.options.A.text_hi = 'हिंदी विकल्प A';
  rawQuestion.options.B.text_hi = 'हिंदी विकल्प B';
  rawQuestion.options.C.text_hi = 'हिंदी विकल्प C';
  rawQuestion.options.D.text_hi = 'हिंदी विकल्प D';
  rawQuestion.answer_key = 'B';
  const sourceText = JSON.stringify(source);
  const imported = validateQuestionBankText(sourceText);
  assert.ok(imported.bank, imported.errors.join('\n'));

  const question = imported.bank.questions[0];
  assert.equal(question.questionHi, rawQuestion.question_hi);
  assert.deepEqual(
    ['A', 'B', 'C', 'D'].map((letter) => question.options[letter as 'A' | 'B' | 'C' | 'D'].textHi),
    ['हिंदी विकल्प A', 'हिंदी विकल्प B', 'हिंदी विकल्प C', 'हिंदी विकल्प D'],
  );
  assert.equal(question.answerKey, 'B');
  assert.equal(getQuestionLanguageView(question, 'en').question, rawQuestion.question_en);
  assert.equal(getQuestionLanguageView(question, 'en').options.B, rawQuestion.options.B.text_en);
  assert.equal(getQuestionLanguageView(question, 'hi').question, 'हिंदी में प्रश्न?');
  assert.deepEqual(
    getQuestionLanguageView(question, 'hi').options,
    { A: 'हिंदी विकल्प A', B: 'हिंदी विकल्प B', C: 'हिंदी विकल्प C', D: 'हिंदी विकल्प D' },
  );

  const englishMarkup = renderToStaticMarkup(React.createElement(QuestionLanguageView, { question }));
  assert.ok(englishMarkup.includes(question.questionEn));
  assert.ok(englishMarkup.includes(question.options.A.textEn));
  assert.doesNotMatch(englishMarkup, /हिंदी में प्रश्न\?|हिंदी विकल्प A/);
  assert.deepEqual(
    ['A', 'B', 'C', 'D'].map((letter) => getOptionDisplayLabel(letter as 'A' | 'B' | 'C' | 'D', 'hi')),
    ['१', '२', '३', '४'],
  );
  assert.deepEqual(
    ['A', 'B', 'C', 'D'].map((letter) => getOptionDisplayLabel(letter as 'A' | 'B' | 'C' | 'D', 'en')),
    ['A', 'B', 'C', 'D'],
  );

  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
  try {
    saveQuestionBank('bilingual-v1.json', sourceText);
    const exportedText = readStoredQuestionBanks().banks[0].sourceText;
    assert.equal(exportedText, sourceText);
    const exportedQuestion = JSON.parse(exportedText!).questions[0];
    assert.equal(exportedQuestion.question_hi, 'हिंदी में प्रश्न?');
    assert.deepEqual(
      ['A', 'B', 'C', 'D'].map((letter) => exportedQuestion.options[letter].text_hi),
      ['हिंदी विकल्प A', 'हिंदी विकल्प B', 'हिंदी विकल्प C', 'हिंदी विकल्प D'],
    );
    assert.equal(exportedQuestion.answer_key, 'B');
    const reimported = validateQuestionBankText(exportedText!);
    assert.ok(reimported.bank, reimported.errors.join('\n'));
    assert.equal(reimported.bank.questions[0].questionHi, 'हिंदी में प्रश्न?');
    assert.equal(reimported.bank.questions[0].answerKey, 'B');
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }

  const scored = calculateExamResults(
    config(1),
    { 1: 'B' },
    { 1: 'answered' },
    { 1: question.answerKey! },
    'user-verified-import',
  );
  assert.equal(scored.totalCorrect, 1);
  assert.equal(scored.totalScore, 4);
});

test('accepts omitted Hindi fields and falls back to English without rendering null', () => {
  const source = JSON.parse(fixtureText);
  delete source.questions[0].question_hi;
  for (const option of Object.values(source.questions[0].options) as Array<Record<string, unknown>>) {
    delete option.text_hi;
  }
  const imported = validateQuestionBankText(JSON.stringify(source));
  assert.ok(imported.bank, imported.errors.join('\n'));
  const question = imported.bank.questions[0];
  assert.equal(question.questionHi, null);
  assert.deepEqual(
    ['A', 'B', 'C', 'D'].map((letter) => question.options[letter as 'A' | 'B' | 'C' | 'D'].textHi),
    [null, null, null, null],
  );
  const hindiView = getQuestionLanguageView(question, 'hi');
  assert.equal(hindiView.question, question.questionEn);
  assert.deepEqual(
    hindiView.options,
    Object.fromEntries(['A', 'B', 'C', 'D'].map((letter) => [
      letter,
      question.options[letter as 'A' | 'B' | 'C' | 'D'].textEn,
    ])),
  );
  assert.equal(hindiView.questionFallback, true);
  assert.equal(hindiView.optionsFallback, true);
  const markup = renderToStaticMarkup(React.createElement(QuestionLanguageView, { question }));
  assert.doesNotMatch(markup, />\s*(?:null|undefined)\s*</);
});

test('provides a complete bilingual example in the downloadable JSON template', () => {
  const question = questionBankTemplate.questions[0];
  assert.equal(typeof question.question_hi, 'string');
  assert.ok(question.question_hi.trim());
  assert.deepEqual(
    ['A', 'B', 'C', 'D'].map((letter) => question.options[letter as 'A' | 'B' | 'C' | 'D'].text_hi),
    ['विकल्प A', 'विकल्प B', 'विकल्प C', 'विकल्प D'],
  );
  const imported = validateQuestionBankText(JSON.stringify(questionBankTemplate));
  assert.ok(imported.bank, imported.errors.join('\n'));
});

test('custom test chapter selections preserve topic granularity and partial states', () => {
  const result = validateQuestionBankText(schemaV2Bank());
  assert.ok(result.bank, result.errors.join('\n'));
  const question = result.bank.questions[0];
  const questions = [
    {
      ...question,
      id: 'physics-11-kinematics',
      questionEn: 'English question about class 11 kinematics?',
      schemaV2: { ...question.schemaV2, class: 'Class 11', topic: 'Kinematics' },
    },
    {
      ...question,
      id: 'physics-11-dynamics',
      questionEn: 'English question about class 11 dynamics?',
      schemaV2: { ...question.schemaV2, class: 11, topic: 'Dynamics' },
    },
    {
      ...question,
      id: 'physics-12-kinematics',
      questionEn: 'English question about class 12 kinematics?',
      schemaV2: { ...question.schemaV2, classLevel: '12th', topic: 'Kinematics' },
    },
  ];
  const allChapterKeys = getBuilderChapterSelectionKeys(questions, 'Physics', 'Mechanics');
  const class11Keys = getBuilderChapterSelectionKeys(questions, 'Physics', 'Mechanics', '11');
  const kinematicsKey = getBuilderTopicKey(questions[0], getBuilderQuestionMetadata(questions[0]));

  assert.equal(allChapterKeys.length, 3);
  assert.equal(class11Keys.length, 2);
  assert.equal(
    filterCustomTestQuestions(questions, {
      subjects: ['Physics'],
      classLevel: 'All',
      selectedTopicKeys: allChapterKeys,
    }).length,
    3,
  );
  assert.deepEqual(
    filterCustomTestQuestions(questions, {
      subjects: ['Physics'],
      classLevel: 'All',
      selectedTopicKeys: class11Keys,
    }).map((entry) => entry.id),
    ['physics-11-kinematics', 'physics-11-dynamics'],
  );
  assert.deepEqual(
    filterCustomTestQuestions(questions, {
      subjects: ['Physics'],
      classLevel: '11',
      selectedTopicKeys: allChapterKeys,
    }).map((entry) => entry.id),
    ['physics-11-kinematics', 'physics-11-dynamics'],
  );
  assert.deepEqual(
    filterCustomTestQuestions(questions, {
      subjects: ['Physics'],
      classLevel: '12',
      selectedTopicKeys: allChapterKeys,
    }).map((entry) => entry.id),
    ['physics-12-kinematics'],
  );
  assert.deepEqual(
    filterCustomTestQuestions(questions, {
      subjects: ['Physics'],
      classLevel: 'All',
      selectedTopicKeys: [kinematicsKey],
    }).map((entry) => entry.id),
    ['physics-11-kinematics'],
  );
  assert.deepEqual(getBuilderSelectionState(allChapterKeys, [kinematicsKey]), {
    checked: false,
    indeterminate: true,
  });

  const wholeChapterSelection = toggleBuilderSelection([kinematicsKey], class11Keys);
  assert.deepEqual(getBuilderSelectionState(class11Keys, wholeChapterSelection), {
    checked: true,
    indeterminate: false,
  });
  assert.equal(wholeChapterSelection.includes(kinematicsKey), true);
  assert.deepEqual(toggleBuilderSelection(wholeChapterSelection, class11Keys), []);
  const individualTopicSelection = toggleBuilderSelection([], [kinematicsKey]);
  assert.deepEqual(individualTopicSelection, [kinematicsKey]);
  assert.deepEqual(toggleBuilderSelection(individualTopicSelection, [kinematicsKey]), []);

  const subjectSelectionState: Record<string, string[]> = {
    Physics: [kinematicsKey],
    Chemistry: ['chemistry-topic-key'],
  };
  subjectSelectionState.Biology = ['biology-topic-key'];
  assert.deepEqual(subjectSelectionState, {
    Physics: [kinematicsKey],
    Chemistry: ['chemistry-topic-key'],
    Biology: ['biology-topic-key'],
  });
  assert.deepEqual(subjectSelectionState.Physics, [kinematicsKey]);
});

test('custom test creation samples only selected topics and preserves question data', () => {
  const result = validateQuestionBankText(schemaV2Bank());
  assert.ok(result.bank, result.errors.join('\n'));
  const source = result.bank.questions[0];
  const questions = [
    {
      ...source,
      id: 'selected-kinematics-1',
      questionEn: 'English question about kinematics, case one?',
      schemaV2: { ...source.schemaV2, class: 'Class 11', topic: 'Kinematics' },
    },
    {
      ...source,
      id: 'selected-kinematics-2',
      questionEn: 'English question about kinematics, case two?',
      schemaV2: { ...source.schemaV2, class: 'Class 11', topic: 'Kinematics' },
    },
    {
      ...source,
      id: 'excluded-dynamics',
      questionEn: 'English question about dynamics?',
      schemaV2: { ...source.schemaV2, class: 'Class 11', topic: 'Dynamics' },
    },
    {
      ...source,
      id: 'excluded-chemistry',
      subject: 'Chemistry',
      questionEn: 'English question about kinematics in another subject?',
      schemaV2: { ...source.schemaV2, class: 'Class 11', topic: 'Kinematics' },
    },
  ];
  questions.push({ ...questions[0] });
  const selectedKey = getBuilderTopicKey(questions[0], getBuilderQuestionMetadata(questions[0]));
  const created = createCustomTestQuestions(questions, {
    subjects: ['Physics'],
    classLevel: 'All',
    selectedTopicKeys: [selectedKey],
  }, 2, () => 0.9);

  assert.equal(created.length, 2);
  assert.deepEqual(new Set(created.map((question) => question.id)), new Set([
    'selected-kinematics-1',
    'selected-kinematics-2',
  ]));
  assert.ok(created.every((question) => question.subject === 'Physics'));
  assert.ok(created.every((question) => getBuilderQuestionMetadata(question).topic === 'Kinematics'));
  assert.ok(created.every((question) => question.answerKey === source.answerKey));
  assert.ok(created.every((question) => question.questionEn.toLocaleLowerCase().includes('kinematics')));
  assert.ok(created.every((question) => question.questionHi === source.questionHi));
  assert.ok(created.every((question) => question.images?.length === source.images?.length));
  assert.ok(created.every((question) => question.schemaV2?.negativeMarks === source.schemaV2?.negativeMarks));
  assert.equal(getUniqueBuilderQuestions([
    { ...questions[0], questionEn: 'Different question text' },
    questions[0],
  ]).length, 2);
  assert.equal(getUniqueBuilderQuestions([
    questions[0],
    {
      ...questions[0],
      id: 'same-content-different-metadata',
      schemaV2: { ...questions[0].schemaV2, topic: 'Different topic metadata' },
    },
  ]).length, 1);

  assert.throws(
    () => createCustomTestQuestions(questions, {
      subjects: ['Physics'],
      classLevel: 'All',
      selectedTopicKeys: [selectedKey],
    }, 3),
    /Only 2 unique eligible question\(s\) are available; 3 requested/,
  );
});

test('custom tests combine selected topics from Physics, Chemistry, and Biology', () => {
  const result = validateQuestionBankText(schemaV2Bank());
  assert.ok(result.bank, result.errors.join('\n'));
  const source = result.bank.questions[0];
  const subjects = ['Physics', 'Chemistry', 'Biology'] as const;
  const questions = subjects.map((subject) => ({
    ...source,
    id: `${subject.toLocaleLowerCase()}-question`,
    subject,
    questionEn: `${subject} subject-specific question?`,
    schemaV2: {
      ...source.schemaV2,
      topic: `${subject} topic`,
    },
  }));
  const selectedTopicKeys = questions.map((question) =>
    getBuilderTopicKey(question, getBuilderQuestionMetadata(question))
  );
  const created = createCustomTestQuestions(questions, {
    subjects: [...subjects],
    classLevel: 'All',
    selectedTopicKeys,
  }, 3, () => 0);

  assert.equal(created.length, 3);
  assert.deepEqual(new Set(created.map((question) => question.subject)), new Set(subjects));
  assert.deepEqual(
    new Set(created.map((question) => getBuilderQuestionMetadata(question).topic)),
    new Set(subjects.map((subject) => `${subject} topic`)),
  );
});

test('custom test creation remains compatible with legacy v1 chapter metadata', () => {
  const result = validateQuestionBankText(fixtureText);
  assert.ok(result.bank, result.errors.join('\n'));
  const legacyQuestions = result.bank.questions;
  const firstMetadata = getBuilderQuestionMetadata(legacyQuestions[0]);
  const chapterKeys = getBuilderChapterSelectionKeys(
    legacyQuestions,
    'Physics',
    firstMetadata.chapter,
  );
  const created = createCustomTestQuestions(legacyQuestions, {
    subjects: ['Physics'],
    classLevel: 'All',
    selectedTopicKeys: chapterKeys,
  }, 1, () => 0.5);

  assert.equal(created.length, 1);
  assert.equal(getBuilderQuestionMetadata(created[0]).chapter, firstMetadata.chapter);
  assert.equal(created[0].schemaV2, undefined);
});

test('custom test configuration validates selections, counts, availability, and duration', () => {
  const validConfiguration = {
    selectedQuestionCount: 2,
    questionCount: 10,
    availableQuestionCount: 12,
    durationMinutes: 30,
  };
  assert.equal(getCustomTestConfigurationError(validConfiguration), null);
  assert.match(getCustomTestConfigurationError({
    ...validConfiguration,
    selectedQuestionCount: 0,
  }) || '', /Select at least one/);
  assert.match(getCustomTestConfigurationError({
    ...validConfiguration,
    questionCount: 0,
  }) || '', /whole-number question count/);
  assert.match(getCustomTestConfigurationError({
    ...validConfiguration,
    questionCount: 1.5,
  }) || '', /whole-number question count/);
  assert.match(getCustomTestConfigurationError({
    ...validConfiguration,
    questionCount: 15,
  }) || '', /Only 12 eligible question\(s\) are available/);
  assert.match(getCustomTestConfigurationError({
    ...validConfiguration,
    durationMinutes: 401,
  }) || '', /duration from 1 to 400 minutes/);
});

test('keeps v2 questions when the answer format cannot map to one A-D answer', () => {
  const result = validateQuestionBankText(schemaV2Bank(['option-a', 'option-b']));
  assert.ok(result.bank, result.errors.join('\n'));
  const question = result.bank.questions[0];
  assert.equal(question.id, 'q-v2-1');
  assert.equal(question.answerKey, null);
  assert.deepEqual(question.schemaV2?.correctAnswer, ['option-a', 'option-b']);
  assert.match(question.reviewFlags.join(' '), /could not be represented as one of the four internal answer choices/);
});

test('switches language views without changing question identity or answer mapping', () => {
  const result = validateQuestionBankText(schemaV2Bank());
  assert.ok(result.bank, result.errors.join('\n'));
  const question = result.bank.questions[0];
  const originalAnswer = question.answerKey;
  const english = getQuestionLanguageView(question, 'en');
  const hindi = getQuestionLanguageView(question, 'hi');

  assert.equal(english.questionId, 'q-v2-1');
  assert.equal(hindi.questionId, 'q-v2-1');
  assert.equal(english.question, 'English question?');
  assert.equal(english.options.B, 'English B');
  assert.equal(english.explanation, 'English explanation.');
  assert.equal(english.solution, 'English solution.');
  assert.equal(hindi.question, 'हिंदी प्रश्न?');
  assert.equal(hindi.options.B, 'हिंदी B');
  assert.equal(hindi.explanation, 'हिंदी व्याख्या।');
  assert.equal(hindi.solution, 'हिंदी समाधान।');
  assert.equal(hindi.questionFallback, false);
  assert.equal(hindi.optionsFallback, false);
  assert.equal(hindi.explanationFallback, false);
  assert.equal(hindi.solutionFallback, false);
  assert.equal(question.answerKey, originalAnswer);
  assert.equal(question.schemaV2?.marks, 4);
});

test('renders imported questions as one set of interactive answer options', () => {
  const result = validateQuestionBankText(schemaV2Bank());
  assert.ok(result.bank, result.errors.join('\n'));
  const question = result.bank.questions[0];
  const markup = renderToStaticMarkup(React.createElement(QuestionBankViewer, {
    question,
    questionNumber: 1,
    totalQuestions: 1,
    selectedOption: 'B',
    status: 'answered',
    onSelectOption: () => undefined,
    onSaveAndNext: () => undefined,
    onMarkForReviewAndNext: () => undefined,
    onClearResponse: () => undefined,
    onPrevious: () => undefined,
    onNext: () => undefined,
  }));

  assert.equal((markup.match(/role="radio"/g) || []).length, 4);
  assert.equal((markup.match(/aria-checked="true"/g) || []).length, 1);
  assert.match(markup, /Manual review required/);
  assert.match(markup, /English A/);
  assert.doesNotMatch(markup, /Select Your Response:/);
  assert.match(markup, /Save &amp; Next/);
  assert.match(markup, /Mark for Review &amp; Next/);
  assert.match(markup, /Clear Response/);
  assert.ok(markup.indexOf('Save &amp; Next') < markup.indexOf('Mark for Review &amp; Next'));
  assert.ok(markup.indexOf('Mark for Review &amp; Next') < markup.indexOf('Clear Response'));
  assert.ok(markup.indexOf('Clear Response') < markup.indexOf('Previous'));
});

test('hides only the manual-review warning for active Custom Test questions', () => {
  const question = validateQuestionBankText(schemaV2Bank()).bank?.questions[0];
  assert.ok(question);
  assert.equal(question.reviewRequired, true);
  const markup = renderToStaticMarkup(React.createElement(QuestionBankViewer, {
    question,
    questionNumber: 1,
    totalQuestions: 1,
    showManualReviewWarning: false,
    selectedOption: null,
    status: 'not_answered',
    onSelectOption: () => undefined,
    onSaveAndNext: () => undefined,
    onMarkForReviewAndNext: () => undefined,
    onClearResponse: () => undefined,
    onPrevious: () => undefined,
    onNext: () => undefined,
  }));

  assert.doesNotMatch(markup, /Manual review required|Missing\/uncertain:/);
  assert.doesNotMatch(markup, /border-amber-200 bg-amber-50 p-3/);
  assert.match(markup, /English A/);
  assert.match(markup, /Save &amp; Next/);
  assert.match(markup, /Mark for Review &amp; Next/);
  assert.match(markup, /Question 1 of 1/);
});

test('routes legacy question-paper options through the shared answer handler', () => {
  const question = getBank().questions[0];
  const selected: string[] = [];
  const tree = QuestionBankViewer({
    question,
    questionNumber: 1,
    totalQuestions: 9,
    selectedOption: null,
    status: 'not_visited',
    onSelectOption: (option) => selected.push(option),
    onSaveAndNext: () => undefined,
    onMarkForReviewAndNext: () => undefined,
    onClearResponse: () => undefined,
    onPrevious: () => undefined,
    onNext: () => undefined,
  });
  const languageViews: Array<{ props: { onSelectOption?: (option: 'A' | 'B' | 'C' | 'D') => void } }> = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== 'object' || !('props' in node)) return;
    const element = node as { type?: unknown; props: { onSelectOption?: (option: 'A' | 'B' | 'C' | 'D') => void; children?: unknown } };
    if (element.type === QuestionLanguageView) languageViews.push(element);
    visit(element.props.children);
  };
  visit(tree);

  assert.equal(languageViews.length, 1);
  languageViews[0].props.onSelectOption?.('C');
  assert.deepEqual(selected, ['C']);
  assert.ok(question.answerKey === null || ['A', 'B', 'C', 'D'].includes(question.answerKey));
});

test('keeps imported options in the paper pane and removes the duplicate control-pane choices', () => {
  const question = validateQuestionBankText(schemaV2Bank()).bank?.questions[0];
  assert.ok(question);
  const callbacks = {
    onSelectOption: () => undefined,
    onSaveAndNext: () => undefined,
    onSaveAndMarkForReview: () => undefined,
    onMarkForReviewAndNext: () => undefined,
    onClearResponse: () => undefined,
    onPrevious: () => undefined,
    onNext: () => undefined,
  };
  const paper = renderToStaticMarkup(React.createElement(QuestionBankViewer, {
    question,
    questionNumber: 1,
    totalQuestions: 1,
    selectedOption: 'B',
    status: 'answered',
    ...callbacks,
  }));
  const control = renderToStaticMarkup(React.createElement(QuestionControl, {
    questionNumber: 1,
    totalQuestions: 1,
    sectionName: 'Physics',
    isDemoMode: false,
    examQuestion: question,
    selectedOption: 'B',
    status: 'answered',
    ...callbacks,
    showAnswerOptions: false,
  }));

  assert.equal((paper.match(/role="radio"/g) || []).length, 4);
  assert.match(paper, /Clear Response/);
  assert.equal((control.match(/role="radio"/g) || []).length, 0);
  assert.match(control, /Selected answer: B/);
  assert.match(paper, /aria-checked="true"/);
});

test('keeps the PDF response controls available without structured imported questions', () => {
  const markup = renderToStaticMarkup(React.createElement(QuestionControl, {
    questionNumber: 1,
    totalQuestions: 45,
    sectionName: 'Physics',
    isDemoMode: false,
    selectedOption: null,
    status: 'not_visited',
    onSelectOption: () => undefined,
    onSaveAndNext: () => undefined,
    onSaveAndMarkForReview: () => undefined,
    onMarkForReviewAndNext: () => undefined,
    onClearResponse: () => undefined,
    onPrevious: () => undefined,
    onNext: () => undefined,
  }));

  assert.equal((markup.match(/role="radio"/g) || []).length, 4);
  assert.match(markup, /Refer to Question/);
  assert.match(markup, /Save &amp; Next/);
  assert.match(markup, /Mark Review &amp; Next/);
});

test('renders the functional question-palette toggle in the PDF response header', () => {
  const markup = renderToStaticMarkup(React.createElement(QuestionControl, {
    questionNumber: 1,
    totalQuestions: 45,
    sectionName: 'Physics',
    isDemoMode: false,
    selectedOption: null,
    status: 'not_visited',
    isPaletteVisible: true,
    onTogglePalette: () => undefined,
    onSelectOption: () => undefined,
    onSaveAndNext: () => undefined,
    onSaveAndMarkForReview: () => undefined,
    onMarkForReviewAndNext: () => undefined,
    onClearResponse: () => undefined,
    onPrevious: () => undefined,
    onNext: () => undefined,
  }));
  assert.match(markup, /aria-label="Hide question palette"/);
  assert.match(markup, /aria-controls="pdf-question-palette"/);
  assert.match(markup, /bg-white text-slate-800/);
  assert.doesNotMatch(markup, /bg-slate-900 border-b lg:border-b-0 text-slate-100/);
});

test('falls back to English for missing Hindi fields without changing source metadata', () => {
  const v2 = JSON.parse(schemaV2Bank());
  delete v2.questions[0].languages.hi;
  const result = validateQuestionBankText(JSON.stringify(v2));
  assert.ok(result.bank, result.errors.join('\n'));
  const missingHindi = getQuestionLanguageView(result.bank.questions[0], 'hi');
  assert.equal(missingHindi.available, true);
  assert.equal(missingHindi.question, 'English question?');
  assert.equal(missingHindi.questionFallback, true);
  assert.deepEqual(missingHindi.options, { A: 'English A', B: 'English B', C: 'English C', D: 'English D' });
  assert.equal(missingHindi.optionsFallback, true);
  assert.equal(missingHindi.explanation, 'English explanation.');
  assert.equal(missingHindi.explanationFallback, true);
  assert.equal(missingHindi.solution, 'English solution.');
  assert.equal(missingHindi.solutionFallback, true);
  assert.equal(result.bank.questions[0].id, 'q-v2-1');
  assert.equal(result.bank.questions[0].answerKey, 'B');
  assert.equal((result.bank.questions[0].schemaV2?.languages as Record<string, unknown>).hi, undefined);

  const hindiOnly = JSON.parse(schemaV2Bank());
  delete hindiOnly.questions[0].languages.en;
  const hindiOnlyResult = validateQuestionBankText(JSON.stringify(hindiOnly));
  assert.ok(hindiOnlyResult.bank, hindiOnlyResult.errors.join('\n'));
  const missingEnglish = getQuestionLanguageView(hindiOnlyResult.bank.questions[0], 'en');
  const availableHindi = getQuestionLanguageView(hindiOnlyResult.bank.questions[0], 'hi');
  assert.equal(missingEnglish.available, false);
  assert.equal(missingEnglish.question, null);
  assert.equal(availableHindi.question, 'हिंदी प्रश्न?');
  assert.equal(availableHindi.options.B, 'हिंदी A');

  const legacy = getBank().questions[0];
  assert.equal(getQuestionLanguageView(legacy, 'en').question, legacy.questionEn);
  assert.equal(getQuestionLanguageView(legacy, 'hi').question, legacy.questionHi);
  assert.equal(getQuestionLanguageView(legacy, 'en').options.A, legacy.options.A.textEn);
});

test('uses complete English options when Hindi options are missing or incomplete', () => {
  for (const hindiOptions of [undefined, [
    { optionId: 'option-a', text: 'हिंदी A' },
    { optionId: 'option-b', text: 'हिंदी B' },
    { optionId: 'option-c', text: 'हिंदी C' },
  ]]) {
    const source = JSON.parse(schemaV2Bank());
    if (hindiOptions === undefined) delete source.questions[0].languages.hi.options;
    else source.questions[0].languages.hi.options = hindiOptions;

    const result = validateQuestionBankText(JSON.stringify(source));
    assert.ok(result.bank, result.errors.join('\n'));
    const hindi = getQuestionLanguageView(result.bank.questions[0], 'hi');
    assert.equal(hindi.optionsFallback, true);
    assert.deepEqual(hindi.options, { A: 'English A', B: 'English B', C: 'English C', D: 'English D' });
    assert.deepEqual(
      (result.bank.questions[0].schemaV2?.languages as Record<string, Record<string, unknown>>).hi.options,
      hindiOptions,
    );
  }
});

test('falls back field-by-field for blank Hindi questions and option text', () => {
  const source = JSON.parse(schemaV2Bank());
  source.questions[0].languages.hi.question = '  ';
  source.questions[0].languages.hi.options[0].text = '';
  source.questions[0].languages.hi.options[1].text = null;
  const result = validateQuestionBankText(JSON.stringify(source));
  assert.ok(result.bank, result.errors.join('\n'));
  const question = result.bank.questions[0];
  const hindi = getQuestionLanguageView(question, 'hi');
  assert.equal(hindi.question, 'English question?');
  assert.equal(hindi.questionFallback, true);
  assert.equal(hindi.options.A, 'English A');
  assert.equal(hindi.options.B, 'English B');
  assert.equal(hindi.options.C, 'हिंदी C');
  assert.equal(hindi.options.D, 'हिंदी D');
  assert.equal(hindi.optionsFallback, true);
  assert.equal(hindi.questionId, 'q-v2-1');
  assert.equal(question.answerKey, 'B');
});

test('retains the shared same-ID answer key for bilingual questions without guessing missing answers', () => {
  const imported = validateQuestionBankText(schemaV2Bank()).bank?.questions[0];
  assert.ok(imported);
  assert.equal(imported.id, 'q-v2-1');
  assert.equal(imported.answerKey, 'B');
  assert.equal(imported.questionEn, 'English question?');
  assert.equal(imported.questionHi, 'हिंदी प्रश्न?');
  assert.equal(getQuestionLanguageView(imported, 'hi').options.B, 'हिंदी B');
  assert.equal(getOptionDisplayLabel(imported.answerKey, 'hi'), '२');

  const withoutAnswer = JSON.parse(schemaV2Bank());
  delete withoutAnswer.questions[0].correctAnswer;
  const missingAnswer = validateQuestionBankText(JSON.stringify(withoutAnswer)).bank?.questions[0];
  assert.ok(missingAnswer);
  assert.equal(missingAnswer.id, imported.id);
  assert.equal(missingAnswer.questionHi, imported.questionHi);
  assert.equal(missingAnswer.answerKey, null);
});

test('shows clear unavailable messages without rendering literal null or undefined', () => {
  const question = {
    ...getBank().questions[0],
    questionEn: '',
    questionHi: null,
    options: {
      A: { textEn: '', textHi: null },
      B: { textEn: '', textHi: null },
      C: { textEn: '', textHi: null },
      D: { textEn: '', textHi: null },
    },
  };
  const view = getQuestionLanguageView(question, 'en');
  const markup = renderToStaticMarkup(React.createElement(QuestionLanguageView, { question }));
  assert.equal(view.questionUnavailableInBothLanguages, true);
  assert.ok(Object.values(view.optionsUnavailableInBothLanguages).every(Boolean));
  assert.match(markup, /Question text and answer choices are unavailable in English and Hindi/);
  assert.doesNotMatch(markup, />\s*(?:null|undefined)\s*</);
  assert.doesNotMatch(markup, /empty option card/i);
});

test('falls back independently for Hindi explanation and solution and omits both when unavailable', () => {
  const source = JSON.parse(schemaV2Bank());
  source.questions[0].languages.hi.question = null;
  source.questions[0].languages.hi.explanation = null;
  source.questions[0].languages.hi.solution = '';
  const result = validateQuestionBankText(JSON.stringify(source));
  assert.ok(result.bank, result.errors.join('\n'));
  const hindiView = getQuestionLanguageView(result.bank.questions[0], 'hi');
  assert.equal(hindiView.question, 'English question?');
  assert.equal(hindiView.questionFallback, true);
  assert.equal(hindiView.explanation, 'English explanation.');
  assert.equal(hindiView.explanationFallback, true);
  assert.equal(hindiView.solution, 'English solution.');
  assert.equal(hindiView.solutionFallback, true);
  assert.equal(hindiView.optionsFallback, false);

  delete source.questions[0].languages.en.explanation;
  delete source.questions[0].languages.en.solution;
  const neitherHasFields = validateQuestionBankText(JSON.stringify(source));
  assert.ok(neitherHasFields.bank, neitherHasFields.errors.join('\n'));
  const noExplanationOrSolution = getQuestionLanguageView(neitherHasFields.bank.questions[0], 'hi');
  assert.equal(noExplanationOrSolution.explanation, null);
  assert.equal(noExplanationOrSolution.solution, null);
  assert.equal(noExplanationOrSolution.explanationUnavailable, false);
  assert.equal(noExplanationOrSolution.solutionUnavailable, false);
});

test('accepts schema v2 questions without optional images', () => {
  const source = JSON.parse(schemaV2Bank());
  delete source.questions[0].images;
  const result = validateQuestionBankText(JSON.stringify(source));
  assert.ok(result.bank, result.errors.join('\n'));
  assert.equal(result.bank.questions[0].id, 'q-v2-1');
  assert.equal(result.bank.questions[0].images, undefined);
});

test('reports unsupported schema versions and malformed v2 questions clearly', () => {
  assert.match(
    validateQuestionBankText(JSON.stringify({ schemaVersion: 3, questions: [] })).errors.join(' '),
    /accepts schemaVersion 2 or the legacy schema_version "1\.0"/,
  );
  const malformed = JSON.parse(schemaV2Bank());
  malformed.questions[0].languages.en.options.pop();
  const result = validateQuestionBankText(JSON.stringify(malformed));
  assert.equal(result.bank, null);
  assert.match(result.errors.join(' '), /languages\.en\.options must contain exactly four options/);
});

test('reports malformed JSON, unsupported schema, empty banks, bad options and duplicate IDs', () => {
  assert.match(validateQuestionBankText('{').errors[0], /Invalid JSON/);

  const unsupported = JSON.parse(fixtureText);
  unsupported.schema_version = '1.0-draft';
  assert.match(validateQuestionBankText(JSON.stringify(unsupported)).errors.join(' '), /Unsupported schema_version/);

  const empty = JSON.parse(fixtureText);
  empty.questions = [];
  assert.match(validateQuestionBankText(JSON.stringify(empty)).errors.join(' '), /empty/);

  const malformed = JSON.parse(fixtureText);
  delete malformed.questions[0].options.D;
  const malformedResult = validateQuestionBankText(JSON.stringify(malformed));
  assert.equal(malformedResult.bank, null);
  assert.equal(malformedResult.summary.rejectedQuestions, 1);
  assert.match(malformedResult.errors.join(' '), /exactly A, B, C, and D/);

  const duplicate = JSON.parse(fixtureText);
  duplicate.questions[1].id = duplicate.questions[0].id;
  const duplicateResult = validateQuestionBankText(JSON.stringify(duplicate));
  assert.equal(duplicateResult.bank, null);
  assert.match(duplicateResult.errors.join(' '), /duplicates/);

  const duplicateContent = JSON.parse(fixtureText);
  duplicateContent.questions[1] = {
    ...duplicateContent.questions[1],
    question_en: duplicateContent.questions[0].question_en,
    options: structuredClone(duplicateContent.questions[0].options),
  };
  const duplicateContentResult = validateQuestionBankText(JSON.stringify(duplicateContent));
  assert.equal(duplicateContentResult.bank, null);
  assert.match(duplicateContentResult.errors.join(' '), /duplicates question content/);

  const missingImage = JSON.parse(fixtureText);
  missingImage.questions[0].images.question_en = 'diagram.png';
  const imageResult = validateQuestionBankText(JSON.stringify(missingImage));
  assert.ok(imageResult.bank, imageResult.errors.join('\n'));
  assert.match(imageResult.bank.questions[0].missingContent.join(' '), /Image "diagram\.png" could not be loaded/);
});

test('accepts a legacy question bank with no image fields or image asset list', () => {
  const bank = JSON.parse(fixtureText);
  delete bank.image_assets;
  bank.questions.forEach((question: Record<string, unknown>) => { delete question.images; });
  const result = validateQuestionBankText(JSON.stringify(bank));
  assert.ok(result.bank, result.errors.join('\n'));
  assert.equal(result.bank.questions.length, 9);
  assert.ok(result.bank.questions.every((question) => question.images === undefined));
});

test('parses embedded question, option, and explanation images from valid Base64 data URIs', () => {
  const result = validateQuestionBankText(bankWithEmbeddedImages());
  assert.ok(result.bank, result.errors.join('\n'));
  const question = result.bank.questions[0];
  assert.equal(question.images?.length, 3);
  assert.equal(question.images?.find((image) => image.type === 'question')?.alt, 'A small figure');
  assert.equal(question.images?.find((image) => image.type === 'option')?.option, 'A');
  assert.equal(question.images?.find((image) => image.type === 'explanation')?.caption, 'Worked explanation');
});

test('resolves direct embedded PNG and JPEG references and renders the decoded image sources', async () => {
  const pngUri = `data:image/png;base64,${embeddedPng}`;
  const jpegUri = `data:image/jpeg;base64,${embeddedJpeg}`;
  const bank = JSON.parse(fixtureText);
  bank.image_assets = [];
  bank.questions[0].images = {
    question_en: pngUri,
    question_hi: pngUri,
    options: [jpegUri, null, null, null],
    explanation: pngUri,
  };

  const result = validateQuestionBankText(JSON.stringify(bank));
  assert.ok(result.bank, result.errors.join('\n'));
  const question = result.bank.questions[0];
  assert.equal(question.images?.length, 3);
  assert.equal(question.images?.find((image) => image.type === 'question')?.dataUri, pngUri);
  assert.equal(question.images?.find((image) => image.type === 'option')?.dataUri, jpegUri);
  assert.equal(question.images?.find((image) => image.type === 'explanation')?.dataUri, pngUri);
  assert.doesNotMatch(question.missingContent.join(' '), /could not be loaded|could not be resolved/);

  const markup = renderToStaticMarkup(React.createElement(QuestionLanguageView, { question }));
  assert.match(markup, /<img[^>]+src="data:image\/png;base64,/);
  assert.match(markup, /<img[^>]+src="data:image\/jpeg;base64,/);
  const pngImage = await loadImage(Buffer.from(pngUri.slice(pngUri.indexOf(',') + 1), 'base64'));
  const jpegImage = await loadImage(Buffer.from(jpegUri.slice(jpegUri.indexOf(',') + 1), 'base64'));
  assert.ok(pngImage.width > 0 && pngImage.height > 0);
  assert.ok(jpegImage.width > 0 && jpegImage.height > 0);
});

test('reports malformed direct embedded image data while keeping the question', () => {
  const bank = JSON.parse(fixtureText);
  bank.image_assets = [];
  bank.questions[0].images.question_en = 'data:image/jpeg;base64,not-base64!';

  const result = validateQuestionBankText(JSON.stringify(bank));
  assert.ok(result.bank, result.errors.join('\n'));
  const question = result.bank.questions[0];
  assert.equal(question.id, bank.questions[0].id);
  assert.equal(question.images, undefined);
  assert.match(question.missingContent.join(' '), /Embedded image data URI could not be loaded/);
  assert.match(question.missingContent.join(' '), /valid Base64 data/);
});

test('resolves direct embedded data URIs in schema v2 image fields', () => {
  const source = JSON.parse(schemaV2Bank());
  const pngUri = `data:image/png;base64,${embeddedPng}`;
  source.questions[0].images = { question: pngUri };
  const result = validateQuestionBankText(JSON.stringify(source));
  assert.ok(result.bank, result.errors.join('\n'));
  const question = result.bank.questions[0];
  assert.equal(question.images?.[0].dataUri, pngUri);
  assert.equal(question.images?.[0].type, 'question');
  assert.doesNotMatch(question.missingContent.join(' '), /could not be loaded/);
});

test('accepts full image metadata inline on a question without separate asset files', () => {
  const bank = JSON.parse(fixtureText);
  bank.image_assets = [];
  bank.questions[0].images.question_en = {
    id: 'inline-figure',
    type: 'question',
    mimeType: 'image/png',
    dataUri: `data:image/png;base64,${embeddedPng}`,
    alt: 'Inline question figure',
    caption: 'Embedded directly on the question',
  };
  const result = validateQuestionBankText(JSON.stringify(bank));
  assert.ok(result.bank, result.errors.join('\n'));
  assert.equal(result.bank.questions[0].images?.[0].id, 'inline-figure');
  assert.equal(result.bank.questions[0].images?.[0].alt, 'Inline question figure');
});

test('continues resolving supported legacy external image paths and URLs', () => {
  const bank = JSON.parse(fixtureText);
  bank.image_assets = [
    { id: 'legacy-diagram', type: 'question', path: 'https://example.org/diagram.png', alt: 'External diagram' },
  ];
  bank.questions[0].images.question_en = 'https://example.org/diagram.png';
  const result = validateQuestionBankText(JSON.stringify(bank));
  assert.ok(result.bank, result.errors.join('\n'));
  assert.equal(result.bank.questions[0].images?.[0].src, 'https://example.org/diagram.png');
});

test('keeps valid questions when supplied image metadata or bytes are invalid', () => {
  const base = JSON.parse(bankWithEmbeddedImages());
  base.image_assets[0].mimeType = 'image/svg+xml';
  const badMime = validateQuestionBankText(JSON.stringify(base));
  assert.ok(badMime.bank, badMime.errors.join('\n'));
  assert.match(badMime.bank.questions[0].missingContent.join(' '), /could not be loaded/);

  const malformed = JSON.parse(bankWithEmbeddedImages());
  malformed.image_assets[0].dataUri = 'data:image/gif;base64,not-base64!';
  assert.ok(validateQuestionBankText(JSON.stringify(malformed)).bank);

  const wrongSignature = JSON.parse(bankWithEmbeddedImages());
  wrongSignature.image_assets[0].dataUri = 'data:image/png;base64,AAAA';
  wrongSignature.image_assets[0].mimeType = 'image/png';
  assert.ok(validateQuestionBankText(JSON.stringify(wrongSignature)).bank);

  const promptOnly = JSON.parse(bankWithEmbeddedImages());
  delete promptOnly.image_assets[0].dataUri;
  promptOnly.image_assets[0].prompt = 'A leaf diagram';
  assert.ok(validateQuestionBankText(JSON.stringify(promptOnly)).bank);
});

test('accepts valid question-bank JSON larger than the former 4 MiB limit', () => {
  const largerThanOldLimit = JSON.parse(fixtureText);
  largerThanOldLimit.importer_metadata = 'x'.repeat(4 * 1024 * 1024 + 16);
  const largeValidBank = validateQuestionBankText(JSON.stringify(largerThanOldLimit));
  assert.ok(largeValidBank.bank, largeValidBank.errors.join('\n'));
  assert.equal(largeValidBank.bank.questions.length, 9);
});

test('reports actionable storage quota failures for large question banks', () => {
  const quotaError = new Error('quota exceeded');
  quotaError.name = 'QuotaExceededError';
  assert.match(formatQuestionBankStorageError(quotaError, 80 * 1024 * 1024), /80 MiB bank was not saved/);
  assert.match(formatQuestionBankStorageError(quotaError, 80 * 1024 * 1024), /split the bank into smaller JSON files/);
});

test('enforces per-image decoded size limits', () => {
  const pngHeader = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const perImageBytes = Buffer.concat([pngHeader, Buffer.alloc(QUESTION_BANK_MAX_IMAGE_BYTES)]);
  const oversizedSingle = JSON.parse(fixtureText);
  oversizedSingle.image_assets = [{
    id: 'too-large',
    type: 'question',
    mimeType: 'image/png',
    dataUri: `data:image/png;base64,${perImageBytes.toString('base64')}`,
    alt: 'large image',
    caption: null,
  }];
  oversizedSingle.questions[0].images.question_en = 'too-large';
  const result = validateQuestionBankText(JSON.stringify(oversizedSingle));
  assert.ok(result.bank, result.errors.join('\n'));
  assert.match(result.bank.questions[0].missingContent.join(' '), /could not be loaded/);
});

test('warns and skips undecodable imported images without rejecting the question bank', async () => {
  const bank = validateQuestionBankText(bankWithEmbeddedImages()).bank;
  assert.ok(bank);
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap');
  let closed = false;
  Object.defineProperty(globalThis, 'createImageBitmap', {
    configurable: true,
    value: async () => ({ close: () => { closed = true; } }),
  });
  try {
    await validateQuestionBankImageDecoding(bank);
    assert.equal(closed, true);

    Object.defineProperty(globalThis, 'createImageBitmap', {
      configurable: true,
      value: async () => { throw new Error('undecodable'); },
    });
    await validateQuestionBankImageDecoding(bank);
    assert.ok(bank.questions[0].missingContent.some((warning) => /could not be decoded/.test(warning)));
    assert.ok(!bank.questions[0].images?.some((image) => image.id === 'question-figure'));
  } finally {
    if (previous) Object.defineProperty(globalThis, 'createImageBitmap', previous);
    else Reflect.deleteProperty(globalThis, 'createImageBitmap');
  }
});

test('generates filtered practice sets and rejects empty or insufficient selections', () => {
  const bank = getBank();
  const topic = bank.questions[0].topic;
  const filtered = generatePracticeQuestions(bank, 'Physics', topic, 2);
  assert.equal(filtered.length, 2);
  assert.ok(filtered.every((question) => question.subject === 'Physics' && question.topic === topic));
  const searched = generatePracticeQuestions(bank, 'Physics', 'All', 1, false, 'motorcycle');
  assert.match(searched[0].questionEn, /motorcycle/i);
  assert.throws(() => generatePracticeQuestions(bank, 'Biology', 'All', 1), /No questions match/);
  assert.throws(() => generatePracticeQuestions(bank, 'Physics', topic, 20), /Only .* questions match/);
  assert.throws(() => generatePracticeQuestions(bank, 'Physics', topic, 0), /positive integer/);
});

test('randomly samples matching bank questions without changing their IDs or answer keys', () => {
  const bank = getBank();
  const selected = generatePracticeQuestions(bank, 'Physics', 'All', 4, true, '', () => 0);
  assert.equal(selected.length, 4);
  assert.equal(new Set(selected.map((question) => question.id)).size, 4);
  for (const question of selected) {
    const original = bank.questions.find((entry) => entry.id === question.id);
    assert.ok(original);
    assert.equal(question.answerKey, original.answerKey);
    assert.deepEqual(question.options, original.options);
  }
});

test('renders inline and display TeX while preserving plain and malformed source text', () => {
  const segments = splitMathText('Energy $E=mc^2$ remains text. $$\\frac{1}{2}mv^2$$');
  assert.deepEqual(segments.map((segment) => segment.kind), ['text', 'math', 'text', 'math']);
  assert.equal(segments[1].displayMode, false);
  assert.equal(segments[3].displayMode, true);
  assert.match(segments[1].content, /katex/);
  assert.equal(segments[0].content, 'Energy ');
  assert.equal(segments[2].content, ' remains text. ');

  const malformed = splitMathText('Keep literal: $\\notacommand{$');
  assert.deepEqual(malformed, [{ kind: 'text', content: 'Keep literal: $\\notacommand{$' }]);
});

test('persists and reloads validated question banks locally', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map<string, string>();
  const source = JSON.parse(bankWithEmbeddedImages());
  source.questions[0].topic = 'Persisted schema 1 topic';
  const sourceText = JSON.stringify(source);
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });

  try {
    const firstSave = saveQuestionBank('physics.json', sourceText);
    assert.equal(firstSave.banks.length, 1);
    const loaded = readStoredQuestionBanks();
    assert.equal(loaded.error, null);
    assert.equal(loaded.banks[0].fileName, 'physics.json');
    assert.equal(loaded.banks[0].bank.questions.length, 9);
    assert.equal(loaded.banks[0].sourceText, sourceText);
    assert.equal(loaded.banks[0].bank.questions[0].topicName, 'Persisted schema 1 topic');
    assert.equal(getBuilderQuestionMetadata(loaded.banks[0].bank.questions[0]).topic, 'Persisted schema 1 topic');
    assert.equal(loaded.banks[0].bank.questions[0].images?.[0].dataUri, `data:image/png;base64,${embeddedPng}`);
    const exportedAndReimported = validateQuestionBankText(loaded.banks[0].sourceText);
    assert.equal(exportedAndReimported.bank?.questions[0].images?.length, 3);

    saveQuestionBank('physics.json', sourceText);
    assert.equal(readStoredQuestionBanks().banks.length, 1);

    values.set('oinkie_prep_question_banks_v1', '{broken');
    assert.match(readStoredQuestionBanks().error || '', /invalid JSON/);
    assert.throws(() => saveQuestionBank('chemistry.json', fixtureText), /invalid JSON/);
    assert.equal(values.get('oinkie_prep_question_banks_v1'), '{broken');
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('revalidates stored schema v2 banks after a reload without splitting languages or IDs', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map<string, string>();
  const sourceText = schemaV2Bank();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });

  try {
    saveQuestionBank('bilingual-v2.json', sourceText);
    const loaded = readStoredQuestionBanks();
    assert.equal(loaded.error, null);
    assert.equal(loaded.banks.length, 1);
    assert.equal(loaded.banks[0].sourceText, sourceText);
    assert.equal(loaded.banks[0].bank.questions.length, 1);
    assert.equal(loaded.banks[0].bank.questions[0].id, 'q-v2-1');
    assert.deepEqual(
      loaded.banks[0].bank.questions[0].schemaV2?.languages,
      JSON.parse(sourceText).questions[0].languages,
    );
    assert.equal(loaded.banks[0].bank.questions[0].questionHi, 'हिंदी प्रश्न?');
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('keeps imported answer keys untrusted until explicit source review', () => {
  const questions = getBank().questions.slice(0, 2);
  const unconfirmed = createImportedAnswerKey(questions, false);
  assert.equal(unconfirmed.key, null);
  assert.equal(unconfirmed.status, 'source-cited-unverified');

  const confirmed = createImportedAnswerKey(questions, true);
  assert.equal(confirmed.status, 'user-verified-import');
  assert.equal(confirmed.key?.[1], questions[0].answerKey);
  assert.equal(confirmed.key?.[2], questions[1].answerKey);

  const fullBankKey = createImportedAnswerKey(getBank().questions, false);
  assert.equal(fullBankKey.status, 'source-cited-unverified');
  const explicitlyAiFlagged = {
    ...questions[0],
    reviewFlags: [...questions[0].reviewFlags, 'AI-generated draft; compare against source'],
  };
  assert.equal(createImportedAnswerKey([explicitlyAiFlagged], false).status, 'ai-generated-review-required');
});

test('scores correct, incorrect, skipped and review-marked responses only against authorized keys', () => {
  const result = calculateExamResults(
    config(3),
    { 1: 'A', 2: 'B', 3: 'C' },
    { 1: 'answered_marked_for_review', 2: 'marked_for_review', 3: 'answered' },
    { 1: 'A', 2: 'D' },
    'user-verified-import'
  );
  assert.equal(result.totalScore, 3);
  assert.equal(result.totalCorrect, 1);
  assert.equal(result.totalIncorrect, 1);
  assert.equal(result.scoredQuestions, 2);
  assert.equal(result.maxPossibleScore, 8);
  assert.equal(result.totalMarkedForReview, 2);
  assert.equal(result.accuracy, 50);

  const skipped = calculateExamResults(
    config(2),
    { 1: null, 2: null },
    { 1: 'not_answered', 2: 'marked_for_review' },
    { 1: 'A', 2: 'B' },
    'user-provided'
  );
  assert.equal(skipped.totalScore, 0);
  assert.equal(skipped.totalUnattempted, 2);

  const untrusted = calculateExamResults(
    config(1),
    { 1: 'A' },
    { 1: 'answered' },
    { 1: 'A' },
    'source-cited-unverified'
  );
  assert.equal(untrusted.hasAnswerKey, false);
  assert.equal(untrusted.questionResults[0].marks, null);
});

test('counts forty-five questions once per section total', () => {
  const answerKey: Record<number, 'A'> = {};
  const answers: Record<number, 'A' | null> = {};
  const statuses: Record<number, 'answered' | 'not_visited'> = {};
  for (let questionNumber = 1; questionNumber <= 45; questionNumber++) {
    answerKey[questionNumber] = 'A';
    answers[questionNumber] = questionNumber <= 30 ? 'A' : null;
    statuses[questionNumber] = questionNumber <= 30 ? 'answered' : 'not_visited';
  }

  const results = calculateExamResults(
    config(45),
    answers,
    statuses,
    answerKey,
    'user-provided',
  );
  const physics = results.sectionStats.Physics;
  assert.ok(physics);
  assert.equal(physics.total, 45);
  assert.equal(physics.maxScore, 180);
  assert.equal(physics.attempted, 30);
  assert.equal(physics.unattempted, 15);
  assert.equal(physics.correct, 30);
});

test('custom tests score imported keys automatically, report missing keys, and retain PDF key prompts', () => {
  const source = JSON.parse(fixtureText);
  const imported = validateQuestionBankText(JSON.stringify(source));
  assert.ok(imported.bank, imported.errors.join('\n'));
  const questions = imported.bank.questions.slice(0, 3);
  const importedAnswerKey = getCustomTestImportedAnswerKey(questions);
  assert.deepEqual(importedAnswerKey, {
    1: questions[0].answerKey,
    2: questions[1].answerKey,
    3: questions[2].answerKey,
  });
  const customTestKeyStatus = 'custom-test-imported' as const;
  const expected = questions.map((question) => question.answerKey);
  expected.forEach((answer, index) => {
    assert.ok(answer);
    assert.equal(importedAnswerKey[index + 1], answer);
  });

  const customConfig = { ...config(3), sourceType: 'question-bank' as const, isCustomTest: true };
  const submittedAnswers = { 1: expected[0]!, 2: expected[1] === 'A' ? 'B' as const : 'A' as const, 3: null };
  const statuses = { 1: 'answered' as const, 2: 'answered' as const, 3: 'not_visited' as const };
  const fullKeyResults = calculateExamResults(
    customConfig,
    submittedAnswers,
    statuses,
    importedAnswerKey,
    customTestKeyStatus,
  );
  assert.equal(fullKeyResults.totalCorrect, 1);
  assert.equal(fullKeyResults.totalIncorrect, 1);
  assert.equal(fullKeyResults.totalUnattempted, 1);
  assert.equal(fullKeyResults.totalScore, 3);
  assert.equal(fullKeyResults.scoredQuestions, 3);

  const fullKeyMarkup = renderToStaticMarkup(React.createElement(ResultsView, {
    config: customConfig,
    userAnswers: submittedAnswers,
    statuses,
    initialAnswerKey: null,
    initialAnswerKeyStatus: 'none',
    examQuestions: questions,
    timeSpentSeconds: 120,
    onAnswerKeyChange: () => undefined,
    onRestart: () => undefined,
  }));
  assert.doesNotMatch(fullKeyMarkup, /Add a checked answer key to calculate the score/);
  assert.match(fullKeyMarkup, /3 \/ 12/);
  const automaticAnswerReport = buildAnswerReport(
    customConfig,
    submittedAnswers,
    statuses,
    importedAnswerKey,
    customTestKeyStatus,
    questions,
  );
  assert.deepEqual(
    automaticAnswerReport.questions.map((question) => question.correctAnswer),
    expected,
  );

  const partialQuestions = [questions[0], { ...questions[1], answerKey: null }, questions[2]];
  const partialKey = getCustomTestImportedAnswerKey(partialQuestions);
  assert.deepEqual(partialKey, { 1: expected[0], 3: expected[2] });
  const partialResults = calculateExamResults(
    customConfig,
    submittedAnswers,
    statuses,
    partialKey,
    customTestKeyStatus,
  );
  assert.equal(partialResults.totalCorrect, 1);
  assert.equal(partialResults.totalIncorrect, 0);
  assert.equal(partialResults.totalUnattempted, 1);
  assert.equal(partialResults.totalScore, 4);
  assert.equal(partialResults.scoredQuestions, 2);
  assert.equal(partialResults.maxPossibleScore, 8);
  assert.equal(partialResults.questionResults[1].correctAnswer, null);
  const partialMarkup = renderToStaticMarkup(React.createElement(ResultsView, {
    config: customConfig,
    userAnswers: submittedAnswers,
    statuses,
    initialAnswerKey: null,
    initialAnswerKeyStatus: 'none',
    examQuestions: partialQuestions,
    timeSpentSeconds: 120,
    onAnswerKeyChange: () => undefined,
    onRestart: () => undefined,
  }));
  assert.doesNotMatch(partialMarkup, /Add a checked answer key to calculate the score/);
  assert.match(partialMarkup, /2 of 3 questions/);
  assert.match(partialMarkup, /No usable answer key is available for question\(s\) 2/);

  const noKeyMarkup = renderToStaticMarkup(React.createElement(ResultsView, {
    config: customConfig,
    userAnswers: submittedAnswers,
    statuses,
    initialAnswerKey: null,
    initialAnswerKeyStatus: 'none',
    examQuestions: questions.map((question) => ({ ...question, answerKey: null })),
    timeSpentSeconds: 120,
    onAnswerKeyChange: () => undefined,
    onRestart: () => undefined,
  }));
  assert.match(noKeyMarkup, /Add a checked answer key to calculate the score/);

  const pdfMarkup = renderToStaticMarkup(React.createElement(ResultsView, {
    config: { ...config(3), hasCustomPdf: true, sourceType: 'pdf' as const },
    userAnswers: submittedAnswers,
    statuses,
    initialAnswerKey: null,
    initialAnswerKeyStatus: 'none',
    examQuestions: [],
    timeSpentSeconds: 120,
    onAnswerKeyChange: () => undefined,
    onRestart: () => undefined,
  }));
  assert.match(pdfMarkup, /Add a checked answer key to calculate the score/);

  assert.equal(getOptionDisplayLabel('A', 'en'), 'A');
  assert.equal(getOptionDisplayLabel('B', 'hi'), '२');
  const hindiAnswerIndex = questions.findIndex((question) => question.answerKey === 'B');
  assert.ok(hindiAnswerIndex >= 0);
  const hindiResults = calculateExamResults(
    { ...config(questions.length), sourceType: 'question-bank' },
    { [hindiAnswerIndex + 1]: 'B' },
    { [hindiAnswerIndex + 1]: 'answered' },
    importedAnswerKey,
    customTestKeyStatus,
  );
  assert.equal(hindiResults.questionResults[hindiAnswerIndex].isCorrect, true);
  const customImportedKeyOnPdf = calculateExamResults(
    { ...config(questions.length), hasCustomPdf: true, sourceType: 'pdf' },
    { [hindiAnswerIndex + 1]: 'B' },
    { [hindiAnswerIndex + 1]: 'answered' },
    importedAnswerKey,
    customTestKeyStatus,
  );
  assert.equal(customImportedKeyOnPdf.hasAnswerKey, false);

  const schemaV2 = validateQuestionBankText(schemaV2Bank());
  assert.ok(schemaV2.bank, schemaV2.errors.join('\n'));
  const v2Question = schemaV2.bank.questions[0];
  assert.equal(v2Question.answerKey, 'B');
  const v2Key = getCustomTestImportedAnswerKey([v2Question]);
  const v2Result = calculateExamResults(
    { ...config(1), sourceType: 'question-bank', isCustomTest: true },
    { 1: 'B' },
    { 1: 'answered' },
    v2Key,
    customTestKeyStatus,
  );
  assert.equal(v2Result.totalCorrect, 1);
  assert.equal(v2Result.totalScore, 4);
});

test('preserves not-visited counts and renders the submitted Test Analysis dashboard', () => {
  const examConfig = config(3);
  const answers = { 1: 'A' as const, 2: null, 3: null };
  const statuses = { 1: 'answered' as const, 2: 'not_answered' as const, 3: 'not_visited' as const };
  const summary = calculateExamResults(
    examConfig,
    answers,
    statuses,
    { 1: 'A', 2: 'B', 3: 'C' },
    'user-provided',
  );
  assert.equal(summary.totalScore, 4);
  assert.equal(summary.maxPossibleScore, 12);
  assert.equal(summary.totalCorrect, 1);
  assert.equal(summary.totalIncorrect, 0);
  assert.equal(summary.totalUnattempted, 2);
  assert.equal(summary.questionResults[2].status, 'not_visited');

  const markup = renderToStaticMarkup(React.createElement(ResultsView, {
    config: examConfig,
    userAnswers: answers,
    statuses,
    initialAnswerKey: { 1: 'A', 2: 'B', 3: 'C' },
    initialAnswerKeyStatus: 'user-provided',
    examQuestions: [],
    timeSpentSeconds: 300,
    onAnswerKeyChange: () => undefined,
    onRestart: () => undefined,
  }));
  assert.match(markup, /OINKIE PREP · Test Analysis/);
  assert.match(markup, /class="results-page min-h-screen/);
  assert.match(markup, /Time Analysis/);
  assert.match(markup, /Attempt Analysis/);
  assert.match(markup, /Difficulty/);
  assert.match(markup, /Question Review/);
  assert.doesNotMatch(markup, /Rank Prediction|College Prediction|NTA cutoff/i);
});

test('validates persisted sessions and restores remaining time from a deadline', () => {
  const now = Date.now();
  const imageBank = validateQuestionBankText(bankWithEmbeddedImages()).bank;
  assert.ok(imageBank);
  const examQuestions = imageBank.questions.slice(0, 2);
  const saved = {
    config: config(2),
    timeRemainingSeconds: 1700,
    currentQuestion: 2,
    responses: {
      answers: { 1: 'B', 2: null },
      statuses: { 1: 'answered_marked_for_review', 2: 'marked_for_review' },
    },
    isSubmitted: false,
    startedAt: now - 100_000,
    deadlineAtMs: now + 1_700_000,
    answerKey: null,
    answerKeyStatus: 'source-cited-unverified',
    examQuestions,
  };
  const restored = validateAndNormalizeSession(saved);
  assert.ok(restored.session, restored.error || 'session should validate');
  assert.equal(restored.session.currentQuestion, 2);
  assert.equal(restored.session.responses.answers[1], 'B');
  assert.equal(restored.session.responses.statuses[1], 'answered_marked_for_review');
  assert.equal(restored.session.responses.answers[1], 'B');
  assert.equal(restored.session.responses.statuses[2], 'marked_for_review');
  assert.deepEqual(restored.session.examQuestions?.[0].images, examQuestions[0].images);
  assert.ok(restored.session.timeRemainingSeconds <= 1700);

  const bad = structuredClone(saved);
  bad.deadlineAtMs += 100_000_000;
  assert.match(validateAndNormalizeSession(bad).error || '', /deadline is invalid/);
  const badAnswer = structuredClone(saved);
  badAnswer.responses.answers[1] = 'Z';
  assert.match(validateAndNormalizeSession(badAnswer).error || '', /answer.*invalid/);
});

test('clamps deadline-based timer values and never returns negative time', () => {
  assert.equal(getDeadlineRemainingSeconds(0, 100, 10), 0);
  assert.equal(getDeadlineRemainingSeconds(20_000, 10, 10_000), 10);
  assert.equal(getDeadlineRemainingSeconds(15_500, 10, 10_000), 6);
});

test('rejects malformed, invalid, and out-of-range JSON answer keys instead of partially scoring', () => {
  assert.match(parseAnswerKeyInput('{"1":"A"', 3).errors.join(' '), /Invalid answer-key JSON/);
  assert.match(parseAnswerKeyInput('{"1":"A","4":"B"}', 3).errors.join(' '), /outside 1-3/);
  assert.match(parseAnswerKeyInput('{"1":"A","2":"X"}', 3).errors.join(' '), /must be A, B, C, D/);
  assert.deepEqual(parseAnswerKeyInput('{"1":"A","2":4}', 3).keyMap, { 1: 'A', 2: 'D' });
});

test('parses partial answer keys and rejects conflicting or out-of-range whitespace rows', () => {
  assert.deepEqual(parseAnswerKeyInput('2:C', 3).keyMap, { 2: 'C' });
  assert.deepEqual(parseAnswerKeyInput('1 A\n3 D', 3).keyMap, { 1: 'A', 3: 'D' });
  assert.deepEqual(parseAnswerKeyInput('1:A\n2 B', 3).keyMap, { 1: 'A', 2: 'B' });
  assert.match(parseAnswerKeyInput('1 A\n1 B', 3).errors.join(' '), /conflicting answers/);
  assert.match(parseAnswerKeyInput('4 A', 3).errors.join(' '), /outside 1-3/);
  assert.match(parseAnswerKeyInput('1:A 2:Z', 3).errors.join(' '), /must be A, B, C, D/);
  assert.match(parseAnswerKeyInput('1 A\n2 Z', 3).errors.join(' '), /must be A, B, C, D/);
  assert.match(parseAnswerKeyInput('ABCD', 3).errors.join(' '), /has 4 answers, but the exam has only 3/);
});

test('builds honest post-test reports with missing and partial keys', () => {
  const questions = getBank().questions.slice(0, 2);
  const answers = { 1: 'A' as const, 2: null };
  const statuses = { 1: 'answered' as const, 2: 'marked_for_review' as const };
  const noKey = buildAnswerReport(config(2), answers, statuses, null, 'none', questions);
  assert.equal(noKey.score, null);
  assert.equal(noKey.maxPossibleScore, null);
  assert.equal(noKey.keyCoverage, 0);
  assert.match(noKey.scoreNotice, /could not be determined/);
  assert.equal(noKey.questions[0].correctness, 'Not evaluated');
  assert.equal(noKey.questions[0].questionText, questions[0].questionEn);
  assert.ok(noKey.questions[0].options);
  assert.equal(noKey.questions[1].attemptStatus, 'Unanswered · Marked for review');
  assert.equal(noKey.questions[1].correctAnswer, null);

  const verifiedAnswer = questions[0].answerKey;
  assert.ok(verifiedAnswer);
  const partialKey = buildAnswerReport(
    config(2),
    answers,
    statuses,
    { 1: verifiedAnswer },
    'user-provided',
    questions
  );
  assert.equal(partialKey.keyCoverage, 1);
  assert.equal(partialKey.score, 4);
  assert.equal(partialKey.maxPossibleScore, 4);
  assert.match(partialKey.scoreNotice, /Partial answer key: 1 of 2/);
  assert.equal(partialKey.questions[0].correctness, 'Correct');
  assert.equal(partialKey.questions[1].correctness, 'Not evaluated');
  assert.equal(partialKey.questions[1].marks, null);
});

test('formats compact answer-first PDF status labels from stored response states only', () => {
  const labels = [
    formatAnswerReportStatus({ questionNumber: 1, userAnswer: 'A', reviewMarked: false }),
    formatAnswerReportStatus({ questionNumber: 2, userAnswer: 'C', reviewMarked: false }),
    formatAnswerReportStatus({ questionNumber: 3, userAnswer: 'A', reviewMarked: true }),
    formatAnswerReportStatus({ questionNumber: 4, userAnswer: 'B', reviewMarked: true }),
    formatAnswerReportStatus({ questionNumber: 5, userAnswer: null, reviewMarked: false }),
    formatAnswerReportStatus({ questionNumber: 6, userAnswer: null, reviewMarked: true }),
  ];
  assert.deepEqual(labels.map((row) => row.answerStatus), [
    'A',
    'C',
    'A — MARKED FOR REVIEW',
    'B — MARKED FOR REVIEW',
    'NOT ANSWERED',
    'NOT ANSWERED — MARKED FOR REVIEW',
  ]);
  assert.ok(labels.every((row) => !row.answerStatus.includes('SAVED')));
});

test('splits long answer reports into ordered pages without dropping question rows', () => {
  const rows = Array.from({ length: 180 }, (_, index) => ({
    questionNumber: index + 1,
    answerStatus: index % 3 === 0 ? 'NOT ANSWERED — MARKED FOR REVIEW' : 'D',
  }));
  const pages = paginateAnswerReportRows(rows, 15);
  const flattened = pages.flat();
  assert.equal(pages.length, 12);
  assert.deepEqual(flattened, rows);
  assert.equal(flattened[0].questionNumber, 1);
  assert.equal(flattened.at(-1)?.questionNumber, 180);
  assert.throws(() => paginateAnswerReportRows(rows, 0), /positive integer/);
});

test('restores an expired session with zero time and does not extend its deadline', () => {
  const now = Date.now();
  const expired = {
    config: { ...config(1), sourceType: 'demo' as const },
    timeRemainingSeconds: 60,
    currentQuestion: 1,
    responses: { answers: { 1: null }, statuses: { 1: 'not_answered' } },
    isSubmitted: false,
    startedAt: now - 120_000,
    deadlineAtMs: now - 1,
    answerKey: null,
    answerKeyStatus: 'none',
  };
  const restored = validateAndNormalizeSession(expired);
  assert.ok(restored.session, restored.error || 'expired session should be recoverable');
  assert.equal(restored.session.timeRemainingSeconds, 0);
});

test('derives dashboard metrics only from submitted stored sessions and trusted keyed responses', () => {
  const questions = getBank().questions.slice(0, 2);
  const correctAnswer = questions[0].answerKey;
  assert.ok(correctAnswer);
  const session: ExamSessionState = {
    config: config(2),
    timeRemainingSeconds: 1200,
    currentQuestion: 2,
    responses: {
      answers: { 1: correctAnswer, 2: null },
      statuses: { 1: 'answered', 2: 'marked_for_review' },
    },
    isSubmitted: true,
    startedAt: 1_000,
    submittedAt: 2_000,
    answerKey: { 1: correctAnswer },
    answerKeyStatus: 'user-verified-import',
    examQuestions: questions,
  };
  const overview = getDashboardOverview([session]);
  assert.equal(overview.testCount, 1);
  assert.equal(overview.questionsSolved, 1);
  assert.equal(overview.totalTimeSeconds, 600);
  assert.equal(overview.averageAccuracy, 100);
  assert.equal(overview.accuracySampleSize, 1);
  assert.equal(overview.recentSessions[0].markedForReview, 1);
  assert.equal(overview.recentSessions[0].score, 4);
  assert.equal(overview.recentSessions[0].maxPossibleScore, 4);
  assert.equal(overview.subjects[0].questionsAttempted, 1);
  assert.equal(normalizeDashboardSubject('Zoology'), 'Biology');

  const dashboardMarkup = renderToStaticMarkup(React.createElement(
    ThemeProvider,
    null,
    React.createElement(Dashboard, {
      onNavigate: () => {},
      hasSavedSession: false,
      recoveryError: null,
      resumeError: null,
      isResuming: false,
      onResume: () => {},
      onDiscardSavedSession: () => {},
      completedSessions: [session],
      historyError: null,
      onOpenReport: () => {},
      isAdmin: false,
      onOpenAdmin: () => {},
    }),
  ));
  assert.match(dashboardMarkup, /id="dashboard-top" class="flex min-h-screen w-full/);
  assert.match(dashboardMarkup, /Start practising/);
  assert.match(dashboardMarkup, /NEET PYQ Tests/);
  assert.doesNotMatch(dashboardMarkup, /Real NEET CBT Exam/);
  assert.doesNotMatch(dashboardMarkup, /Admin Controls/);
  assert.match(dashboardMarkup, /Import Paper/);
  assert.match(dashboardMarkup, /Custom Test/);
  assert.match(dashboardMarkup, /Question Bank/);
  assert.match(dashboardMarkup, /Switch to dark mode/);
  assert.match(dashboardMarkup, /Latest Score/);
  assert.match(dashboardMarkup, /4 \/ 4/);
  assert.match(dashboardMarkup, /id="study-resources"/);
  assert.match(dashboardMarkup, /No verified video resources are configured yet/);

  const adminDashboardMarkup = renderToStaticMarkup(React.createElement(
    ThemeProvider,
    null,
    React.createElement(Dashboard, {
      onNavigate: () => {},
      hasSavedSession: false,
      recoveryError: null,
      resumeError: null,
      isResuming: false,
      onResume: () => {},
      onDiscardSavedSession: () => {},
      completedSessions: [session],
      historyError: null,
      onOpenReport: () => {},
      isAdmin: true,
      onOpenAdmin: () => {},
    }),
  ));
  assert.match(adminDashboardMarkup, /Admin Controls/);
  const localDay = (daysAgo: number) => new Date(2026, 9, 20 - daysAgo, 12).getTime();
  assert.equal(getPracticeStreak([], localDay(0)), 0);
  assert.equal(getPracticeStreak([
    { ...session, submittedAt: localDay(0) },
    { ...session, submittedAt: localDay(1) },
    { ...session, submittedAt: localDay(1) },
    { ...session, submittedAt: localDay(2) },
  ], localDay(0)), 3);
  assert.equal(getPracticeStreak([{ ...session, submittedAt: localDay(3) }], localDay(0)), 0);

  const biologyOverview = getDashboardOverview([{
    ...session,
    examQuestions: questions.map((question) => ({ ...question, subject: 'Botany' })),
  }]);
  assert.equal(biologyOverview.subjects[0].name, 'Biology');
  assert.equal(biologyOverview.subjects[0].questionsAttempted, 1);

  const unscored = summarizeDashboardSession({
    ...session,
    answerKey: null,
    answerKeyStatus: 'none',
  });

  test('routes the NEET PYQ screen to an honest empty state when no pre-built papers exist', () => {
    const markup = renderToStaticMarkup(React.createElement(FeatureScreens, {
      screen: 'pyq-tests',
      sessions: [],
      onBack: () => undefined,
      onNavigate: () => undefined,
      onOpenReport: () => undefined,
      onStartTest: async () => undefined,
    }));
    assert.match(markup, /NEET PYQ Tests/);
    assert.match(markup, /No pre-built NEET PYQ papers are available yet/);
    assert.match(markup, /not identified as NEET PYQs/);
    assert.match(markup, /Open Custom Test Builder/);
    assert.doesNotMatch(markup, /NEET 20\d{2}|20\d{2} NEET/);
  });
  assert.equal(unscored.accuracy, null);
  assert.equal(unscored.score, null);
  assert.deepEqual(unscored.subjects, []);
});

test('renders metadata-backed NEET PYQ cards with their available paper details', () => {
  const source = JSON.parse(fixtureText);
  source.pyqPaper = {
    type: 'neet-pyq',
    title: 'NEET Previous-Year Paper',
    year: 2024,
    session: 'May',
    durationMinutes: 200,
    marks: 720,
  };
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storageValue = JSON.stringify([{
    id: 'neet-pyq-2024',
    fileName: 'neet-pyq.json',
    importedAt: 1,
    sourceText: JSON.stringify(source),
  }]);
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (key: string) => key === 'oinkie_prep_question_banks_v1' ? storageValue : null },
  });
  try {
    const markup = renderToStaticMarkup(React.createElement(FeatureScreens, {
      screen: 'pyq-tests',
      sessions: [],
      onBack: () => undefined,
      onNavigate: () => undefined,
      onOpenReport: () => undefined,
      onStartTest: async () => undefined,
    }));
    assert.match(markup, /NEET Previous-Year Paper/);
    assert.match(markup, /NEET 2024/);
    assert.match(markup, /May/);
    assert.match(markup, /Questions<\/dt><dd>9/);
    assert.match(markup, /200 minutes/);
    assert.match(markup, /720/);
    assert.match(markup, /Physics/);
    assert.match(markup, /View details &amp; instructions/);
  } finally {
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('stores completed dashboard history without duplicating the same submitted session', () => {
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    clear: () => values.clear(),
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    get length() { return values.size; },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage as Storage,
  });

  try {
    const questions = getBank().questions.slice(0, 1);
    const answerKey = questions[0].answerKey;
    assert.ok(answerKey);
    const session: ExamSessionState = {
      config: config(1),
      timeRemainingSeconds: 1000,
      currentQuestion: 1,
      responses: { answers: { 1: answerKey }, statuses: { 1: 'answered' } },
      isSubmitted: true,
      startedAt: 1_000,
      submittedAt: 2_000,
      answerKey: { 1: answerKey },
      answerKeyStatus: 'user-verified-import',
      examQuestions: questions,
    };
    recordCompletedSession(session);
    recordCompletedSession(session);
    const history = readDashboardHistory();
    assert.equal(history.error, null);
    assert.equal(history.sessions.length, 1);
    assert.equal(history.sessions[0].responses.answers[1], answerKey);
  } finally {
    if (originalStorage) {
      Object.defineProperty(globalThis, 'localStorage', originalStorage);
    } else {
      Reflect.deleteProperty(globalThis, 'localStorage');
    }
  }
});

test('persists bookmarks, notes, flashcards, and syllabus progress locally', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    },
  });

  try {
    const question = getBank().questions[0];
    saveBookmarks([{ id: 'Physics:q1', question, savedAt: 10 }]);
    saveStudyNotes([{ id: 'note-1', title: 'Forces', body: 'Review free-body diagrams', updatedAt: 11 }]);
    saveStudyFlashcards([{ id: 'card-1', front: 'Newton’s second law', back: 'F = ma', createdAt: 12 }]);
    saveSyllabusProgress(['Physics::Mechanics']);

    assert.equal(readBookmarks().items[0].question.id, question.id);
    assert.equal(readStudyNotes().items[0].body, 'Review free-body diagrams');
    assert.equal(readStudyFlashcards().items[0].back, 'F = ma');
    assert.deepEqual(readSyllabusProgress().items, ['Physics::Mechanics']);

    values.set('oinkie_prep_notes_v1', '{broken');
    assert.match(readStudyNotes().error || '', /invalid JSON/);
    assert.equal(values.get('oinkie_prep_notes_v1'), '{broken');
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('requires an explicit valid UUID and isolates local values by account', () => {
  const ownerA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const ownerB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  });

  try {
    assert.equal(validateOwnerId(ownerA), ownerA);
    assert.notEqual(getAccountLocalStorageKey(ownerA, 'notes'), getAccountLocalStorageKey(ownerB, 'notes'));
    assert.throws(() => validateOwnerId(undefined), /valid account owner UUID/);
    assert.throws(() => validateOwnerId(''), /valid account owner UUID/);
    assert.throws(() => validateOwnerId('not-a-uuid'), /valid account owner UUID/);
    assert.throws(() => readAccountLocalValue('', 'notes'), /valid account owner UUID/);

    writeAccountLocalValue(ownerA, 'notes', 'A notes');
    writeAccountLocalValue(ownerB, 'notes', 'B notes');
    assert.equal(readAccountLocalValue(ownerA, 'notes'), 'A notes');
    assert.equal(readAccountLocalValue(ownerB, 'notes'), 'B notes');

    writeAccountLocalValue(ownerA, 'notes', 'Updated A notes');
    assert.equal(readAccountLocalValue(ownerA, 'notes'), 'Updated A notes');
    assert.equal(readAccountLocalValue(ownerB, 'notes'), 'B notes');

    removeAccountLocalValue(ownerA, 'notes');
    assert.equal(readAccountLocalValue(ownerA, 'notes'), null);
    assert.equal(readAccountLocalValue(ownerB, 'notes'), 'B notes');
  } finally {
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('keeps legacy localStorage data unchanged and inaccessible through account-scoped reads', () => {
  const ownerId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map<string, string>([
    ['neet_cbt_active_session_v1', '{"legacy":"active-session"}'],
    ['oinkie_prep_completed_sessions_v1', '[{"legacy":"history"}]'],
    ['oinkie_prep_bookmarks_v1', '[{"legacy":"bookmark"}]'],
    ['oinkie_prep_notes_v1', '[{"legacy":"note"}]'],
    ['oinkie_prep_flashcards_v1', '[{"legacy":"flashcard"}]'],
    ['oinkie_prep_syllabus_progress_v1', '["legacy-topic"]'],
    ['oinkie_prep_study_plan_v1', '[{"legacy":"task"}]'],
    ['oinkie_prep_question_banks_v1', '[{"legacy":"bank"}]'],
  ]);
  const originalValues = new Map(values);
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  });

  try {
    for (const key of originalValues.keys()) {
      assert.equal(readAccountLocalValue(ownerId, key), null);
    }
    assert.deepEqual(values, originalValues);
  } finally {
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('isolates account IndexedDB records and never opens the legacy database', async () => {
  const ownerA = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const ownerB = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const previousIndexedDb = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  const { factory, openedNames, databases } = createAccountIndexedDbTestDouble();
  const legacyPdfRecords = new Map<string, Record<string, unknown>>([
    ['legacy-pdf', { id: 'legacy-pdf', data: 'legacy PDF bytes' }],
  ]);
  const legacyStores = new Map<string, Map<string, Record<string, unknown>>>([['pdf_storage', legacyPdfRecords]]);
  databases.set('NeetCbtDatabase', legacyStores);
  const legacySnapshot = JSON.stringify([...legacyStores].map(([name, records]) => [name, [...records]]));
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: factory });

  try {
    for (const storeName of ACCOUNT_STORES) {
      await putAccountRecord(ownerA, storeName, { id: 'same-id', value: 'A' });
      await putAccountRecord(ownerB, storeName, { id: 'same-id', value: 'B' });
      assert.deepEqual(await getAccountRecord(ownerA, storeName, 'same-id'), { id: 'same-id', value: 'A' });
      assert.deepEqual(await getAccountRecord(ownerB, storeName, 'same-id'), { id: 'same-id', value: 'B' });
      assert.deepEqual(await getAllAccountRecords(ownerA, storeName), [{ id: 'same-id', value: 'A' }]);

      await putAccountRecord(ownerA, storeName, { id: 'same-id', value: 'Updated A', ownerId: ownerB });
      assert.deepEqual(await getAccountRecord(ownerA, storeName, 'same-id'), { id: 'same-id', value: 'Updated A' });
      assert.deepEqual(await getAccountRecord(ownerB, storeName, 'same-id'), { id: 'same-id', value: 'B' });

      await deleteAccountRecord(ownerA, storeName, 'same-id');
      assert.equal(await getAccountRecord(ownerA, storeName, 'same-id'), null);
      assert.deepEqual(await getAccountRecord(ownerB, storeName, 'same-id'), { id: 'same-id', value: 'B' });
    }

    assert.ok(openedNames.length > 0);
    assert.ok(openedNames.every((name) => name === ACCOUNT_DATABASE_NAME));
    assert.ok(!openedNames.map((name) => String(name)).includes('NeetCbtDatabase'));
    assert.equal(JSON.stringify([...legacyStores].map(([name, records]) => [name, [...records]])), legacySnapshot);
  } finally {
    if (previousIndexedDb) Object.defineProperty(globalThis, 'indexedDB', previousIndexedDb);
    else Reflect.deleteProperty(globalThis, 'indexedDB');
  }
});
