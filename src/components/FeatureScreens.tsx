import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  BookOpen,
  Bookmark,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  FlaskConical,
  Library,
  Plus,
  Search,
  Settings,
  Trash2,
  Upload,
  NotebookPen,
  Play,
  Target,
  TrendingUp,
  UserRound,
} from 'lucide-react';
import { ExamQuestion, ExamSessionState } from '../types/exam';
import { calculateExamResults } from '../utils/examLogic';
import {
  getDashboardOverview,
  getPracticeStreak,
  normalizeDashboardSubject,
  summarizeDashboardSession,
} from '../utils/dashboardHistory';
import {
  getQuestionBookmarkId,
  readBookmarks,
  readSyllabusProgress,
  readStudyFlashcards,
  readStudyNotes,
  saveBookmarks,
  saveSyllabusProgress,
  saveStudyFlashcards,
  saveStudyNotes,
  SavedBookmark,
  StudyFlashcard,
  StudyNote,
} from '../utils/studyToolsStorage';
import {
  filterPracticeQuestions,
  QUESTION_BANK_MAX_IMAGE_BYTES,
  QUESTION_BANK_MAX_TOTAL_IMAGE_BYTES,
  validateQuestionBankImageDecoding,
  ValidatedQuestionBank,
} from '../utils/questionBank';
import {
  clearStoredQuestionBanks,
  loadStoredQuestionBanks,
  readStoredQuestionBanks,
  saveQuestionBankFile,
  StoredQuestionBank,
} from '../utils/questionBankStorage';
import { formatFileSize, validateQuestionBankFile } from '../utils/questionBankImport';
import { getPrebuiltPyqPapers, PyqPaper } from '../utils/pyqPapers';
import { getActiveAccountOwnerId, getAccountLocalStorageKey } from '../utils/accountStorage';
import {
  countRemoteQuestions,
  fetchRemoteQuestions,
  getRemoteSourceLabel,
  getRemoteSourceSubjects,
  getRemoteSourceTable,
  REMOTE_QUESTION_SOURCES,
  type RemoteQuestionSource,
  type RemoteQuestionSubject,
} from '../utils/remoteQuestionBank';
import { MathText } from './MathText';
import { QuestionImages } from './QuestionImages';
import { QuestionLanguageView } from './QuestionLanguageView';
import { DashboardAction } from './Dashboard';
import {
  createCustomTestQuestions,
  filterCustomTestQuestions,
  getCustomTestConfigurationError,
  getBuilderChapterSelectionKeys,
  getBuilderQuestionMetadata,
  getBuilderSelectionState,
  getBuilderTopicKey,
  getUniqueBuilderQuestions,
  toggleBuilderSelection,
  BuilderClassLevel,
} from '../utils/customTestBuilder';

export type FeatureScreen = Exclude<DashboardAction, 'import-paper' | 'simulator'>;

interface FeatureScreensProps {
  screen: FeatureScreen;
  searchQuery?: string;
  sessions: ExamSessionState[];
  onBack: () => void;
  onNavigate: (screen: FeatureScreen, query?: string) => void;
  onOpenReport: (session: ExamSessionState) => void;
  onStartTest: (
    questions: ExamQuestion[],
    durationMinutes: number,
    title: string,
    useImportedAnswerKeys?: boolean,
  ) => Promise<void>;
}

const subjectTabs = ['All', 'Physics', 'Chemistry', 'Biology'] as const;
const subjectIcon: Record<string, React.ElementType> = {
  Physics: Activity,
  Chemistry: FlaskConical,
  Biology: BookOpen,
  Botany: BookOpen,
  Zoology: BookOpen,
};

export const questionBankTemplate = {
  schema_version: '1.0',
  source_pdf: { file_name: 'Your source document', total_pages: 1, subject: 'Physics' },
  image_assets: [],
  questions: [{
    id: 'q1',
    question_number: 1,
    chapter: 'Chapter',
    exercise: 'Practice',
    section: 'Section',
    source_page: 1,
    question_code: null,
    question_en: 'Replace with the question text.',
    question_hi: 'यहाँ प्रश्न का हिन्दी पाठ लिखें।',
    options: {
      A: { text_en: 'Option A', text_hi: 'विकल्प A' },
      B: { text_en: 'Option B', text_hi: 'विकल्प B' },
      C: { text_en: 'Option C', text_hi: 'विकल्प C' },
      D: { text_en: 'Option D', text_hi: 'विकल्प D' },
    },
    answer_key: null,
    answer_key_source: null,
    explanation_en: null,
    explanation_hi: null,
    formulas: [],
    images: { question_en: null, question_hi: null, options: [null, null, null, null], explanation: null },
    review_flags: [],
    missing_content: [],
  }],
};

const questionBankFieldGuide = `# OINKIE PREP question-bank JSON field guide

The downloadable JSON template is a valid text-only schema 1.0 starter bank. The importer also accepts schema v2 question banks. V2 languages remain attached to one question ID, and original v2 metadata is preserved even when it is not yet used by the interface. The template intentionally contains no sample image bytes.

## Embedded images

Put each real image in the root \`image_assets\` array. Each item must contain:

- \`id\`: unique asset identifier.
- \`type\`: \`question\`, \`option\`, or \`explanation\`.
- \`mimeType\`: \`image/png\`, \`image/jpeg\`, \`image/webp\`, or \`image/gif\`.
- \`dataUri\`: the complete Base64 data URI made from the actual image file (for example, generate it with a trusted Base64 encoder). Do not use a prompt, filename, shortened string, or placeholder as image bytes.
- \`alt\`: accessible description (use an empty string only for decorative images).
- \`caption\`: caption text or \`null\`.

Reference an asset by its \`id\` in that question's \`images.question_en\`, \`images.question_hi\`, one of the four \`images.options\` entries (A through D), or \`images.explanation\`. You may also put the complete image metadata object directly in one of those slots. Use \`null\` when a slot has no image. Explanation images are shown in previews and reports, not during an active test.

Supported import limits are ${formatFileSize(QUESTION_BANK_MAX_IMAGE_BYTES)} per image and ${formatFileSize(QUESTION_BANK_MAX_TOTAL_IMAGE_BYTES)} total embedded image bytes. There is no fixed JSON file-size limit. Images are checked for Base64 structure, MIME/signature consistency, and browser decoding. The complete JSON file (including embedded images) is saved as a Blob in IndexedDB.

JSON is read and parsed in a background worker, not streamed. Processing is subject to available browser memory and IndexedDB quota. If storage reports a quota error, export/remove saved banks or split the source into smaller JSON files and import them separately; the importer never truncates a bank.

Legacy \`path\` and HTTP(S) \`url\` assets can still be referenced when supplied as image-asset metadata, but those images are external dependencies and are not self-contained.`;

function downloadTextFile(fileName: string, content: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function matchesSubject(question: ExamQuestion, selected: string): boolean {
  return selected === 'All' ||
    normalizeDashboardSubject(question.subject).toLocaleLowerCase() === selected.toLocaleLowerCase();
}

function flattenQuestions(banks: StoredQuestionBank[]): ExamQuestion[] {
  return banks.flatMap(({ bank }) => bank.questions.map((question) => ({ ...question })));
}

function FeatureFrame({
  title,
  description,
  icon: Icon,
  onBack,
  children,
}: {
  title: string;
  description: string;
  icon: React.ElementType;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <main className="fixed inset-0 overflow-y-auto bg-slate-100 font-sans text-slate-900">
      <div className="mx-auto min-h-full max-w-6xl px-4 py-5 sm:px-7 sm:py-8">
        <button
          type="button"
          onClick={onBack}
          className="mb-5 inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-blue-200 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
        </button>
        <header className="mb-6 flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">{title}</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">{description}</p>
          </div>
        </header>
        {children}
      </div>
    </main>
  );
}

function Panel({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 ${className}`}>
      <h2 className="text-base font-extrabold">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm leading-6 text-slate-500">
      {children}
    </div>
  );
}

function BankImport({
  onImported,
}: {
  onImported: (bank: StoredQuestionBank) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const importFile = async (file?: File) => {
    if (!file) return;
    setError(null);
    setMessage(null);
    try {
      const validation = await validateQuestionBankFile(file, setProgress);
      if (!validation.bank) throw new Error(validation.errors.join(' '));
      setProgress('Checking embedded image decoding');
      await validateQuestionBankImageDecoding(validation.bank);
      setProgress('Saving the complete JSON bank to browser storage');
      const savedBank = await saveQuestionBankFile(file, validation.bank);
      onImported(savedBank);
      setMessage(`Saved ${file.name} (${formatFileSize(file.size)}) to durable browser storage.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="mt-4">
      <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-700 focus-within:ring-2 focus-within:ring-blue-300">
        <Upload className="h-4 w-4" />
        Import validated JSON bank
        <input
          type="file"
          accept=".json,application/json"
          className="sr-only"
          aria-label="Import validated JSON question bank"
          onChange={(event) => {
            void importFile(event.currentTarget.files?.[0]);
            event.currentTarget.value = '';
          }}
        />
      </label>
      {message && <p role="status" className="mt-3 text-sm text-emerald-700">{message}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
      {progress && <p role="status" aria-live="polite" className="mt-3 text-sm text-blue-700">{progress}…</p>}
    </div>
  );
}

function QuestionBankScreen({
  onNavigate,
  initialQuery,
  onBanksUpdated,
}: {
  onNavigate: FeatureScreensProps['onNavigate'];
  initialQuery?: string;
  onBanksUpdated: (banks: StoredQuestionBank[]) => void;
}) {
  const [stored, setStored] = useState(() => readStoredQuestionBanks());
  const [exportError, setExportError] = useState<string | null>(null);
  const [subject, setSubject] = useState<string>(subjectTabs.includes(initialQuery as typeof subjectTabs[number]) ? initialQuery as string : 'All');
  const [query, setQuery] = useState(initialQuery && !subjectTabs.includes(initialQuery as typeof subjectTabs[number]) ? initialQuery : '');
  const [selectedBankId, setSelectedBankId] = useState('');
  const [bookmarkState, setBookmarkState] = useState(() => readBookmarks());
  const [bookmarkError, setBookmarkError] = useState<string | null>(bookmarkState.error);
  const bookmarkedIds = new Set(bookmarkState.items.map((bookmark) => bookmark.id));
  const allQuestions = useMemo(() => flattenQuestions(stored.banks), [stored.banks]);
  const visibleQuestions = allQuestions.filter((question) =>
    matchesSubject(question, subject) &&
    filterPracticeQuestions(
      { schemaVersion: '1.0', sourcePdf: { fileName: '', totalPages: 1, subject: question.subject }, questions: [question], summary: { totalQuestions: 1, validQuestions: 1, rejectedQuestions: 0, subjects: [question.subject], topics: [question.topic], reviewRequired: 0 } },
      'All',
      'All',
      query,
    ).length > 0
  );
  const biologyCount = allQuestions.filter((question) => matchesSubject(question, 'Biology')).length;
  const physicsCount = allQuestions.filter((question) => matchesSubject(question, 'Physics')).length;
  const chemistryCount = allQuestions.filter((question) => matchesSubject(question, 'Chemistry')).length;
  const selectedBank = stored.banks.find((bank) => bank.id === selectedBankId);
  useEffect(() => {
    let active = true;
    void loadStoredQuestionBanks().then((result) => {
      if (active) {
        setStored(result);
        onBanksUpdated(result.banks);
      }
    });
    return () => { active = false; };
  }, [onBanksUpdated]);
  const toggleBookmark = (question: ExamQuestion) => {
    if (bookmarkState.error) {
      setBookmarkError(bookmarkState.error);
      return;
    }
    const id = getQuestionBookmarkId(question);
    const next = bookmarkedIds.has(id)
      ? bookmarkState.items.filter((bookmark) => bookmark.id !== id)
      : [...bookmarkState.items, { id, question, savedAt: Date.now() }];
    try {
      saveBookmarks(next);
      setBookmarkState({ items: next, error: null });
      setBookmarkError(null);
    } catch (error) {
      setBookmarkError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="space-y-5">
      <Panel title="Question Bank Library">
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Saved question banks are available for local practice. Question-bank importing is managed by administrators.
        </p>
        {stored.error && <p role="alert" className="mt-3 text-sm text-amber-700">{stored.error}</p>}
        {bookmarkError && <p role="alert" className="mt-3 text-sm text-rose-700">{bookmarkError}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => downloadTextFile('oinkie-question-bank-template.json', JSON.stringify(questionBankTemplate, null, 2), 'application/json')} className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Download JSON template
          </button>
          <button type="button" onClick={() => downloadTextFile('oinkie-question-bank-field-guide.md', questionBankFieldGuide, 'text/markdown')} className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Download field guide
          </button>
        </div>
        {selectedBank && (
          <button
            type="button"
            onClick={() => {
              setExportError(null);
              void (async () => {
                try {
                  const content = selectedBank.sourceText ?? await selectedBank.sourceBlob?.text();
                  if (content === undefined) throw new Error('The saved JSON source is unavailable; the saved bank was not changed.');
                  downloadTextFile(selectedBank.fileName.replace(/\.json$/i, '') + '-export.json', content, 'application/json');
                } catch (error) {
                  setExportError(error instanceof Error ? error.message : String(error));
                }
              })();
            }}
            className="mt-3 min-h-10 rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-800 hover:bg-blue-100"
          >
            Export selected bank JSON
          </button>
        )}
        {exportError && <p role="alert" className="mt-2 text-sm text-rose-700">{exportError}</p>}
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            ['Physics', physicsCount],
            ['Chemistry', chemistryCount],
            ['Biology', biologyCount],
          ].map(([name, count]) => {
            const Icon = subjectIcon[String(name)];
            return (
              <button
                key={name}
                type="button"
                onClick={() => setSubject(String(name))}
                className={`flex items-center gap-3 rounded-xl border p-4 text-left transition ${subject === name ? 'border-blue-300 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}
              >
                <Icon className="h-5 w-5 text-blue-700" />
                <span>
                  <strong className="block text-sm">{name}</strong>
                  <span className="text-xs text-slate-500">{count} saved question(s)</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <label className="sr-only" htmlFor="bank-subject-filter">Filter subject</label>
          <select id="bank-subject-filter" value={subject} onChange={(event) => setSubject(event.target.value)} className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm">
            {subjectTabs.map((item) => <option key={item}>{item}</option>)}
          </select>
          <label className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 px-3">
            <Search className="h-4 w-4 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="Search question text, topic or options" aria-label="Search question bank" />
          </label>
        </div>
        {stored.banks.length > 0 && (
          <label className="mt-4 block max-w-lg text-sm font-medium text-slate-600">
            Saved bank
            <select value={selectedBankId} onChange={(event) => setSelectedBankId(event.target.value)} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3">
              <option value="">All saved banks</option>
              {stored.banks.map((bank) => <option key={bank.id} value={bank.id}>{bank.bank.sourcePdf.subject} · {bank.fileName}</option>)}
            </select>
          </label>
        )}
        <div className="mt-4 divide-y divide-slate-100">
          {selectedBank ? (
            <div className="py-3 text-sm text-slate-600">
              <strong>{selectedBank.bank.sourcePdf.subject}</strong> · {selectedBank.bank.questions.length} valid questions · {selectedBank.fileName}
            </div>
          ) : null}
          {visibleQuestions.filter((question) => !selectedBank || selectedBank.bank.questions.some((candidate) => candidate.id === question.id && candidate.questionEn === question.questionEn)).slice(0, 10).map((question) => (
            <article key={`${question.subject}-${question.id}`} className="py-4">
              <div className="flex items-start gap-3">
                <p className="min-w-0 flex-1 text-xs text-slate-500">Question ID: {question.id}</p>
                <button
                  type="button"
                  onClick={() => toggleBookmark(question)}
                  disabled={!!bookmarkState.error}
                  aria-pressed={bookmarkedIds.has(getQuestionBookmarkId(question))}
                  className="shrink-0 rounded-lg border border-blue-100 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                >
                  {bookmarkedIds.has(getQuestionBookmarkId(question)) ? 'Remove bookmark' : 'Bookmark'}
                </button>
              </div>
              <QuestionLanguageView question={question} className="text-slate-700" />
              {question.missingContent.length > 0 && (
                <p className="mt-2 text-xs text-amber-700">
                  Import note: {question.missingContent.join('; ')}
                </p>
              )}
              <p className="mt-1 text-xs text-slate-500">
                {[question.subject, question.topic, question.sourcePage > 0 ? `Source page ${question.sourcePage}` : ''].filter(Boolean).join(' · ')}
              </p>
            </article>
          ))}
          {visibleQuestions.length === 0 && (
            <Empty>
              {subject === 'All' ? 'No saved questions yet. Import a supported JSON bank to begin.' : `No ${subject} questions are saved yet. Import a validated bank containing ${subject} questions.`}
            </Empty>
          )}
        </div>
        {stored.banks.length > 0 && (
          <button type="button" onClick={() => onNavigate('custom-test')} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-bold text-blue-700">
            Build a test from these banks
          </button>
        )}
      </Panel>
    </div>
  );
}

function TestBuilder({
  banks,
  onNavigate,
  onStartTest,
}: {
  banks: StoredQuestionBank[];
  onNavigate: FeatureScreensProps['onNavigate'];
  onStartTest: FeatureScreensProps['onStartTest'];
}) {
  const REMOTE_BROWSE_SUBJECTS = ['Physics', 'Chemistry', 'Botany', 'Zoology'] as const;
  function remoteSourceForSubject(subject: string): RemoteQuestionSource {
    if (subject === 'Physics') return 'physics';
    if (subject === 'Chemistry') return 'chemistry';
    if (subject === 'Botany') return 'botany';
    if (subject === 'Zoology') return 'zoology';
    return 'physics';
  }
  const [sourceMode, setSourceMode] = useState<'local' | 'remote'>('remote');
  const [remoteSubject, setRemoteSubject] = useState<RemoteQuestionSubject>('Physics');
  const remoteSource: RemoteQuestionSource = remoteSourceForSubject(remoteSubject);
  const [remoteChapter, setRemoteChapter] = useState('');
  const [remoteTopic, setRemoteTopic] = useState('');
  const [remoteQuestionsBySubject, setRemoteQuestionsBySubject] = useState<Record<string, ExamQuestion[]>>({});
  const [remoteCounts, setRemoteCounts] = useState<Partial<Record<string, number>>>({});
  const [remoteCountError, setRemoteCountError] = useState<string | null>(null);
  const [remoteCountLoading, setRemoteCountLoading] = useState(false);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const remoteRequestRef = useRef(0);
  const [activeSubject, setActiveSubject] = useState<string | null>(null);
  const [selectedTopicKeysBySubject, setSelectedTopicKeysBySubject] = useState<Record<string, string[]>>({});
  const [classFilterBySubject, setClassFilterBySubject] = useState<Record<string, BuilderClassLevel | 'All'>>({});
  const [searchBySubject, setSearchBySubject] = useState<Record<string, string>>({});
  const [expandedChaptersBySubject, setExpandedChaptersBySubject] = useState<Record<string, string[]>>({});
  const [count, setCount] = useState(10);
  const [countMode, setCountMode] = useState<number | 'custom'>(10);
  const [duration, setDuration] = useState(30);
  const [showReview, setShowReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const remoteQuestions = useMemo(
    () => Object.values(remoteQuestionsBySubject).flat(),
    [remoteQuestionsBySubject],
  );
  const questions = useMemo(
    () => sourceMode === 'local'
      ? getUniqueBuilderQuestions(flattenQuestions(banks))
      : getUniqueBuilderQuestions(remoteQuestions, 'id'),
    [banks, remoteQuestions, sourceMode],
  );
  const selectableSubjects = sourceMode === 'local'
    ? subjectTabs.slice(1)
    : [...REMOTE_BROWSE_SUBJECTS];
  const subjectQuestionCounts = sourceMode === 'local'
    ? Object.fromEntries(selectableSubjects.map((item) => [item, questions.filter((question) => questionMatchesSubject(question, item)).length]))
    : Object.fromEntries(selectableSubjects.map((item) => [item, remoteCounts[item as string] ?? 0]));
  const questionMatchesSubject = (question: ExamQuestion, subject: string) =>
    sourceMode === 'remote'
      ? question.subject.trim().toLocaleLowerCase() === subject.toLocaleLowerCase()
      : matchesSubject(question, subject);
  const activeClassFilter = activeSubject ? classFilterBySubject[activeSubject] || 'All' : 'All';
  const chapterGroups = activeSubject
    ? [...questions.reduce((groups, question) => {
      if (!questionMatchesSubject(question, activeSubject)) return groups;
      const metadata = getBuilderQuestionMetadata(question);
      if (activeClassFilter !== 'All' && metadata.classLevel !== activeClassFilter) return groups;
      if (!metadata.chapter || metadata.chapter === 'Uncategorized') return groups;
      const group = groups.get(metadata.chapter) || { questions: [], topics: new Map<string, ExamQuestion[]>() };
      group.questions.push(question);
      if (metadata.topic) {
        const topicQuestions = group.topics.get(metadata.topic) || [];
        topicQuestions.push(question);
        group.topics.set(metadata.topic, topicQuestions);
      }
      groups.set(metadata.chapter, group);
      return groups;
    }, new Map<string, { questions: ExamQuestion[]; topics: Map<string, ExamQuestion[]> }>()).entries()]
      .map(([chapter, group]) => ({
        chapter,
        ...group,
        topicEntries: [...group.topics.entries()]
          .map(([topic, topicQuestions]) => ({ topic, questions: topicQuestions }))
          .sort((left, right) => left.topic.localeCompare(right.topic)),
      }))
      .sort((left, right) => left.chapter.localeCompare(right.chapter))
    : [];
  const availableClassLevels = activeSubject
    ? [...new Set(questions
      .filter((question) => questionMatchesSubject(question, activeSubject))
      .map((question) => getBuilderQuestionMetadata(question).classLevel)
      .filter((level): level is BuilderClassLevel => level !== null))].sort()
    : [];
  const searchQuery = activeSubject ? (searchBySubject[activeSubject] || '').trim().toLocaleLowerCase() : '';
  const visibleChapterGroups = chapterGroups
    .map((group) => {
      const chapterMatches = group.chapter.toLocaleLowerCase().includes(searchQuery);
      const topicEntries = searchQuery && !chapterMatches
        ? group.topicEntries.filter((entry) => entry.topic.toLocaleLowerCase().includes(searchQuery))
        : group.topicEntries;
      return { ...group, topicEntries, matchesSearch: !searchQuery || chapterMatches || topicEntries.length > 0 };
    })
    .filter((group) => group.matchesSearch);
  const selectedTopicKeys = selectableSubjects.flatMap((item) => selectedTopicKeysBySubject[item] || []);
  const matchingSubjects = questions.filter((question) => selectedTopicKeys.includes(getBuilderTopicKey(question)));
  const selectedQuestionSubjects = [...new Set(matchingSubjects.map((question) => question.subject.trim()))];
  const available = filterCustomTestQuestions(questions, {
    subjects: selectedQuestionSubjects,
    classLevel: 'All',
    selectedTopicKeys,
    deduplicateById: sourceMode === 'remote',
  });
  const selectedSubjectCount = selectableSubjects.filter((item) => (selectedTopicKeysBySubject[item]?.length || 0) > 0).length;
  const selectedContentSummary = [...matchingSubjects.reduce((groups, question) => {
    const metadata = getBuilderQuestionMetadata(question);
    const key = JSON.stringify([question.subject.trim(), metadata.classLevel, metadata.chapter]);
    const group = groups.get(key) || {
      subject: question.subject.trim(),
      classLevel: metadata.classLevel,
      chapter: metadata.chapter,
      topics: new Set<string>(),
      hasUnmappedTopics: false,
    };
    if (metadata.topic) group.topics.add(metadata.topic);
    else group.hasUnmappedTopics = true;
    groups.set(key, group);
    return groups;
  }, new Map<string, {
    subject: string;
    classLevel: BuilderClassLevel | null;
    chapter: string;
    topics: Set<string>;
    hasUnmappedTopics: boolean;
  }>()).values()]
    .sort((left, right) => left.subject.localeCompare(right.subject) ||
      left.chapter.localeCompare(right.chapter));

  const updateSubjectSelection = (subject: string, keys: string[]) => {
    setSelectedTopicKeysBySubject((current) => {
      const nextKeys = toggleBuilderSelection(current[subject] || [], keys);
      return { ...current, [subject]: nextKeys };
    });
    setValidationError(null);
  };

  const invalidateRemoteSelection = () => {
    remoteRequestRef.current++;
    setRemoteLoading(false);
    setRemoteQuestionsBySubject({});
    setRemoteCounts({});
    setRemoteCountError(null);
    setRemoteCountLoading(false);
    setRemoteError(null);
    setActiveSubject(null);
    setSelectedTopicKeysBySubject({});
    setShowReview(false);
    setValidationError(null);
  };

  const loadRemoteSubject = async (subject: RemoteQuestionSubject) => {
    const requestId = ++remoteRequestRef.current;
    const source = remoteSourceForSubject(subject);
    setRemoteLoading(true);
    setRemoteError(null);
    setActiveSubject(subject);
    setSelectedTopicKeysBySubject({});
    setShowReview(false);
    try {
      const loaded = await fetchRemoteQuestions(source, {
        subject,
        chapter: remoteChapter.trim() || undefined,
        topic: remoteTopic.trim() || undefined,
        limit: 300,
      });
      if (remoteRequestRef.current === requestId) {
        setRemoteQuestionsBySubject((current) => ({ ...current, [subject]: loaded }));
        setRemoteCounts((current) => ({ ...current, [subject]: loaded.length }));
        setCount((currentCount) => Math.min(currentCount, Math.max(1, loaded.length)));
        setValidationError(null);
      }
    } catch (cause) {
      if (remoteRequestRef.current === requestId) {
        setRemoteError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      if (remoteRequestRef.current === requestId) setRemoteLoading(false);
    }
  };

  useEffect(() => {
    if (sourceMode !== 'remote') return;
    let active = true;
    setRemoteCountLoading(true);
    setRemoteCountError(null);
    void Promise.all(
      REMOTE_BROWSE_SUBJECTS.map(async (subject) => {
        try {
          const count = await countRemoteQuestions(remoteSourceForSubject(subject), {
            subject,
            chapter: remoteChapter.trim() || undefined,
            topic: remoteTopic.trim() || undefined,
            limit: 300,
          });
          return [subject, count, null] as const;
        } catch (cause) {
          return [subject, null, cause] as const;
        }
      }),
    ).then((results) => {
      if (!active) return;
      const nextCounts: Partial<Record<RemoteQuestionSubject, number>> = {};
      let firstError: string | null = null;
      for (const [subject, count, cause] of results) {
        if (typeof count === 'number') nextCounts[subject] = count;
        else if (!firstError) firstError = cause instanceof Error ? cause.message : String(cause);
      }
      setRemoteCounts(nextCounts);
      setRemoteCountError(firstError);
      setRemoteCountLoading(false);
    });
    return () => {
      active = false;
    };
  }, [sourceMode, remoteChapter, remoteTopic]);

  useEffect(() => {
    if (sourceMode !== 'remote' || !activeSubject) return;
    const subject = activeSubject as RemoteQuestionSubject;
    if (remoteQuestionsBySubject[subject]) return;
    void loadRemoteSubject(subject);
  }, [sourceMode, activeSubject, remoteChapter, remoteTopic, remoteQuestionsBySubject]);

  const setSubjectSelection = (subject: string, keys: string[], selected: boolean) => {
    setSelectedTopicKeysBySubject((current) => {
      const next = new Set(current[subject] || []);
      keys.forEach((key) => selected ? next.add(key) : next.delete(key));
      return { ...current, [subject]: [...next] };
    });
    setValidationError(null);
  };

  const setAllVisibleChapterSelection = (selected: boolean) => {
    if (!activeSubject) return;
    const keys = visibleChapterGroups.flatMap((group) =>
      getBuilderChapterSelectionKeys(questions, activeSubject, group.chapter, activeClassFilter)
    );
    setSubjectSelection(activeSubject, keys, selected);
  };

  const toggleChapterExpansion = (chapter: string) => {
    if (!activeSubject) return;
    setExpandedChaptersBySubject((current) => {
      const expanded = current[activeSubject] || [];
      return {
        ...current,
        [activeSubject]: expanded.includes(chapter)
          ? expanded.filter((item) => item !== chapter)
          : [...expanded, chapter],
      };
    });
  };

  const start = async () => {
    const configurationValidationError = getCustomTestConfigurationError({
      selectedQuestionCount: selectedTopicKeys.length,
      questionCount: count,
      availableQuestionCount: available.length,
      durationMinutes: duration,
    });
    if (configurationValidationError) {
      setValidationError(configurationValidationError);
      return;
    }
    setBusy(true);
    setError(null);
    setValidationError(null);
    try {
      const selectedSubjects = selectableSubjects.filter((item) => (selectedTopicKeysBySubject[item]?.length || 0) > 0);
      const selectedQuestions = createCustomTestQuestions(questions, {
        subjects: selectedQuestionSubjects,
        classLevel: 'All',
        selectedTopicKeys,
        deduplicateById: sourceMode === 'remote',
      }, count);
      const title = selectedSubjects.length === 1
        ? `${selectedSubjects[0]} Practice Test`
        : `${selectedSubjects.join(' + ')} Practice Test`;
      const sourceTitle = sourceMode === 'remote'
        ? `${title} · ${getRemoteSourceLabel(remoteSource)}`
        : title;
      await onStartTest(selectedQuestions, duration, sourceTitle, true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const openReview = () => {
    const configurationValidationError = getCustomTestConfigurationError({
      selectedQuestionCount: selectedTopicKeys.length,
      questionCount: count,
      availableQuestionCount: available.length,
      durationMinutes: duration,
    });
    if (configurationValidationError) {
      setValidationError(configurationValidationError);
      return;
    }
    setValidationError(null);
    setError(null);
    setShowReview(true);
  };

  return (
    <div className="space-y-5">
      <Panel title="Choose your test content">
        <section aria-label="Question source" className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="font-bold text-slate-800">Question source</h3>
          <p className="mt-1 text-sm text-slate-500">Choose either saved local banks or Smart Test Generator. Sources are never mixed automatically.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={sourceMode === 'remote'}
              onClick={() => {
                invalidateRemoteSelection();
                setSourceMode('remote');
              }}
              className={`min-h-10 rounded-lg border px-4 text-sm font-semibold ${sourceMode === 'remote' ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-700'}`}
            >
              Smart Test Generator
            </button>
          </div>
          {sourceMode === 'remote' && (
            <div className="mt-4 space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                {remoteCountLoading && <p role="status" className="mt-2 text-sm text-blue-700">Checking remote question counts…</p>}
                {remoteCountError && <p role="alert" className="mt-2 text-sm text-rose-700">{remoteCountError}</p>}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium text-slate-600">
                  Chapter filter (optional)
                  <input value={remoteChapter} onChange={(event) => { invalidateRemoteSelection(); setRemoteChapter(event.target.value); }} maxLength={160} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-200 px-3" />
                </label>
                <label className="text-sm font-medium text-slate-600">
                  Topic filter (optional)
                  <input value={remoteTopic} onChange={(event) => { invalidateRemoteSelection(); setRemoteTopic(event.target.value); }} maxLength={160} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-200 px-3" />
                </label>
              </div>
              {remoteLoading && <p role="status" className="text-sm text-blue-700">Fetching questions from {getRemoteSourceLabel(remoteSource)}…</p>}
              {remoteError && <p role="alert" className="text-sm text-rose-700">{remoteError}</p>}
              {!remoteLoading && !remoteError && remoteQuestions.length > 0 && (
                <p role="status" className="text-sm text-emerald-700">Loaded {remoteQuestions.length} question(s) from {getRemoteSourceLabel(remoteSource)}.</p>
              )}
            </div>
          )}
        </section>
        {questions.length === 0 ? (
          <Empty>
            {sourceMode === 'local' ? (
              <>No saved questions are available. Import a validated JSON question bank before building a custom test.<button type="button" onClick={() => onNavigate('question-bank')} className="mx-auto mt-3 flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 font-bold text-white"><Library className="h-4 w-4" /> Open Question Bank</button></>
            ) : (
              <>
                <p>No Smart Test Generator questions are loaded yet. Choose a subject below to load its chapters and questions.</p>
                {remoteCountError && <p role="alert" className="mt-2 text-sm text-rose-700">{remoteCountError}</p>}
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {selectableSubjects.map((item) => {
                    const Icon = subjectIcon[item] ?? BookOpen;
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => {
                          setRemoteSubject(item as RemoteQuestionSubject);
                          setActiveSubject(item);
                        }}
                        aria-label={`${item}, ${remoteCountLoading ? 'checking' : `${remoteCounts[item as string] ?? 0} available questions`}`}
                        className="flex min-h-24 items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-blue-300 hover:bg-blue-50"
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                          <Icon className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-bold text-slate-800">{item}</span>
                          <span className="mt-1 block text-xs text-slate-500">
                            {remoteCountLoading
                              ? 'Checking available questions…'
                              : `${remoteCounts[item as string] ?? 0} available questions`}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </Empty>
        ) : (
          <>
            <p className="mt-2 text-sm text-slate-500">
              {sourceMode === 'local'
                ? `${questions.length} real question(s) found across ${banks.length} saved bank(s).`
                : `${questions.length} question(s) loaded from ${getRemoteSourceLabel(remoteSource)}.`}
            </p>
            {showReview ? (
              <section className="mt-5" aria-labelledby="test-review-title">
                <button
                  type="button"
                  onClick={() => setShowReview(false)}
                  className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-bold text-blue-700 hover:bg-blue-50"
                >
                  <ArrowLeft className="h-4 w-4" /> Back to configuration
                </button>
                <h3 id="test-review-title" className="mt-3 text-lg font-bold text-slate-800">Review your test</h3>
                <dl className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Subjects</dt>
                    <dd className="mt-1 text-sm font-medium text-slate-800">
                      {selectableSubjects.filter((subject) => (selectedTopicKeysBySubject[subject]?.length || 0) > 0).join(', ')}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Source</dt>
                    <dd className="mt-1 text-sm font-medium text-slate-800">
                      {sourceMode === 'remote' ? `${getRemoteSourceLabel(remoteSource)} (read-only)` : 'Local / imported question banks'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Questions</dt>
                    <dd className="mt-1 text-sm font-medium text-slate-800">{count}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Eligible questions</dt>
                    <dd className="mt-1 text-sm font-medium text-slate-800">{available.length}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Duration</dt>
                    <dd className="mt-1 text-sm font-medium text-slate-800">{duration} minutes</dd>
                  </div>
                </dl>
                <h4 className="mt-5 font-bold text-slate-800">Selected chapters and topics</h4>
                <div className="mt-2 space-y-3">
                  {selectedContentSummary.map((group) => (
                    <div key={`${group.subject}-${group.classLevel}-${group.chapter}`} className="rounded-xl border border-slate-200 p-3">
                      <p className="text-sm font-semibold text-slate-800">
                        {group.subject}{group.classLevel ? ` · Class ${group.classLevel}` : ''} · {group.chapter}
                      </p>
                      {group.topics.size ? (
                        <p className="mt-1 text-sm text-slate-600">Topics: {[...group.topics].sort((a, b) => a.localeCompare(b)).join(', ')}</p>
                      ) : group.hasUnmappedTopics ? (
                        <p className="mt-1 text-sm text-amber-700">Topic metadata is unavailable; this chapter was selected as a whole.</p>
                      ) : (
                        <p className="mt-1 text-sm text-slate-500">No topic metadata is available.</p>
                      )}
                      {group.topics.size > 0 && group.hasUnmappedTopics && (
                        <p className="mt-1 text-xs text-amber-700">Topic metadata is unavailable for some selected chapter questions.</p>
                      )}
                    </div>
                  ))}
                </div>
                {validationError && <p role="alert" className="mt-3 text-sm text-rose-700">{validationError}</p>}
                {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
                <button
                  type="button"
                  onClick={() => void start()}
                  disabled={busy}
                  className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Check className="h-4 w-4" /> {busy ? 'Preparing test…' : 'Create Test'}
                </button>
              </section>
            ) : activeSubject ? (
              <section className="mt-5" aria-labelledby="chapter-selection-title">
                <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 p-2 sm:p-3">
                  <button
                    type="button"
                    onClick={() => setActiveSubject(null)}
                    className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-bold text-blue-700 transition hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                  >
                    <ArrowLeft className="h-4 w-4 shrink-0" /> Save and Back to Subjects
                  </button>
                </div>
                <h3 id="chapter-selection-title" className="mt-3 text-lg font-bold text-slate-800">
                  Choose {activeSubject} chapters and topics
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Select whole chapters or individual topics. Your selections are kept when you search, filter, or switch subjects.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="Filter chapters by class">
                  {(['All', ...availableClassLevels] as const).map((level) => (
                    <button
                      key={level}
                      type="button"
                      aria-pressed={activeClassFilter === level}
                      onClick={() => setClassFilterBySubject((current) => ({ ...current, [activeSubject]: level }))}
                      className={`min-h-9 rounded-full border px-4 text-sm font-semibold ${
                        activeClassFilter === level
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200'
                      }`}
                    >
                      {level === 'All' ? 'All classes' : `Class ${level}`}
                    </button>
                  ))}
                </div>
                <label className="mt-3 flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3">
                  <Search className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="sr-only">Search chapters and topics</span>
                  <input
                    type="search"
                    value={activeSubject ? searchBySubject[activeSubject] || '' : ''}
                    onChange={(event) => activeSubject && setSearchBySubject((current) => ({
                      ...current,
                      [activeSubject]: event.target.value,
                    }))}
                    placeholder="Search chapters and topics"
                    className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none"
                  />
                </label>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-slate-500">
                    {availableClassLevels.length
                      ? 'Class filters use question metadata; questions without a recognized class are shown under All classes.'
                      : 'Class metadata is unavailable for these questions, so only All classes is available.'}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setAllVisibleChapterSelection(true)}
                      disabled={!visibleChapterGroups.length}
                      className="min-h-9 rounded-lg px-3 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                    >
                      Select all visible
                    </button>
                    <button
                      type="button"
                      onClick={() => setAllVisibleChapterSelection(false)}
                      disabled={!visibleChapterGroups.length}
                      className="min-h-9 rounded-lg px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                    >
                      Deselect all visible
                    </button>
                  </div>
                </div>
                {visibleChapterGroups.length ? (
                  <div className="mt-3 space-y-2">
                    {visibleChapterGroups.map((group) => {
                      const selectedKeys = selectedTopicKeysBySubject[activeSubject] || [];
                      const chapterKeys = getBuilderChapterSelectionKeys(
                        questions,
                        activeSubject,
                        group.chapter,
                        activeClassFilter,
                      );
                      const chapterState = getBuilderSelectionState(chapterKeys, selectedKeys);
                      const expanded = (expandedChaptersBySubject[activeSubject] || []).includes(group.chapter);
                      const unmappedTopicCount = group.questions.filter((question) =>
                        getBuilderQuestionMetadata(question).topic === null
                      ).length;
                      return (
                        <section key={group.chapter} className="overflow-hidden rounded-xl border border-slate-200">
                          <div className={`flex min-h-12 items-center gap-2 p-3 ${
                            chapterState.checked || chapterState.indeterminate ? 'bg-blue-50' : 'bg-white'
                          }`}>
                            <button
                              type="button"
                              onClick={() => toggleChapterExpansion(group.chapter)}
                              aria-label={`${expanded ? 'Collapse' : 'Expand'} ${group.chapter}`}
                              aria-expanded={expanded}
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
                            >
                              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                            <input
                              type="checkbox"
                              checked={chapterState.checked}
                              ref={(element) => {
                                if (element) element.indeterminate = chapterState.indeterminate;
                              }}
                              onChange={() => updateSubjectSelection(activeSubject, chapterKeys)}
                              aria-label={`Select all topics in ${group.chapter}`}
                              className="h-4 w-4 shrink-0 accent-blue-600"
                            />
                            <button
                              type="button"
                              onClick={() => toggleChapterExpansion(group.chapter)}
                              aria-expanded={expanded}
                              className="min-w-0 flex-1 text-left text-sm font-semibold text-slate-800"
                            >
                              {group.chapter}
                            </button>
                            <span className="shrink-0 text-xs text-slate-500">{group.questions.length} questions</span>
                          </div>
                          {expanded && (
                            <div className="space-y-1 border-t border-slate-100 bg-white p-2 pl-12">
                              {group.topicEntries.filter((entry) => !searchQuery ||
                                group.chapter.toLocaleLowerCase().includes(searchQuery) ||
                                entry.topic.toLocaleLowerCase().includes(searchQuery)
                              ).map((entry) => {
                                const topicKeys = [...new Set(entry.questions.map((question) =>
                                  getBuilderTopicKey(question, getBuilderQuestionMetadata(question))
                                ))];
                                const topicState = getBuilderSelectionState(topicKeys, selectedKeys);
                                return (
                                  <label
                                    key={entry.topic}
                                    className={`flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm ${
                                      topicState.checked || topicState.indeterminate
                                        ? 'bg-blue-50 text-blue-900'
                                        : 'text-slate-700 hover:bg-slate-50'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={topicState.checked}
                                      ref={(element) => {
                                        if (element) element.indeterminate = topicState.indeterminate;
                                      }}
                                      onChange={() => updateSubjectSelection(activeSubject, topicKeys)}
                                      className="h-4 w-4 shrink-0 accent-blue-600"
                                    />
                                    <span className="min-w-0 flex-1">{entry.topic}</span>
                                    <span className="shrink-0 text-xs text-slate-500">{entry.questions.length} questions</span>
                                  </label>
                                );
                              })}
                              {unmappedTopicCount > 0 && (
                                <p className="px-3 py-2 text-xs leading-5 text-amber-700">
                                  Topic metadata is unavailable for {unmappedTopicCount} question(s). These are included when the whole chapter is selected.
                                </p>
                              )}
                              {!group.topicEntries.length && !unmappedTopicCount && (
                                <p className="px-3 py-2 text-xs text-slate-500">No topic metadata is available for this chapter.</p>
                              )}
                            </div>
                          )}
                        </section>
                      );
                    })}
                  </div>
                ) : (
                  <Empty>
                    {searchQuery
                      ? 'No chapters or topics match your search in this class filter.'
                      : 'No chapter metadata is available for this subject and class filter.'}
                  </Empty>
                )}
              </section>
            ) : (
              <>
                <h3 className="mt-5 font-bold text-slate-800">Choose subjects</h3>
                <p className="mt-1 text-sm text-slate-500">Open a subject to choose its chapters. You can select chapters from more than one subject.</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {selectableSubjects.map((item) => {
                    const Icon = subjectIcon[item];
                    const selectedCount = selectedTopicKeysBySubject[item]?.length || 0;
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => {
                          setRemoteSubject(item as RemoteQuestionSubject);
                          setActiveSubject(item);
                        }}
                        aria-label={`${item}, ${subjectQuestionCounts[item]} available questions${selectedCount ? `, ${selectedCount} chapters selected` : ''}`}
                        className={`flex min-h-24 items-center gap-4 rounded-2xl border p-4 text-left transition-colors hover:border-blue-300 hover:bg-blue-50 ${
                          selectedCount ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white'
                        }`}
                      >
                        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                          selectedCount ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                          <Icon className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-bold text-slate-800">{item}</span>
                          <span className="mt-1 block text-xs text-slate-500">
                            {selectedCount
                              ? `${selectedCount} chapter(s) selected · ${subjectQuestionCounts[item]} questions`
                              : `${subjectQuestionCounts[item]} available questions`}
                          </span>
                        </span>
                        {selectedCount > 0 && <Check className="h-5 w-5 shrink-0 text-blue-700" />}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {!activeSubject && !showReview && (
              <section className="mt-6 border-t border-slate-100 pt-5" aria-labelledby="test-settings-title">
                <h3 id="test-settings-title" className="font-bold text-slate-800">Test settings</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedSubjectCount} subject(s), {available.length} matching question(s) selected.
                </p>
                <div className="mt-4">
                  <p className="text-sm font-medium text-slate-600">Question count</p>
                  <div className="mt-2 flex flex-wrap gap-2" aria-label="Question count presets">
                    {[10, 15, 20, 45].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        aria-pressed={countMode === preset}
                        onClick={() => {
                          setCountMode(preset);
                          setCount(preset);
                          setValidationError(null);
                        }}
                        className={`min-h-10 rounded-lg border px-4 text-sm font-semibold ${
                          countMode === preset
                            ? 'border-blue-600 bg-blue-600 text-white'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-blue-200'
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                    <button
                      type="button"
                      aria-pressed={countMode === 'custom'}
                      onClick={() => {
                        setCountMode('custom');
                        setValidationError(null);
                      }}
                      className={`min-h-10 rounded-lg border px-4 text-sm font-semibold ${
                        countMode === 'custom'
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-blue-200'
                      }`}
                    >
                      Custom
                    </button>
                  </div>
                  {countMode === 'custom' && (
                    <label className="mt-3 block max-w-xs text-sm font-medium text-slate-600">
                      Custom question count (available: {available.length})
                      <input
                        type="number"
                        min={1}
                        value={count}
                        onChange={(event) => {
                          setCount(Number(event.target.value));
                          setValidationError(null);
                        }}
                        className="mt-1 block min-h-10 w-full rounded-lg border border-slate-200 px-3"
                      />
                    </label>
                  )}
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-medium text-slate-600">Duration (minutes)
                    <input type="number" min={1} max={400} value={duration} onChange={(event) => { setDuration(Number(event.target.value)); setValidationError(null); }} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-200 px-3" />
                  </label>
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  Difficulty cannot be filtered because the supported question-bank schema does not include difficulty metadata. Imported answer keys remain unscored unless separately verified through the existing source-review workflow.
                </p>
                {validationError && <p role="alert" className="mt-2 text-sm text-rose-700">{validationError}</p>}
                <button
                  type="button"
                  onClick={openReview}
                  className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 font-bold text-white hover:bg-blue-700"
                >
                  Review Test
                </button>
                <h3 className="mt-5 font-bold">Preview ({Math.min(count, available.length)} of {available.length} matching questions)</h3>
                <div className="mt-2 divide-y divide-slate-100">
                  {available.slice(0, Math.min(5, Math.max(0, count))).map((question, index) => (
                    <article key={`${question.id}-${index}`} className="py-3 text-sm leading-6 text-slate-700">
                      <strong>{index + 1}. [{question.subject} · {getBuilderQuestionMetadata(question).chapter}]</strong> <MathText text={question.questionEn} />
                      <QuestionImages images={question.images} type="question" />
                    </article>
                  ))}
                  {!available.length && <Empty>No questions match the selected chapters.</Empty>}
                </div>
              </section>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}

function MockTestScreen({
  banks,
  onNavigate,
  onStartTest,
}: {
  banks: StoredQuestionBank[];
  onNavigate: FeatureScreensProps['onNavigate'];
  onStartTest: FeatureScreensProps['onStartTest'];
}) {
  const questions = useMemo(() => flattenQuestions(banks), [banks]);
  const [count, setCount] = useState(Math.min(180, questions.length));
  const [duration, setDuration] = useState(Math.min(180, Math.max(1, count)));
  const [error, setError] = useState<string | null>(null);
  const bySubject = questions.reduce<Record<string, number>>((totals, question) => {
    const subject = normalizeDashboardSubject(question.subject);
    totals[subject] = (totals[subject] || 0) + 1;
    return totals;
  }, {});

  return (
    <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
      <Panel title="Mock test instructions">
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600">
          <li>This practice session uses only validated questions from your locally saved question banks.</li>
          <li>The standard mock template is up to 180 questions with a configurable timer; available questions may be fewer.</li>
          <li>The simulator uses +4 / −1 / 0 marking. Imported keys are not trusted or scored without the existing explicit review confirmation.</li>
          <li>This is an independent practice tool and does not claim to reproduce an official examination.</li>
        </ul>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-600">Questions (available: {questions.length})
            <input type="number" min={1} max={Math.min(180, questions.length)} value={count} onChange={(event) => setCount(Number(event.target.value))} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-200 px-3" />
          </label>
          <label className="text-sm font-medium text-slate-600">Duration (minutes)
            <input type="number" min={1} max={400} value={duration} onChange={(event) => setDuration(Number(event.target.value))} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-200 px-3" />
          </label>
        </div>
        {questions.length > 0 && (count < 1 || count > Math.min(180, questions.length) || !Number.isSafeInteger(count)) && (
          <p role="alert" className="mt-2 text-sm text-amber-700">Select a whole-number count from 1 to {Math.min(180, questions.length)}.</p>
        )}
        {error && <p role="alert" className="mt-2 text-sm text-rose-700">{error}</p>}
        <button
          type="button"
          disabled={!questions.length || count < 1 || count > Math.min(180, questions.length) || duration < 1 || duration > 400}
          onClick={() => void onStartTest(questions.slice(0, count), duration, 'NEET Mock Practice Test').catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))}
          className="mt-4 min-h-11 rounded-xl bg-blue-600 px-5 font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Start mock practice
        </button>
      </Panel>
      <Panel title="Available real questions">
        {questions.length ? (
          <>
            <p className="mt-2 text-sm text-slate-500">{questions.length} usable question(s) across {banks.length} saved bank(s).</p>
            <div className="mt-4 space-y-3">
              {['Physics', 'Chemistry', 'Biology'].map((name) => {
                const Icon = subjectIcon[name];
                return <div key={name} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3"><Icon className="h-4 w-4 text-blue-700" /><span className="flex-1 text-sm font-semibold">{name}</span><span className="text-sm text-slate-500">{bySubject[name] || 0} questions</span></div>;
              })}
            </div>
            <p className="mt-4 text-xs leading-5 text-slate-500">There is no built-in complete mock paper. The test count cannot exceed the real bank questions shown here.</p>
          </>
        ) : (
          <Empty>
            No usable mock-test questions are saved yet. Import a validated JSON question bank; this screen will not create placeholder questions.
            <button type="button" onClick={() => onNavigate('question-bank')} className="mx-auto mt-3 flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 font-bold text-white"><Library className="h-4 w-4" /> Open Question Bank</button>
          </Empty>
        )}
      </Panel>
    </div>
  );
}

function PerformanceScreen({ sessions }: { sessions: ExamSessionState[] }) {
  const overview = getDashboardOverview(sessions);
  const verified = overview.recentSessions.filter((session) => session.accuracy !== null);
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ['Completed tests', String(overview.testCount)],
          ['Keyed accuracy', overview.averageAccuracy === null ? '—' : `${overview.averageAccuracy}%`],
          ['Questions attempted', String(overview.questionsSolved)],
        ].map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></div>)}
      </div>
      {sessions.length === 0 ? (
        <Panel title="Performance data"><Empty>There are no completed attempts yet. Submit a practice test to build your analytics.</Empty></Panel>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title="Subject-wise performance">
            {overview.subjects.length ? <div className="mt-3 space-y-3">{overview.subjects.map((subject) => <div key={subject.name} className="rounded-xl bg-slate-50 p-3"><div className="flex justify-between gap-3 text-sm"><strong>{subject.name}</strong><span>{subject.accuracy === null ? 'Not scored' : `${subject.accuracy}% accuracy`}</span></div><p className="mt-1 text-xs text-slate-500">{subject.questionsAttempted} trusted-key attempts</p></div>)}</div> : <Empty>Subject accuracy is not available until completed sessions contain subject-tagged questions with trusted answer keys.</Empty>}
          </Panel>
          <Panel title="Accuracy trend">
            {verified.length ? <div className="mt-3 space-y-2">{verified.slice(0, 10).map((item) => <div key={`${item.session.config.id}-${item.completedAt}`} className="flex items-center gap-3"><span className="w-12 text-xs text-slate-500">{new Date(item.completedAt).toLocaleDateString()}</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-500" style={{ width: `${item.accuracy}%` }} /></div><strong className="w-12 text-right text-xs">{item.accuracy}%</strong></div>)}</div> : <Empty>Completed tests exist, but none have an authorized answer key to support an accuracy trend.</Empty>}
          </Panel>
        </div>
      )}
    </div>
  );
}

function HistoryScreen({
  sessions,
  onOpenReport,
  onlyPapers = false,
}: {
  sessions: ExamSessionState[];
  onOpenReport: FeatureScreensProps['onOpenReport'];
  onlyPapers?: boolean;
}) {
  const filtered = sessions.filter((session) =>
    !onlyPapers || session.config.sourceType === 'pdf' || session.config.hasCustomPdf
  );
  return (
    <Panel title={onlyPapers ? 'Completed imported-paper reports' : 'Completed test attempts'}>
      <p className="mt-2 text-sm text-slate-500">Only submitted sessions saved in this browser are listed. Opening a report does not alter its stored responses.</p>
      {filtered.length ? <div className="mt-4 divide-y divide-slate-100">{filtered.map((session) => {
        const stats = summarizeDashboardSession(session);
        return <article key={`${session.config.id}-${session.submittedAt}`} className="flex flex-wrap items-center gap-3 py-4"><FileText className="h-5 w-5 shrink-0 text-blue-600" /><div className="min-w-0 flex-1"><h3 className="break-words text-sm font-bold">{session.config.title}</h3><p className="mt-1 break-words text-xs text-slate-500">{session.config.totalQuestions} questions · {new Date(stats.completedAt).toLocaleString()} · {stats.accuracy === null ? 'Not scored' : `${stats.accuracy}% accuracy`}</p></div><button type="button" onClick={() => onOpenReport(session)} className="min-h-10 rounded-lg bg-blue-50 px-3 text-sm font-bold text-blue-700 hover:bg-blue-100">View report</button></article>;
      })}</div> : <Empty>{onlyPapers ? 'No completed imported-paper sessions are saved.' : 'No completed test attempts are saved yet.'}</Empty>}
    </Panel>
  );
}

function BookmarksScreen() {
  const [stored, setStored] = useState(() => readBookmarks());
  const [error, setError] = useState<string | null>(stored.error);

  const removeBookmark = (bookmark: SavedBookmark) => {
    if (stored.error) {
      setError(stored.error);
      return;
    }
    const next = stored.items.filter((item) => item.id !== bookmark.id);
    try {
      saveBookmarks(next);
      setStored({ items: next, error: null });
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <Panel title={`Bookmarked questions (${stored.items.length})`}>
      <p className="mt-2 text-sm leading-6 text-slate-500">Questions bookmarked from your locally saved question banks remain available on this device.</p>
      {(stored.error || error) && <p role="alert" className="mt-3 text-sm text-rose-700">{error || stored.error}</p>}
      {stored.items.length ? (
        <div className="mt-4 space-y-3">
          {stored.items.map((bookmark) => (
            <article key={bookmark.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="min-w-0 flex-1 text-sm font-semibold leading-6 text-slate-800"><MathText text={bookmark.question.questionEn} /></p>
                <button type="button" onClick={() => removeBookmark(bookmark)} className="rounded-lg border border-rose-100 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50">Remove</button>
              </div>
              <p className="mt-2 text-xs text-slate-500">{bookmark.question.subject} · {bookmark.question.topic} · Saved {new Date(bookmark.savedAt).toLocaleDateString()}</p>
              <QuestionImages images={bookmark.question.images} type="question" />
              <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                {(['A', 'B', 'C', 'D'] as const).map((letter) => (
                  <div key={letter}>
                    <p><strong>{letter}.</strong> <MathText text={bookmark.question.options[letter].textEn} /></p>
                    <QuestionImages images={bookmark.question.images} type="option" option={letter} />
                  </div>
                ))}
              </div>
              <QuestionImages images={bookmark.question.images} type="explanation" />
              {bookmark.question.answerKey && (
                <p className="mt-3 text-xs text-amber-700">Imported answer key: {bookmark.question.answerKey}. Verify it against the original source before relying on it.</p>
              )}
            </article>
          ))}
        </div>
      ) : <Empty>No bookmarked questions yet. Open Question Bank and save a question to build your revision list.</Empty>}
    </Panel>
  );
}

function NotesScreen() {
  const [stored, setStored] = useState(() => readStudyNotes());
  const [error, setError] = useState<string | null>(stored.error);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const resetForm = () => {
    setTitle('');
    setBody('');
    setEditingId(null);
  };

  const saveNote = (event: FormEvent) => {
    event.preventDefault();
    if (stored.error) {
      setError(stored.error);
      return;
    }
    if (!title.trim() || !body.trim()) return;
    const note: StudyNote = {
      id: editingId || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title: title.trim(),
      body: body.trim(),
      updatedAt: Date.now(),
    };
    const next = editingId
      ? stored.items.map((item) => item.id === editingId ? note : item)
      : [note, ...stored.items];
    try {
      saveStudyNotes(next);
      setStored({ items: next, error: null });
      setError(null);
      resetForm();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const deleteNote = (id: string) => {
    if (stored.error) {
      setError(stored.error);
      return;
    }
    const next = stored.items.filter((item) => item.id !== id);
    try {
      saveStudyNotes(next);
      setStored({ items: next, error: null });
      setError(null);
      if (editingId === id) resetForm();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
      <Panel title={editingId ? 'Edit study note' : 'Write a study note'}>
        <form onSubmit={saveNote} className="mt-4 space-y-3">
          <label className="block text-sm font-medium text-slate-600">Title<input required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-200 px-3" /></label>
          <label className="block text-sm font-medium text-slate-600">Note<textarea required maxLength={10000} rows={8} value={body} onChange={(event) => setBody(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-200 p-3" /></label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={!!stored.error} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"><NotebookPen className="h-4 w-4" /> {editingId ? 'Save changes' : 'Save note'}</button>
            {editingId && <button type="button" onClick={resetForm} className="min-h-10 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-600">Cancel edit</button>}
          </div>
        </form>
        <p className="mt-4 text-xs text-slate-500">Notes are saved locally in this browser and are not synced to an account.</p>
        {(stored.error || error) && <p role="alert" className="mt-3 text-sm text-rose-700">{error || stored.error}</p>}
      </Panel>
      <Panel title={`Your notes (${stored.items.length})`}>
        {stored.items.length ? <div className="mt-3 space-y-3">{stored.items.map((note) => (
          <article key={note.id} className="rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1"><h3 className="text-sm font-bold">{note.title}</h3><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{note.body}</p><p className="mt-2 text-[11px] text-slate-400">Updated {new Date(note.updatedAt).toLocaleString()}</p></div>
              <div className="flex gap-2"><button type="button" onClick={() => { setEditingId(note.id); setTitle(note.title); setBody(note.body); }} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-blue-700">Edit</button><button type="button" onClick={() => deleteNote(note.id)} aria-label={`Delete note ${note.title}`} className="rounded-lg border border-rose-100 px-2.5 py-1.5 text-xs font-semibold text-rose-700">Delete</button></div>
            </div>
          </article>
        ))}</div> : <Empty>Your saved study notes will appear here.</Empty>}
      </Panel>
    </div>
  );
}

function FlashcardsScreen() {
  const [stored, setStored] = useState(() => readStudyFlashcards());
  const [error, setError] = useState<string | null>(stored.error);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [flippedCardId, setFlippedCardId] = useState<string | null>(null);

  const addCard = (event: FormEvent) => {
    event.preventDefault();
    if (stored.error) {
      setError(stored.error);
      return;
    }
    if (!front.trim() || !back.trim()) return;
    const next = [{ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, front: front.trim(), back: back.trim(), createdAt: Date.now() }, ...stored.items];
    try {
      saveStudyFlashcards(next);
      setStored({ items: next, error: null });
      setError(null);
      setFront('');
      setBack('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const deleteCard = (id: string) => {
    if (stored.error) {
      setError(stored.error);
      return;
    }
    const next = stored.items.filter((card) => card.id !== id);
    try {
      saveStudyFlashcards(next);
      setStored({ items: next, error: null });
      setError(null);
      if (flippedCardId === id) setFlippedCardId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <div className="space-y-5">
      <Panel title="Create a flashcard">
        <form onSubmit={addCard} className="grid gap-3 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-600">Front<textarea required maxLength={2000} rows={4} value={front} onChange={(event) => setFront(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-200 p-3" /></label>
          <label className="text-sm font-medium text-slate-600">Back<textarea required maxLength={4000} rows={4} value={back} onChange={(event) => setBack(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-200 p-3" /></label>
          <button type="submit" disabled={!!stored.error} className="inline-flex min-h-10 w-fit items-center gap-2 rounded-lg bg-blue-600 px-4 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"><Plus className="h-4 w-4" /> Add flashcard</button>
        </form>
        <p className="mt-3 text-xs text-slate-500">Cards are saved locally on this device.</p>
        {(stored.error || error) && <p role="alert" className="mt-3 text-sm text-rose-700">{error || stored.error}</p>}
      </Panel>
      <Panel title={`Your flashcards (${stored.items.length})`}>
        {stored.items.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{stored.items.map((card) => {
          const flipped = flippedCardId === card.id;
          return <article key={card.id} className="flex min-h-52 flex-col rounded-xl border border-slate-200 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{flipped ? 'Answer' : 'Prompt'}</p>
            <p className="mt-3 flex-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{flipped ? card.back : card.front}</p>
            <div className="mt-4 flex justify-between gap-2"><button type="button" onClick={() => setFlippedCardId(flipped ? null : card.id)} aria-pressed={flipped} className="min-h-10 rounded-lg bg-blue-50 px-3 text-sm font-bold text-blue-700 transition hover:bg-blue-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">{flipped ? 'Show prompt' : 'Reveal answer'}</button><button type="button" onClick={() => deleteCard(card.id)} className="min-h-10 rounded-lg border border-rose-200 px-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-600">Delete</button></div>
          </article>;
        })}</div> : <Empty>Create a card to start your personal quick-revision deck.</Empty>}
      </Panel>
    </div>
  );
}

function SyllabusTrackerScreen({ banks }: { banks: StoredQuestionBank[] }) {
  const questions = useMemo(() => flattenQuestions(banks), [banks]);
  const topics = [...new Map(questions.map((question) => [
    `${normalizeDashboardSubject(question.subject)}::${question.topic}`,
    { key: `${normalizeDashboardSubject(question.subject)}::${question.topic}`, subject: normalizeDashboardSubject(question.subject), topic: question.topic },
  ])).values()].sort((left, right) => left.subject.localeCompare(right.subject) || left.topic.localeCompare(right.topic));
  const [progress, setProgress] = useState(() => readSyllabusProgress());
  const [error, setError] = useState<string | null>(progress.error);
  const completed = new Set(progress.items);
  const completedCount = topics.filter((topic) => completed.has(topic.key)).length;

  const toggleTopic = (key: string) => {
    if (progress.error) {
      setError(progress.error);
      return;
    }
    const next = completed.has(key)
      ? progress.items.filter((item) => item !== key)
      : [...progress.items, key];
    try {
      saveSyllabusProgress(next);
      setProgress({ items: next, error: null });
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <Panel title="Syllabus Tracker">
      <p className="mt-2 text-sm leading-6 text-slate-500">Track topics represented in your saved question banks. This is personal checklist progress, not an official complete NEET syllabus.</p>
      {topics.length ? <>
        <div className="mt-4 rounded-xl bg-blue-50 p-4">
          <p className="text-sm font-bold text-blue-900">{completedCount} of {topics.length} available topics marked complete</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-blue-600 transition-[width]" style={{ width: `${Math.min(100, (completedCount / topics.length) * 100)}%` }} /></div>
        </div>
        <div className="mt-4 divide-y divide-slate-100">{topics.map((item) => (
          <label key={item.key} className="flex min-h-12 items-center gap-3 py-2 text-sm">
            <input type="checkbox" checked={completed.has(item.key)} disabled={!!progress.error} onChange={() => toggleTopic(item.key)} />
            <span className="min-w-0 flex-1"><strong>{item.topic}</strong><span className="ml-2 text-xs text-slate-500">{item.subject}</span></span>
          </label>
        ))}</div>
      </> : <Empty>No topics are available to track yet. Import a validated question bank to create a checklist from its saved subject/topic labels.</Empty>}
      {(progress.error || error) && <p role="alert" className="mt-3 text-sm text-rose-700">{error || progress.error}</p>}
    </Panel>
  );
}

function StreaksScreen({ sessions }: { sessions: ExamSessionState[] }) {
  const streak = getPracticeStreak(sessions);
  const activityDates = [...new Set(sessions.map((session) => {
    const date = new Date(session.submittedAt || 0);
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  }))].sort().reverse();
  return (
    <Panel title="Practice Streaks">
      <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-6">
        <div className="flex items-center gap-3"><TrendingUp className="h-7 w-7 text-blue-700" /><p className="text-3xl font-black text-slate-900">{streak} {streak === 1 ? 'day' : 'days'}</p></div>
        <p className="mt-2 text-sm text-slate-600">Consecutive calendar days with a completed test in saved history.</p>
      </div>
      {activityDates.length ? <div className="mt-4"><h3 className="text-sm font-bold">Saved practice days</h3><ul className="mt-2 divide-y divide-slate-100">{activityDates.map((date) => {
        const [year, month, day] = date.split('-').map(Number);
        return <li key={date} className="py-2 text-sm text-slate-600">{new Date(year, month, day).toLocaleDateString()}</li>;
      })}</ul></div> : <Empty>No completed saved tests yet. Your streak will be calculated from actual submitted-test history only.</Empty>}
    </Panel>
  );
}

function WeakTopicsScreen({ sessions }: { sessions: ExamSessionState[] }) {
  const topics = new Map<string, { subject: string; topic: string; attempted: number; correct: number }>();
  for (const session of sessions) {
    if (!session.examQuestions?.length) continue;
    const results = calculateExamResults(
      session.config,
      session.responses.answers,
      session.responses.statuses,
      session.answerKey,
      session.answerKeyStatus || (session.answerKey ? 'user-provided' : 'none')
    );
    if (!results.hasAnswerKey) continue;
    results.questionResults.forEach((result, index) => {
      const question = session.examQuestions?.[index];
      if (!question || result.isCorrect === null || !result.userAnswer || !result.correctAnswer) return;
      const subject = normalizeDashboardSubject(question.subject);
      const key = `${subject}::${question.topic}`;
      const current = topics.get(key) || { subject, topic: question.topic, attempted: 0, correct: 0 };
      current.attempted++;
      if (result.isCorrect) current.correct++;
      topics.set(key, current);
    });
  }
  const ranked = [...topics.values()].map((item) => ({
    ...item,
    accuracy: Math.round((item.correct / item.attempted) * 100),
  })).sort((left, right) => left.accuracy - right.accuracy || right.attempted - left.attempted);

  return (
    <Panel title="Weak Topics">
      <p className="mt-2 text-sm leading-6 text-slate-500">Ranked from topic-tagged questions in completed sessions with an authorized answer key. Accuracy and attempt counts are shown so small samples are clear.</p>
      {ranked.length ? <div className="mt-4 space-y-3">{ranked.map((item) => (
        <article key={`${item.subject}::${item.topic}`} className="rounded-xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-bold">{item.topic} <span className="font-normal text-slate-500">· {item.subject}</span></h3><strong className={item.accuracy < 60 ? 'text-rose-700' : 'text-slate-700'}>{item.accuracy}%</strong></div>
          <p className="mt-1 text-xs text-slate-500">{item.correct} correct of {item.attempted} keyed attempts</p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${item.accuracy < 60 ? 'bg-rose-500' : 'bg-blue-500'}`} style={{ width: `${item.accuracy}%` }} /></div>
        </article>
      ))}</div> : <Empty>Weak-topic analytics need a completed question-bank session with topic labels and a trusted answer key. No topics are inferred from unscored or PDF-only records.</Empty>}
    </Panel>
  );
}

function RevisionScreen({
  sessions,
  onOpenReport,
  quickOnly = false,
}: {
  sessions: ExamSessionState[];
  onOpenReport: FeatureScreensProps['onOpenReport'];
  quickOnly?: boolean;
}) {
  const revisionRows = sessions.flatMap((session) => {
    const results = calculateExamResults(session.config, session.responses.answers, session.responses.statuses, session.answerKey, session.answerKeyStatus || (session.answerKey ? 'user-provided' : 'none'));
    return Object.entries(session.responses.statuses).flatMap(([questionNumber, status]) => {
      const number = Number(questionNumber);
      const result = results.questionResults[number - 1];
      const marked = status === 'marked_for_review' || status === 'answered_marked_for_review';
      const incorrect = results.hasAnswerKey && result?.isCorrect === false;
      if (quickOnly && !marked) return [];
      if (!marked && !incorrect) return [];
      return [{ session, number, marked, incorrect, question: session.examQuestions?.[number - 1] }];
    });
  });
  return (
    <Panel title={quickOnly ? 'Quick Revision' : 'Questions to revisit'}>
      <p className="mt-2 text-sm text-slate-500">{quickOnly ? 'A focused list of questions you marked for review in submitted sessions.' : 'Uses actual marked-for-review responses and incorrect answers from submitted sessions. Incorrect status is shown only when the saved answer key is authorized.'}</p>
      {revisionRows.length ? <div className="mt-4 space-y-3">{revisionRows.map((row, index) => <article key={`${row.session.config.id}-${row.number}-${index}`} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">{row.session.config.title} · Question {row.number}</strong><span className="text-xs font-semibold text-violet-700">{[row.marked && 'Marked for review', row.incorrect && 'Incorrect'].filter(Boolean).join(' · ')}</span></div>{row.question ? <><p className="mt-2 text-sm leading-6 text-slate-700"><MathText text={row.question.questionEn} /></p><QuestionImages images={row.question.images} type="question" /></> : <p className="mt-2 text-xs text-slate-500">Question text was not stored for this PDF/demo session; open the report to review the saved response status.</p>}<button type="button" onClick={() => onOpenReport(row.session)} className="mt-3 text-xs font-bold text-blue-700 hover:underline">Open completed report</button></article>)}</div> : <Empty>No saved marked or authorized incorrect questions are available for revision yet. Mark questions for review or complete a keyed question-bank test.</Empty>}
    </Panel>
  );
}

interface StudyTask {
  id: string;
  title: string;
  subject: string;
  topic: string;
  dueDate: string;
  done: boolean;
}

const STUDY_PLAN_KEY = 'oinkie_prep_study_plan_v1';

function StudyPlanScreen() {
  const ownerId = getActiveAccountOwnerId();
  const storageKey = ownerId ? getAccountLocalStorageKey(ownerId, STUDY_PLAN_KEY) : STUDY_PLAN_KEY;
  const initial = (): { tasks: StudyTask[]; error: string | null } => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved) return { tasks: [], error: null };
      const parsed: unknown = JSON.parse(saved);
      if (!Array.isArray(parsed) || parsed.some((task) => !task || typeof task.id !== 'string' || typeof task.title !== 'string' || typeof task.subject !== 'string' || typeof task.topic !== 'string' || typeof task.dueDate !== 'string' || typeof task.done !== 'boolean')) {
        return { tasks: [], error: 'Saved study-plan data has an unsupported format; it was preserved without changes.' };
      }
      return { tasks: parsed as StudyTask[], error: null };
    } catch (cause) {
      return { tasks: [], error: `Could not read the saved study plan: ${cause instanceof Error ? cause.message : String(cause)}` };
    }
  };
  const [initialState] = useState(initial);
  const [tasks, setTasks] = useState(initialState.tasks);
  const [loadError, setLoadError] = useState(initialState.error);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('Physics');
  const [topic, setTopic] = useState('');
  const [dueDate, setDueDate] = useState('');

  const persist = (next: StudyTask[]) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setTasks(next);
      setSaveError(null);
      setLoadError(null);
    } catch (cause) {
      setSaveError(`Could not save the study plan: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  };
  const addTask = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    persist([...tasks, { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, title: title.trim(), subject, topic: topic.trim(), dueDate, done: false }]);
    setTitle('');
    setTopic('');
    setDueDate('');
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
      <Panel title="Plan a study task">
        <form onSubmit={addTask} className="mt-4 space-y-3">
          <label className="block text-sm font-medium text-slate-600">Task<input required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Revise Newton's laws" className="mt-1 block min-h-10 w-full rounded-lg border border-slate-200 px-3" /></label>
          <label className="block text-sm font-medium text-slate-600">Subject<select value={subject} onChange={(event) => setSubject(event.target.value)} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3">{['Physics', 'Chemistry', 'Biology'].map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="block text-sm font-medium text-slate-600">Topic (optional)<input maxLength={100} value={topic} onChange={(event) => setTopic(event.target.value)} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-200 px-3" /></label>
          <label className="block text-sm font-medium text-slate-600">Target date (optional)<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-200 px-3" /></label>
          <button type="submit" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 font-bold text-white"><Plus className="h-4 w-4" /> Add to plan</button>
        </form>
        <p className="mt-4 text-xs leading-5 text-slate-500">Tasks are stored locally in this browser. This plan does not infer progress from unsubmitted tests.</p>
        {(loadError || saveError) && <p role="alert" className="mt-3 text-sm text-rose-700">{saveError || loadError}</p>}
      </Panel>
      <Panel title={`Your plan (${tasks.filter((task) => !task.done).length} remaining)`}>
        {tasks.length ? <ul className="mt-3 divide-y divide-slate-100">{tasks.map((task) => <li key={task.id} className="flex items-center gap-3 py-3"><input type="checkbox" checked={task.done} aria-label={`Mark ${task.title} ${task.done ? 'incomplete' : 'complete'}`} onChange={() => persist(tasks.map((item) => item.id === task.id ? { ...item, done: !item.done } : item))} /><span className={`min-w-0 flex-1 ${task.done ? 'text-slate-400 line-through' : 'text-slate-800'}`}><strong className="block text-sm">{task.title}</strong><span className="text-xs text-slate-500">{task.subject}{task.topic ? ` · ${task.topic}` : ''}{task.dueDate ? ` · Due ${task.dueDate}` : ''}</span></span><button type="button" aria-label={`Delete ${task.title}`} onClick={() => persist(tasks.filter((item) => item.id !== task.id))} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-700"><Trash2 className="h-4 w-4" /></button></li>)}</ul> : <Empty>Add a task to start building a local study plan.</Empty>}
      </Panel>
    </div>
  );
}

function SettingsScreen({
  bankCount,
  sessionCount,
  onBanksUpdated,
}: {
  bankCount: number;
  sessionCount: number;
  onBanksUpdated: (banks: StoredQuestionBank[]) => void;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clearBanks = async () => {
    if (!window.confirm('Remove saved question banks from this browser? Completed reports and saved study plan will remain.')) return;
    try {
      await clearStoredQuestionBanks();
      onBanksUpdated([]);
      setMessage('Saved question banks were removed. Completed reports and study-plan tasks were kept.');
      setError(null);
    } catch (cause) {
      setError(`Could not remove saved question banks: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  };
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Panel title="Appearance">
        <p className="mt-3 text-sm leading-6 text-slate-600">Switch between Modern Light and Premium Dark modes using the theme button in the dashboard or exam header. Your preference is saved on this device.</p>
      </Panel>
      <Panel title="Local data">
        <p className="mt-3 text-sm leading-6 text-slate-600">Data stays in this browser. Question-bank source files and embedded images use IndexedDB; no account or cloud sync is enabled.</p>
        <dl className="mt-4 space-y-2 text-sm"><div className="flex justify-between gap-3"><dt>Saved question banks</dt><dd className="font-bold">{bankCount}</dd></div><div className="flex justify-between gap-3"><dt>Completed reports</dt><dd className="font-bold">{sessionCount}</dd></div></dl>
        <button type="button" onClick={clearBanks} disabled={!bankCount} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg border border-rose-200 px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"><Trash2 className="h-4 w-4" /> Remove saved question banks</button>
        {message && <p role="status" className="mt-3 text-sm text-emerald-700">{message}</p>}
        {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
        <p className="mt-3 text-xs leading-5 text-slate-500">This control removes only the question-bank library. Exam reports and study-plan tasks are preserved.</p>
      </Panel>
      <Panel title="Data safety" className="md:col-span-2">
        <p className="mt-2 text-sm leading-6 text-slate-600">Keep independent copies of source PDFs and JSON banks. Clearing browser site data can permanently remove local practice history and saved files.</p>
      </Panel>
    </div>
  );
}

function SearchScreen({
  query,
  banks,
  sessions,
  onNavigate,
  onOpenReport,
}: {
  query: string;
  banks: StoredQuestionBank[];
  sessions: ExamSessionState[];
  onNavigate: FeatureScreensProps['onNavigate'];
  onOpenReport: FeatureScreensProps['onOpenReport'];
}) {
  const normalized = query.trim().toLocaleLowerCase();
  const questionMatches = flattenQuestions(banks).filter((question) =>
    [question.questionEn, question.subject, question.topic, ...Object.values(question.options).map((option) => option.textEn)].join(' ').toLocaleLowerCase().includes(normalized)
  ).slice(0, 12);
  const testMatches = sessions.filter((session) =>
    [session.config.title, session.config.pdfFileName || '', session.config.candidateName, ...(session.examQuestions || []).flatMap((question) => [question.questionEn, question.subject, question.topic])].join(' ').toLocaleLowerCase().includes(normalized)
  );
  const subjectMatches = ['Physics', 'Chemistry', 'Biology'].filter((subject) => subject.toLocaleLowerCase().includes(normalized));

  return (
    <div className="space-y-5">
      <Panel title={`Search results for “${query}”`}>
        <div className="mt-3 flex flex-wrap gap-2">
          {subjectMatches.map((subject) => <button key={subject} type="button" onClick={() => onNavigate('question-bank', subject)} className="rounded-full bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700">Subject: {subject}</button>)}
          <button type="button" onClick={() => onNavigate('history')} className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700">Search completed reports</button>
          <button type="button" onClick={() => onNavigate('question-bank')} className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700">Browse question bank</button>
        </div>
      </Panel>
      <Panel title={`Matching saved questions (${questionMatches.length})`}>
        {questionMatches.length ? <div className="mt-2 divide-y divide-slate-100">{questionMatches.map((question, index) => <p key={`${question.id}-${index}`} className="py-3 text-sm leading-6"><strong>{question.subject} · {question.topic}:</strong> <MathText text={question.questionEn} /></p>)}</div> : <Empty>No saved question text matches this search.</Empty>}
      </Panel>
      <Panel title={`Matching completed reports (${testMatches.length})`}>
        {testMatches.length ? <div className="mt-2 space-y-2">{testMatches.map((session) => <button key={`${session.config.id}-${session.submittedAt}`} type="button" onClick={() => onOpenReport(session)} className="flex min-h-12 w-full items-center gap-2 rounded-lg bg-slate-50 px-3 text-left text-sm font-semibold hover:bg-blue-50"><FileText className="h-4 w-4 text-blue-700" />{session.config.title}<span className="ml-auto text-xs text-slate-500">{session.config.totalQuestions} questions</span></button>)}</div> : <Empty>No saved completed reports match this search.</Empty>}
      </Panel>
    </div>
  );
}

function PyqTestsScreen({
  banks,
  bankLoadError,
  onNavigate,
  onStartTest,
}: {
  banks: StoredQuestionBank[];
  bankLoadError: string | null;
  onNavigate: FeatureScreensProps['onNavigate'];
  onStartTest: FeatureScreensProps['onStartTest'];
}) {
  const papers = useMemo(() => getPrebuiltPyqPapers(banks), [banks]);
  const [selectedBankId, setSelectedBankId] = useState('');
  const [startError, setStartError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const selectedPaper = papers.find((paper) => paper.bankId === selectedBankId);

  const startPaper = async (paper: PyqPaper) => {
    if (!paper.durationMinutes) {
      setStartError('This paper has no duration in its metadata and cannot be started as a timed CBT test.');
      return;
    }
    setStartError(null);
    setIsStarting(true);
    try {
      await onStartTest(paper.questions, paper.durationMinutes, `NEET ${paper.year} - ${paper.title}`);
    } catch (error) {
      setStartError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <Panel title="Available papers">
      {bankLoadError && <p role="alert" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{bankLoadError}</p>}
      {papers.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center">
          <FileText className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
          <h3 className="mt-3 text-base font-bold text-slate-800">No pre-built NEET PYQ papers are available yet</h3>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Papers appear here only when their imported bank explicitly identifies them as NEET previous-year papers. The bundled demo and practice-bank files are not identified as NEET PYQs, so they are not shown as tests.
          </p>
          <button
            type="button"
            onClick={() => onNavigate('custom-test')}
            className="mt-5 inline-flex min-h-10 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            Open Custom Test Builder
          </button>
        </div>
      ) : (
        <>
          <p className="mt-2 text-sm leading-6 text-slate-500">Select a paper to review its details and instructions before starting.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {papers.map((paper) => (
              <article key={paper.bankId} className={`rounded-xl border p-4 ${selectedBankId === paper.bankId ? 'border-blue-300 bg-blue-50/50' : 'border-slate-200 bg-white'}`}>
                <h3 className="font-bold text-slate-800">{paper.title}</h3>
                <p className="mt-1 text-sm font-semibold text-blue-700">NEET {paper.year}{paper.session ? ` · ${paper.session}` : ''}</p>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-slate-600">
                  <div><dt className="font-semibold text-slate-500">Questions</dt><dd>{paper.questions.length}</dd></div>
                  {paper.durationMinutes && <div><dt className="font-semibold text-slate-500">Duration</dt><dd>{paper.durationMinutes} minutes</dd></div>}
                  {paper.marks && <div><dt className="font-semibold text-slate-500">Marks</dt><dd>{paper.marks}</dd></div>}
                  {paper.subjects.length > 0 && <div className="col-span-2"><dt className="font-semibold text-slate-500">Subjects</dt><dd>{paper.subjects.join(', ')}</dd></div>}
                </dl>
                <button
                  type="button"
                  onClick={() => { setSelectedBankId(paper.bankId); setStartError(null); }}
                  aria-pressed={selectedBankId === paper.bankId}
                  className="mt-4 min-h-10 rounded-lg border border-blue-200 bg-white px-3 text-sm font-bold text-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  View details & instructions
                </button>
              </article>
            ))}
          </div>
          {selectedPaper && (
            <section aria-labelledby="pyq-paper-details" className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
              <h3 id="pyq-paper-details" className="text-base font-extrabold text-slate-800">Paper details & instructions</h3>
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="font-semibold text-slate-500">Paper</dt><dd>{selectedPaper.title}</dd></div>
                <div><dt className="font-semibold text-slate-500">Exam year</dt><dd>{selectedPaper.year}</dd></div>
                {selectedPaper.session && <div><dt className="font-semibold text-slate-500">Paper/session</dt><dd>{selectedPaper.session}</dd></div>}
                <div><dt className="font-semibold text-slate-500">Question count</dt><dd>{selectedPaper.questions.length}</dd></div>
                {selectedPaper.durationMinutes && <div><dt className="font-semibold text-slate-500">Duration</dt><dd>{selectedPaper.durationMinutes} minutes</dd></div>}
                {selectedPaper.marks && <div><dt className="font-semibold text-slate-500">Marks</dt><dd>{selectedPaper.marks}</dd></div>}
                {selectedPaper.subjects.length > 0 && <div className="sm:col-span-2"><dt className="font-semibold text-slate-500">Subjects</dt><dd>{selectedPaper.subjects.join(', ')}</dd></div>}
              </dl>
              <ul className="mt-4 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-600">
                <li>The paper will open in the existing CBT interface with its timer, question navigation, and answer controls.</li>
                <li>After submission, the existing results, analysis, scoring, and question-review workflow applies.</li>
                <li>Imported answer keys retain their existing source-verification status and are not treated as independently verified.</li>
              </ul>
              {startError && <p role="alert" className="mt-3 text-sm text-rose-700">{startError}</p>}
              {!selectedPaper.durationMinutes && <p className="mt-3 text-sm text-amber-700">A duration is not available for this paper, so it cannot be started as a timed CBT test.</p>}
              <button
                type="button"
                onClick={() => void startPaper(selectedPaper)}
                disabled={!selectedPaper.durationMinutes || isStarting}
                className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                <Play className="h-4 w-4" aria-hidden="true" /> {isStarting ? 'Starting paper…' : 'Start paper'}
              </button>
            </section>
          )}
        </>
      )}
    </Panel>
  );
}

export const FeatureScreens: React.FC<FeatureScreensProps> = (props) => {
  const { screen, searchQuery = '', sessions, onBack, onNavigate, onOpenReport, onStartTest } = props;
  const [banks, setBanks] = useState(() => readStoredQuestionBanks().banks);
  const [bankLoadError, setBankLoadError] = useState<string | null>(null);
  useEffect(() => {
    if (screen === 'question-bank') return;
    let active = true;
    void loadStoredQuestionBanks().then((result) => {
      if (active) {
        setBanks(result.banks);
        setBankLoadError(result.error);
      }
    });
    return () => { active = false; };
  }, [screen]);
  const descriptions: Record<FeatureScreen, { title: string; description: string; icon: React.ElementType }> = {
    'pyq-tests': { title: 'NEET PYQ Tests', description: 'Browse NEET previous-year papers explicitly identified in saved question-bank metadata and start them in the CBT exam interface.', icon: FileText },
    'mock-test': { title: 'Start Mock Test', description: 'Set up a timed mock practice using only questions available in your saved question banks.', icon: BookOpen },
    'custom-test': { title: 'Custom Test Builder', description: 'Choose a subject, topic, question count, and duration from real imported questions.', icon: Activity },
    'question-bank': { title: 'Question Bank', description: 'Manage local JSON banks by subject, search questions, preview content, and reuse banks.', icon: Library },
    performance: { title: 'Performance Analytics', description: 'Review accuracy, subject performance, and trends calculated from submitted attempts.', icon: Activity },
    revision: { title: 'Revision Center', description: 'Revisit saved marked questions and incorrect answers where an authorized key is available.', icon: Bookmark },
    'quick-revision': { title: 'Quick Revision', description: 'Quickly revisit questions you marked for review in completed practice sessions.', icon: Bookmark },
    'weak-topics': { title: 'Weak Topics', description: 'Identify topic areas that need attention from scored, topic-tagged completed practice.', icon: Target },
    syllabus: { title: 'Syllabus Tracker', description: 'Track your progress through topics represented in your saved question banks.', icon: Check },
    streaks: { title: 'Practice Streaks', description: 'See consecutive days calculated from completed tests saved on this device.', icon: TrendingUp },
    bookmarks: { title: 'Bookmarks', description: 'Review questions you bookmarked from your saved question banks.', icon: Bookmark },
    notes: { title: 'Study Notes', description: 'Write, edit, and keep personal study notes in this browser.', icon: NotebookPen },
    flashcards: { title: 'Flashcards', description: 'Create and flip through your own locally saved study cards.', icon: Library },
    'study-plan': { title: 'Study Plan', description: 'Create and track your own subject and topic tasks, saved locally in this browser.', icon: CalendarDays },
    history: { title: 'Test History', description: 'Browse completed attempts and open the reports stored on this device.', icon: FileText },
    'saved-papers': { title: 'Saved Papers', description: 'Review completed reports associated with imported PDF papers.', icon: FileText },
    settings: { title: 'Settings', description: 'Review the app’s supported appearance and manage local question-bank data.', icon: Settings },
    search: { title: 'Search', description: 'Search question text, subjects, topics, and saved completed attempts.', icon: Search },
    profile: { title: 'Profile & Account', description: 'Manage your aspirant profile and account access.', icon: UserRound },
  };
  const heading = descriptions[screen];

  return (
    <FeatureFrame title={heading.title} description={heading.description} icon={heading.icon} onBack={onBack}>
      {screen === 'pyq-tests' && <PyqTestsScreen banks={banks} bankLoadError={bankLoadError} onNavigate={onNavigate} onStartTest={onStartTest} />}
      {screen === 'question-bank' && <QuestionBankScreen onNavigate={onNavigate} initialQuery={searchQuery} onBanksUpdated={setBanks} />}
      {screen === 'custom-test' && <TestBuilder banks={banks} onNavigate={onNavigate} onStartTest={onStartTest} />}
      {screen === 'mock-test' && <MockTestScreen banks={banks} onNavigate={onNavigate} onStartTest={onStartTest} />}
      {screen === 'performance' && <PerformanceScreen sessions={sessions} />}
      {screen === 'revision' && <RevisionScreen sessions={sessions} onOpenReport={onOpenReport} />}
      {screen === 'quick-revision' && <RevisionScreen sessions={sessions} onOpenReport={onOpenReport} quickOnly />}
      {screen === 'weak-topics' && <WeakTopicsScreen sessions={sessions} />}
      {screen === 'syllabus' && <SyllabusTrackerScreen banks={banks} />}
      {screen === 'streaks' && <StreaksScreen sessions={sessions} />}
      {screen === 'bookmarks' && <BookmarksScreen />}
      {screen === 'notes' && <NotesScreen />}
      {screen === 'flashcards' && <FlashcardsScreen />}
      {screen === 'study-plan' && <StudyPlanScreen />}
      {screen === 'history' && <HistoryScreen sessions={sessions} onOpenReport={onOpenReport} />}
      {screen === 'saved-papers' && <HistoryScreen sessions={sessions} onOpenReport={onOpenReport} onlyPapers />}
      {screen === 'settings' && <SettingsScreen bankCount={banks.length} sessionCount={sessions.length} onBanksUpdated={setBanks} />}
      {screen === 'search' && <SearchScreen query={searchQuery} banks={banks} sessions={sessions} onNavigate={onNavigate} onOpenReport={onOpenReport} />}
      <div className="sr-only" aria-live="polite">{banks.length} saved question banks available</div>
    </FeatureFrame>
  );
};
