import {
  AlertCircle,
  ArrowLeft,
  Atom,
  Bug,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Database,
  Filter,
  FlaskConical,
  History,
  Leaf,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import {
  QUESTION_BANK_IMPORT_MAX,
  QUESTION_BANK_IMPORT_MAX_BYTES,
  type AdminQuestionSummary,
  type QuestionBankAdminStatus,
  type QuestionBankAdminStatusState,
  type QuestionBankAnswerFilter,
  type QuestionBankImportResponse,
  type QuestionBankLanguageFilter,
  type QuestionBankListResponse,
} from '../questionBanks/adminContracts';
import {
  QUESTION_BANK_ADMIN_SECTIONS,
  QUESTION_BANK_OTHER_SOURCE_IDS,
  getQuestionBankAdminSection,
  getQuestionBankSource,
  requireQuestionBankAdminSection,
  requireQuestionBankSource,
  type QuestionBankAdminSectionDefinition,
  type QuestionBankAdminSectionId,
  type QuestionBankSourceDefinition,
  type QuestionBankSourceId,
  type QuestionBankSubject,
} from '../questionBanks/sourceRegistry';
import {
  createEmptyQuestionDraft,
  normalizeQuestionInput,
  type QuestionBankQuestionDraft,
} from '../questionBanks/questionInput';
import { extractQuestionBankImport } from '../questionBanks/importQuestions';
import { parseRemoteQuestionImagePreview } from '../questionBanks/questionInput';
import type { ExamImage } from '../types/exam';
import {
  buildQuestionBankTemplate,
  questionBankTemplateFileName,
} from '../questionBanks/questionTemplate';
import {
  AdminQuestionBankApiError,
  createAdminQuestion,
  deleteAdminQuestion,
  importAdminQuestions,
  loadAdminQuestionBankStatuses,
  loadAdminQuestions,
  updateAdminQuestion,
} from './questionBankAdminApi';
import { QuestionBankImportPanel } from './QuestionBankImportPanel';
import { QuestionBankQuestionForm } from './QuestionBankQuestionForm';

type SecondarySourceId = (typeof QUESTION_BANK_OTHER_SOURCE_IDS)[number];

type ManagerView =
  | { kind: 'overview' }
  | { kind: 'section'; sectionId: QuestionBankAdminSectionId }
  | { kind: 'source'; sourceId: SecondarySourceId };

interface FilterState {
  search: string;
  subject: string;
  chapter: string;
  topic: string;
  section: string;
  exercise: string;
  difficulty: string;
  language: QuestionBankLanguageFilter;
  answer: QuestionBankAnswerFilter;
  sourcePdf: string;
}

interface ImportPreviewState {
  fileName: string;
  format: string;
  validQuestions: unknown[];
  invalid: string[];
  warnings: string[];
  tooMany: boolean;
  sample: string;
  images: ExamImage[];
}

interface ManagerNotice {
  kind: 'success' | 'error';
  message: string;
  issues: string[];
}

export interface QuestionBankManagerProps {
  initialSectionId?: QuestionBankAdminSectionId | null;
}

const MAX_IMPORT_BYTES = QUESTION_BANK_IMPORT_MAX_BYTES;

const inputClass =
  'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100';
const labelClass = 'block text-xs font-bold text-slate-600';
const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60';
const secondaryButtonClass =
  'inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60';
const dangerButtonClass =
  'inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60';

const STATUS_META: Record<QuestionBankAdminStatusState, { label: string; className: string }> = {
  connected: { label: 'Connected', className: 'bg-emerald-50 text-emerald-700' },
  empty: { label: 'Connected · empty', className: 'bg-sky-50 text-sky-700' },
  unavailable: { label: 'Unavailable', className: 'bg-rose-50 text-rose-700' },
  'permission-denied': { label: 'Permission denied', className: 'bg-rose-50 text-rose-700' },
  'missing-table': { label: 'Missing table', className: 'bg-amber-50 text-amber-800' },
  'invalid-configuration': { label: 'Server setup needed', className: 'bg-amber-50 text-amber-800' },
};

const SECTION_ICON: Record<QuestionBankAdminSectionId, LucideIcon> = {
  physics: Atom,
  chemistry: FlaskConical,
  botany: Leaf,
  zoology: Bug,
  pyqs: History,
};

const SECTION_ICON_CLASS: Record<QuestionBankAdminSectionId, string> = {
  physics: 'bg-sky-50 text-sky-700',
  chemistry: 'bg-violet-50 text-violet-700',
  botany: 'bg-emerald-50 text-emerald-700',
  zoology: 'bg-amber-50 text-amber-700',
  pyqs: 'bg-slate-100 text-slate-600',
};

function emptyFilters(): FilterState {
  return {
    search: '',
    subject: '',
    chapter: '',
    topic: '',
    section: '',
    exercise: '',
    difficulty: '',
    language: 'all',
    answer: 'all',
    sourcePdf: '',
  };
}

function readableError(error: unknown): ManagerNotice {
  if (error instanceof AdminQuestionBankApiError) {
    return {
      kind: 'error',
      message: error.message,
      issues: error.issues,
    };
  }
  return {
    kind: 'error',
    message: error instanceof Error ? error.message : 'The question-bank request failed.',
    issues: [],
  };
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return 'Not checked yet';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not checked yet' : date.toLocaleString();
}

function textValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
}

function sourceForSection(
  section: QuestionBankAdminSectionDefinition,
): QuestionBankSourceDefinition | null {
  return section.sourceId ? getQuestionBankSource(section.sourceId) : null;
}

function draftFromRow(
  source: QuestionBankSourceDefinition,
  row: Record<string, unknown>,
  lockedSubject: QuestionBankSubject | null,
): QuestionBankQuestionDraft {
  const draft = createEmptyQuestionDraft(source.id, lockedSubject);
  draft.question_code = textValue(row.question_code);
  draft.subject = source.subjectField
    ? lockedSubject ?? (textValue(row[source.subjectField]) || source.fixedSubject || '')
    : source.fixedSubject ?? '';
  draft.chapter = textValue(row.chapter);
  draft.topic = textValue(row.topic);
  draft.section = textValue(row.section);
  draft.exercise = textValue(row.exercise);
  draft.question_en = textValue(row.question_en);
  draft.question_hi = textValue(row.question_hi);
  draft.answer_key = textValue(row.answer_key).trim().toUpperCase();
  draft.answer_key_source = textValue(row.answer_key_source);
  draft.explanation_en = textValue(row.explanation_en);
  draft.explanation_hi = textValue(row.explanation_hi);
  draft.difficulty = textValue(row.difficulty);
  draft.source_page = textValue(row.source_page);
  draft.tags = Array.isArray(row.tags)
    ? row.tags.filter((tag): tag is string => typeof tag === 'string').join(', ')
    : textValue(row.tags);
  draft.images = row.images === undefined || row.images === null
    ? ''
    : typeof row.images === 'string'
      ? row.images
      : JSON.stringify(row.images);

  const sourcePdf = row.source_pdf;
  if (typeof sourcePdf === 'string') {
    draft.source_pdf = sourcePdf;
  } else if (sourcePdf && typeof sourcePdf === 'object' && !Array.isArray(sourcePdf)) {
    const record = sourcePdf as Record<string, unknown>;
    draft.source_pdf = textValue(record.file_name ?? record.fileName ?? record.name);
  }

  const options = row.options;
  const optionRecord = options && typeof options === 'object' && !Array.isArray(options)
    ? options as Record<string, unknown>
    : null;
  const optionArray = Array.isArray(options) ? options : null;
  (['A', 'B', 'C', 'D'] as const).forEach((letter, index) => {
    const option = optionRecord
      ? optionRecord[letter]
      : optionArray
        ? optionArray[index]
        : null;
    if (typeof option === 'string') {
      draft.options[letter] = { text_en: option, text_hi: '' };
    } else if (option && typeof option === 'object' && !Array.isArray(option)) {
      const optionValue = option as Record<string, unknown>;
      draft.options[letter] = {
        text_en: textValue(optionValue.text_en ?? optionValue.textEn ?? optionValue.text),
        text_hi: textValue(optionValue.text_hi ?? optionValue.textHi),
      };
    }
  });
  return draft;
}

function sourceCountLabel(status: QuestionBankAdminStatus | undefined): string {
  if (!status) return 'Count not verified';
  if (status.count === null) return 'Count unavailable';
  return `${status.count.toLocaleString()} verified row${status.count === 1 ? '' : 's'}`;
}

function importSample(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return 'The first valid record is not a question object.';
  }
  const record = value as Record<string, unknown>;
  const preview = textValue(record.question_en)
    || textValue(record.question_hi)
    || textValue(record.question_code);
  return preview.replace(/\s+/g, ' ').trim().slice(0, 220) || 'The first valid record has no question text.';
}

function AnswerBadge({ answer }: { answer: AdminQuestionSummary['answerKey'] }) {
  return answer ? (
    <span className="inline-flex min-w-6 items-center justify-center rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-black text-emerald-700">
      {answer}
    </span>
  ) : (
    <span className="text-[10px] font-semibold text-slate-400">No key</span>
  );
}

export function QuestionBankManager({
  initialSectionId = null,
}: QuestionBankManagerProps) {
  const initialSection = initialSectionId
    ? requireQuestionBankAdminSection(initialSectionId)
    : null;
  const initialSource = initialSection ? sourceForSection(initialSection) : null;

  const [statuses, setStatuses] = useState<QuestionBankAdminStatus[] | null>(null);
  const [statusError, setStatusError] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(true);
  const [view, setView] = useState<ManagerView>(() => (
    initialSectionId ? { kind: 'section', sectionId: initialSectionId } : { kind: 'overview' }
  ));
  const [filters, setFilters] = useState<FilterState>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(emptyFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [list, setList] = useState<QuestionBankListResponse | null>(null);
  const [listError, setListError] = useState('');
  const [isListLoading, setIsListLoading] = useState(Boolean(initialSource));
  const [notice, setNotice] = useState<ManagerNotice | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<QuestionBankQuestionDraft>(() =>
    createEmptyQuestionDraft(initialSource?.id ?? 'physics', initialSection?.subject ?? null));
  const [formIssues, setFormIssues] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreviewState | null>(null);
  const [importError, setImportError] = useState('');
  const [importResult, setImportResult] = useState<QuestionBankImportResponse | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const listRequestId = useRef(0);

  const activeSection = view.kind === 'section'
    ? getQuestionBankAdminSection(view.sectionId)
    : null;
  const source = activeSection
    ? sourceForSection(activeSection)
    : view.kind === 'source'
      ? getQuestionBankSource(view.sourceId)
      : null;
  const activeSectionId = activeSection?.id ?? null;
  const lockedSubject = activeSection?.subject ?? null;
  const destinationLabel = activeSection?.label ?? source?.label ?? 'Question bank';
  const fixedFilterSubject = lockedSubject ?? source?.fixedSubject ?? '';
  const sourceSubjectLock = source?.subjectField ? lockedSubject : null;

  const selectedStatus = useMemo(
    () => source && statuses
      ? statuses.find((status) => status.source === source.id)
      : undefined,
    [statuses, source],
  );

  const refreshStatuses = useCallback(async () => {
    setIsRefreshing(true);
    setStatusError('');
    try {
      setStatuses(await loadAdminQuestionBankStatuses());
    } catch (error) {
      setStatusError(readableError(error).message);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const loadList = useCallback(async () => {
    const requestId = listRequestId.current + 1;
    listRequestId.current = requestId;
    if (!source) {
      setList(null);
      setListError('');
      setIsListLoading(false);
      return;
    }
    setIsListLoading(true);
    setListError('');
    try {
      const result = await loadAdminQuestions(
        source.id,
        {
          page,
          pageSize,
          search: appliedFilters.search,
          subject: lockedSubject ?? appliedFilters.subject,
          chapter: appliedFilters.chapter,
          topic: appliedFilters.topic,
          section: appliedFilters.section,
          exercise: appliedFilters.exercise,
          difficulty: appliedFilters.difficulty,
          language: appliedFilters.language,
          answer: appliedFilters.answer,
          sourcePdf: appliedFilters.sourcePdf,
        },
        activeSectionId,
      );
      if (requestId !== listRequestId.current) return;
      setList(result);
      const lastPage = Math.max(1, Math.ceil(result.count / result.pageSize));
      if (result.page > lastPage) setPage(lastPage);
    } catch (error) {
      if (requestId !== listRequestId.current) return;
      setListError(readableError(error).message);
    } finally {
      if (requestId === listRequestId.current) setIsListLoading(false);
    }
  }, [activeSectionId, appliedFilters, lockedSubject, page, pageSize, source]);

  useEffect(() => {
    void refreshStatuses();
  }, [refreshStatuses]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const resetDestinationState = (
    nextSourceId: QuestionBankSourceId | null,
    nextLockedSubject: QuestionBankSubject | null,
  ) => {
    setFilters(emptyFilters());
    setAppliedFilters(emptyFilters());
    setPage(1);
    setList(null);
    setListError('');
    setIsListLoading(Boolean(nextSourceId));
    setFormOpen(false);
    setEditingId(null);
    setFormIssues([]);
    setDraft(createEmptyQuestionDraft(nextSourceId ?? 'physics', nextLockedSubject));
    setImportPreview(null);
    setImportError('');
    setImportResult(null);
    setNotice(null);
  };

  const confirmDiscard = (): boolean => (
    !formOpen || window.confirm('Discard the unsaved question and switch section?')
  );

  const openSection = (sectionId: QuestionBankAdminSectionId) => {
    if (view.kind === 'section' && view.sectionId === sectionId) return;
    if (!confirmDiscard()) return;
    const section = requireQuestionBankAdminSection(sectionId);
    const nextSource = sourceForSection(section);
    setView({ kind: 'section', sectionId });
    resetDestinationState(nextSource?.id ?? null, section.subject);
  };

  const openSource = (sourceId: SecondarySourceId) => {
    if (view.kind === 'source' && view.sourceId === sourceId) return;
    if (!confirmDiscard()) return;
    const nextSource = requireQuestionBankSource(sourceId);
    setView({ kind: 'source', sourceId });
    resetDestinationState(nextSource.id, null);
  };

  const goBackToSections = () => {
    if (view.kind === 'overview') return;
    if (!confirmDiscard()) return;
    setView({ kind: 'overview' });
    resetDestinationState(null, null);
  };

  const revealEditor = () => {
    window.requestAnimationFrame(() => {
      document.getElementById('question-bank-editor')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  };

  const startAdding = () => {
    if (!source) return;
    setFormOpen(true);
    setEditingId(null);
    setDraft(createEmptyQuestionDraft(source.id, lockedSubject));
    setFormIssues([]);
    setNotice(null);
    revealEditor();
  };

  const startEditing = (question: AdminQuestionSummary) => {
    if (!source) return;
    setFormOpen(true);
    setEditingId(question.id);
    setDraft(draftFromRow(source, question.raw, lockedSubject));
    setFormIssues([]);
    setNotice(null);
    revealEditor();
  };

  const closeForm = () => {
    if (isSaving) return;
    setFormOpen(false);
    setEditingId(null);
    setFormIssues([]);
  };

  const refreshAfterMutation = async () => {
    await refreshStatuses();
    await loadList();
  };

  const handleSave = async () => {
    if (!source) return;
    const normalized = normalizeQuestionInput(draft, source, { lockedSubject });
    if (!normalized.ok) {
      setFormIssues(normalized.errors);
      return;
    }
    setIsSaving(true);
    setFormIssues([]);
    setNotice(null);
    try {
      const response = editingId
        ? await updateAdminQuestion(
          source.id,
          source.table,
          editingId,
          draft,
          activeSectionId,
        )
        : await createAdminQuestion(source.id, source.table, draft, activeSectionId);
      setNotice({
        kind: 'success',
        message: `${editingId ? 'Updated' : 'Created'} ${response.question.questionCode || response.question.id} in ${destinationLabel} (${response.table}).`,
        issues: [],
      });
      setFormOpen(false);
      setEditingId(null);
      await refreshAfterMutation();
    } catch (error) {
      const failure = readableError(error);
      setFormIssues([failure.message, ...failure.issues]);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (question: AdminQuestionSummary) => {
    if (!source) return;
    const identifier = question.questionCode || question.id;
    const subjectText = sourceSubjectLock
      ? `\nSubject lock: ${source.subjectField} = ${sourceSubjectLock}.`
      : '';
    const confirmed = window.confirm(
      `Delete ${identifier} from ${destinationLabel} (${source.table})?${subjectText}\n\nThis permanently deletes only this question from the selected project. It cannot be undone.`,
    );
    if (!confirmed) return;

    setDeletingId(question.id);
    setNotice(null);
    try {
      const response = await deleteAdminQuestion(
        source.id,
        source.table,
        question.id,
        activeSectionId,
      );
      setNotice({
        kind: 'success',
        message: `Deleted ${response.question.questionCode || response.question.id} from ${destinationLabel} (${response.table}).`,
        issues: [],
      });
      if (editingId === question.id) closeForm();
      await refreshAfterMutation();
    } catch (error) {
      setNotice(readableError(error));
    } finally {
      setDeletingId(null);
    }
  };

  const applyFilters = (event: FormEvent) => {
    event.preventDefault();
    setAppliedFilters({ ...filters });
    setPage(1);
  };

  const clearFilters = () => {
    setFilters(emptyFilters());
    setAppliedFilters(emptyFilters());
    setPage(1);
  };

  const resetImport = () => {
    setImportPreview(null);
    setImportError('');
    setImportResult(null);
  };

  const processImportFile = async (file: File) => {
    if (!source) return;
    resetImport();
    setNotice(null);

    if (file.size > MAX_IMPORT_BYTES) {
      setImportError(
        `The file is larger than the ${Math.round(MAX_IMPORT_BYTES / (1024 * 1024))} MiB admin-import limit. Split it into smaller files. No records were imported.`,
      );
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch (error) {
      setImportError(
        `The file is not valid JSON: ${error instanceof Error ? error.message : 'parse failed'}. No records were imported.`,
      );
      return;
    }

    const extracted = extractQuestionBankImport(parsed, {
      sectionId: activeSectionId,
      sourceId: source.id,
      table: source.table,
    });
    if (!extracted.ok) {
      setImportError(extracted.error);
      return;
    }

    const candidates = extracted.value.questions;
    const validQuestions: unknown[] = [];
    const validPayloads: Array<Record<string, unknown>> = [];
    const invalid: string[] = [];
    candidates.forEach((candidate, index) => {
      const normalized = normalizeQuestionInput(candidate, source, { lockedSubject });
      if (normalized.ok) {
        validQuestions.push(candidate);
        validPayloads.push(normalized.payload);
      } else invalid.push(...normalized.errors.map((issue) => `Question ${index + 1}: ${issue}`));
    });

    const tooMany = candidates.length > QUESTION_BANK_IMPORT_MAX;
    const warnings = [...extracted.value.warnings];
    if (tooMany) {
      warnings.push(
        `The file contains ${candidates.length.toLocaleString()} records; the confirmed admin limit is ${QUESTION_BANK_IMPORT_MAX.toLocaleString()} per file. No rows can be inserted from this preview.`,
      );
    }

    const firstValidPayload = validPayloads[0];
    const firstValidImages = firstValidPayload
      ? parseRemoteQuestionImagePreview(
          typeof firstValidPayload.images === 'string'
            ? firstValidPayload.images
            : firstValidPayload.images
              ? JSON.stringify(firstValidPayload.images)
              : '',
        ).images
      : [];

    setImportPreview({
      fileName: file.name,
      format: extracted.value.format,
      validQuestions,
      invalid,
      warnings,
      tooMany,
      sample: validQuestions.length ? importSample(validQuestions[0]) : 'No valid record to preview.',
      images: firstValidImages,
    });
  };

  const confirmImport = async () => {
    if (!source || !importPreview) return;
    if (
      importPreview.tooMany
      || importPreview.invalid.length > 0
      || !importPreview.validQuestions.length
    ) {
      return;
    }
    const subjectText = sourceSubjectLock
      ? `\nSection subject: ${source.subjectField} = ${sourceSubjectLock}.`
      : '';
    const confirmed = window.confirm(
      `Insert ${importPreview.validQuestions.length} valid question${importPreview.validQuestions.length === 1 ? '' : 's'} into ${destinationLabel} (${source.table})?${subjectText}\n\nInvalid records are skipped, existing rows are never overwritten, and the original file is not changed.`,
    );
    if (!confirmed) return;

    setIsImporting(true);
    setImportError('');
    setImportResult(null);
    setNotice(null);
    try {
      const result = await importAdminQuestions(
        source.id,
        source.table,
        importPreview.validQuestions,
        activeSectionId,
      );
      setImportResult(result);
      setImportPreview(null);
      if (result.failures.length) {
        setNotice({
          kind: 'error',
          message: `Inserted ${result.inserted.length} question${result.inserted.length === 1 ? '' : 's'} into ${destinationLabel}; ${result.failures.length} failed. Existing rows were not overwritten.`,
          issues: result.failures.slice(0, 20).map((failure) => `Record ${failure.index + 1}: ${failure.message}`),
        });
      } else {
        setNotice({
          kind: 'success',
          message: `Imported ${result.inserted.length} question${result.inserted.length === 1 ? '' : 's'} into ${destinationLabel} (${result.table}).`,
          issues: [],
        });
      }
      await refreshAfterMutation();
    } catch (error) {
      const failure = readableError(error);
      setImportError([failure.message, ...failure.issues].join(' '));
    } finally {
      setIsImporting(false);
    }
  };

  const downloadTemplate = () => {
    if (!source) return;
    const template = buildQuestionBankTemplate(source, {
      section: activeSection,
      subjectLock: lockedSubject,
    });
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = questionBankTemplateFileName(source, activeSection);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setNotice({
      kind: 'success',
      message: `Downloaded the ${destinationLabel} JSON template. It passes the selected destination's importer validation.`,
      issues: [],
    });
  };

  const totalPages = list ? Math.max(1, Math.ceil(list.count / list.pageSize)) : 1;
  const firstVisible = list && list.count > 0 ? (list.page - 1) * list.pageSize + 1 : 0;
  const lastVisible = list ? Math.min(list.page * list.pageSize, list.count) : 0;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-blue-700" />
              <h2 className="text-sm font-extrabold text-slate-900">Question Bank Manager</h2>
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
              Five primary sections route to their registered project banks. Counts and writes come
              from the trusted server API after your existing OINKIE Study admin session is verified.
              A failed count is never shown as zero, and the five section buttons remain available even
              when the status API is unavailable.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshStatuses()}
            disabled={isRefreshing}
            className={secondaryButtonClass}
          >
            {isRefreshing
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh all banks
          </button>
        </div>

        {statusError && (
          <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800">
            <p className="flex items-center gap-2 font-bold"><AlertCircle className="h-4 w-4" /> Admin API status request failed</p>
            <p className="mt-1">{statusError}</p>
            <p className="mt-1 text-[11px]">
              The section buttons below still work. Check the signed-in admin session, start the trusted
              API with <span className="font-mono">npm run dev</span>, and verify the server-only
              environment variables described in the deployment guide.
            </p>
          </div>
        )}
      </section>

      {notice && (
        <div
          role={notice.kind === 'error' ? 'alert' : 'status'}
          className={`flex items-start gap-2 rounded-2xl border px-4 py-3 text-xs leading-5 ${
            notice.kind === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          {notice.kind === 'success'
            ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <div className="min-w-0 flex-1">
            <p className="font-bold">{notice.message}</p>
            {notice.issues.length > 0 && (
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {notice.issues.map((issue, index) => <li key={`${issue}-${index}`}>{issue}</li>)}
              </ul>
            )}
          </div>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message" className="text-current opacity-70 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {view.kind === 'overview' && (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">Choose a primary section</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Physics, Chemistry, Botany, Zoology, and PYQs are the five primary buttons. Botany and
                  Zoology share the Biology table but are always separated by the subject_area lock.
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">
                5 primary sections
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {QUESTION_BANK_ADMIN_SECTIONS.map((section) => {
                const sectionSource = sourceForSection(section);
                const status = sectionSource && statuses
                  ? statuses.find((entry) => entry.source === sectionSource.id)
                  : undefined;
                const meta = status ? STATUS_META[status.state] : null;
                const Icon = SECTION_ICON[section.id];
                const sharedBiology = section.id === 'botany' || section.id === 'zoology';
                const setupRequired = !sectionSource;
                return (
                  <button
                    key={section.id}
                    type="button"
                    data-primary-section={section.id}
                    aria-label={`Open ${section.label} question manager`}
                    onClick={() => openSection(section.id)}
                    className="group flex min-h-56 min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-200"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${SECTION_ICON_CLASS[section.id]}`}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold ${
                        setupRequired
                          ? 'bg-amber-50 text-amber-800'
                          : meta?.className ?? 'bg-slate-100 text-slate-500'
                      }`}>
                        {setupRequired ? 'Setup required' : meta?.label ?? (isRefreshing ? 'Checking...' : 'Not checked')}
                      </span>
                    </div>
                    <h4 className="mt-3 text-base font-black tracking-tight text-slate-900">{section.label}</h4>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-slate-500">{section.description}</p>
                    <div className="mt-auto pt-3">
                      {sectionSource ? (
                        <>
                          <p className="truncate font-mono text-[10px] text-slate-500">{sectionSource.table}</p>
                          <p className="mt-1 text-lg font-black text-slate-900">
                            {status?.count === null || !status ? '—' : status.count.toLocaleString()}
                          </p>
                          <p className="text-[10px] font-semibold text-slate-500">
                            {status?.count === null || !status
                              ? 'count not verified'
                              : sharedBiology
                                ? 'Biology table rows (shared)'
                                : `verified row${status.count === 1 ? '' : 's'}`}
                          </p>
                        </>
                      ) : (
                        <p className="rounded-lg bg-amber-50 px-2 py-1.5 text-[10px] font-bold leading-4 text-amber-900">
                          No remote PYQ source or writable schema is configured.
                        </p>
                      )}
                      <p className="mt-2 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                        {sectionSource ? 'Open section' : 'View setup requirement'} →
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">Other registered banks</h3>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
                  General and Archive remain available through this secondary section view. They are not
                  one of the five primary subject buttons and do not replace any of them.
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">
                Secondary access
              </span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {QUESTION_BANK_OTHER_SOURCE_IDS.map((sourceId) => {
                const otherSource = requireQuestionBankSource(sourceId);
                const status = statuses?.find((entry) => entry.source === sourceId);
                const meta = status ? STATUS_META[status.state] : null;
                return (
                  <button
                    key={sourceId}
                    type="button"
                    data-secondary-source={sourceId}
                    aria-label={`Open ${otherSource.label}`}
                    onClick={() => openSource(sourceId)}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-3 text-left transition hover:border-slate-300 hover:bg-white"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-slate-600 shadow-sm">
                        <Database className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-extrabold text-slate-800">{otherSource.label}</p>
                        <p className="truncate font-mono text-[9px] text-slate-500">{otherSource.table}</p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${meta?.className ?? 'bg-slate-100 text-slate-500'}`}>
                        {meta?.label ?? (isRefreshing ? 'Checking...' : 'Not checked')}
                      </span>
                      <p className="mt-1 text-[10px] font-bold text-slate-500">
                        {status?.count === null || !status ? '—' : `${status.count.toLocaleString()} rows`}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </>
      )}

      {view.kind !== 'overview' && activeSection && !source && (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <button type="button" onClick={goBackToSections} className={secondaryButtonClass}>
              <ArrowLeft className="h-3.5 w-3.5" /> Back to all sections
            </button>
            <div className="mt-4 flex items-start gap-3">
              <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${SECTION_ICON_CLASS[activeSection.id]}`}>
                {(() => {
                  const Icon = SECTION_ICON[activeSection.id];
                  return <Icon className="h-5 w-5" />;
                })()}
              </span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700">Primary section · setup required</p>
                <h3 className="mt-1 text-base font-black text-slate-900">{activeSection.label}</h3>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">{activeSection.description}</p>
                <p className="mt-2 text-[11px] font-bold text-slate-600">
                  Active data source: <span className="text-amber-800">none configured</span>
                </p>
              </div>
            </div>
          </section>

          <section role="note" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950 shadow-sm sm:p-5">
            <h3 className="flex items-center gap-2 text-sm font-extrabold">
              <AlertCircle className="h-4 w-4" /> PYQ storage is not configured
            </h3>
            <p className="mt-2 text-xs leading-6">{activeSection.setupRequired}</p>
            <p className="mt-3 text-xs leading-6">
              No Add question, edit, delete, import, template-download, or status request is exposed for
              this section. The existing local NEET PYQ Tests page is unchanged. A remote PYQ bank must
              not silently route to General, Archive, Chemistry, or another subject table.
            </p>
            <p className="mt-3 text-[11px] font-semibold leading-5">
              Required before activation: an approved source project, a reviewed source-specific table or
              migration, exam/year/paper/question-number fields, matching public reader and renderer
              support, and server-side admin verification.
            </p>
          </section>
        </>
      )}

      {view.kind !== 'overview' && source && (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <button type="button" onClick={goBackToSections} className={secondaryButtonClass}>
              <ArrowLeft className="h-3.5 w-3.5" /> Back to all sections
            </button>
            <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-700">
                  {activeSection ? 'Primary section' : 'Secondary registered bank'}
                </p>
                <h3 className="mt-1 text-base font-black text-slate-900">{destinationLabel}</h3>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
                  {activeSection?.description ?? `${source.label} remains available outside the five primary sections.`}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-semibold">
                  <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-800">{source.label}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-1 font-mono text-slate-600">{source.table}</span>
                  {sourceSubjectLock && (
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-800">
                      {source.subjectField} = {sourceSubjectLock}
                    </span>
                  )}
                  {!source.subjectField && (
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">no subject column</span>
                  )}
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  {sourceCountLabel(selectedStatus)}
                  {selectedStatus
                    ? ` · checked ${formatTimestamp(selectedStatus.lastCheckedAt)}`
                    : ' · status not available'}
                  {activeSection && source.id === 'biology'
                    ? ` · ${source.table} total; list filtered to ${lockedSubject ?? 'the section subject'}`
                    : activeSection && source.subjectField
                      ? ` · list filtered to ${lockedSubject ?? 'the section subject'}`
                      : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {formOpen && (
                  <button type="button" onClick={closeForm} className={secondaryButtonClass}>
                    <X className="h-3.5 w-3.5" /> Close editor
                  </button>
                )}
                <button type="button" onClick={startAdding} className={primaryButtonClass}>
                  <Plus className="h-4 w-4" /> Add question
                </button>
              </div>
            </div>

            {selectedStatus && selectedStatus.state !== 'connected' && selectedStatus.state !== 'empty' && (
              <div role="alert" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900">
                <p className="font-bold">{STATUS_META[selectedStatus.state].label}</p>
                <p className="mt-1">{selectedStatus.detail}</p>
                {selectedStatus.state === 'missing-table' && (
                  <p className="mt-1 font-semibold">
                    Review the source-specific SQL in <span className="font-mono">supabase/remote</span>.
                    Do not claim this bank works until the table is verified.
                  </p>
                )}
              </div>
            )}

            <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900">
              Every save, import, and delete is checked against this exact project, table, and section
              subject. The API rejects a mismatched table or subject and never falls back to another bank.
              {activeSection && source.subjectField
                ? ` Botany and Zoology are separated by ${source.subjectField}.`
                : ''}
            </div>
          </section>

          <QuestionBankImportPanel
            source={source}
            section={activeSection}
            lockedSubject={lockedSubject}
            preview={importPreview ? {
              fileName: importPreview.fileName,
              format: importPreview.format,
              validCount: importPreview.validQuestions.length,
              invalid: importPreview.invalid,
              warnings: importPreview.warnings,
              tooMany: importPreview.tooMany,
              sample: importPreview.sample,
              images: importPreview.images,
            } : null}
            importError={importError}
            result={importResult}
            isImporting={isImporting}
            onFile={(file) => void processImportFile(file)}
            onCancelPreview={resetImport}
            onConfirmImport={() => void confirmImport()}
            onDownloadTemplate={downloadTemplate}
          />

          {formOpen && (
            <div id="question-bank-editor">
              <QuestionBankQuestionForm
                source={source}
                section={activeSection}
                lockedSubject={lockedSubject}
                draft={draft}
                editingId={editingId}
                isSaving={isSaving}
                issues={formIssues}
                onChange={setDraft}
                onSubmit={() => void handleSave()}
                onCancel={closeForm}
              />
            </div>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">Questions in {destinationLabel}</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Server-side filtering and pagination. Rows are ordered deterministically by question ID.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isListLoading && <Loader2 className="h-4 w-4 animate-spin text-blue-700" />}
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">
                  {list ? `${list.count.toLocaleString()} matching` : 'not loaded'}
                </span>
              </div>
            </div>

            <form onSubmit={applyFilters} className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                <label className={`${labelClass} xl:col-span-2`}>
                  Search question text or code
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                    <input
                      value={filters.search}
                      onChange={(event) => setFilters({ ...filters, search: event.target.value })}
                      maxLength={120}
                      className={`${inputClass} pl-9`}
                      placeholder="Search English, Hindi, or question code"
                    />
                  </div>
                </label>

                <label className={labelClass}>
                  {source.subjectField === 'subject_area' ? 'Subject area' : 'Subject'}
                  {fixedFilterSubject ? (
                    <input
                      value={fixedFilterSubject}
                      readOnly
                      disabled
                      className={`${inputClass} bg-white text-slate-500`}
                    />
                  ) : (
                    <select
                      value={filters.subject}
                      onChange={(event) => setFilters({ ...filters, subject: event.target.value })}
                      className={inputClass}
                    >
                      <option value="">All subjects</option>
                      {source.subjects.map((subject) => (
                        <option key={subject} value={subject}>{subject}</option>
                      ))}
                    </select>
                  )}
                </label>

                <label className={labelClass}>
                  Answer status
                  <select
                    value={filters.answer}
                    onChange={(event) => setFilters({ ...filters, answer: event.target.value as QuestionBankAnswerFilter })}
                    className={inputClass}
                  >
                    <option value="all">All answers</option>
                    <option value="present">Has answer key</option>
                    <option value="missing">Missing answer key</option>
                  </select>
                </label>

                <label className={labelClass}>
                  Language availability
                  <select
                    value={filters.language}
                    onChange={(event) => setFilters({ ...filters, language: event.target.value as QuestionBankLanguageFilter })}
                    className={inputClass}
                  >
                    <option value="all">All languages</option>
                    <option value="with-hindi">Has Hindi text</option>
                    <option value="without-hindi">No Hindi text</option>
                  </select>
                </label>
              </div>

              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-bold text-blue-700">Advanced filters</summary>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                  {([
                    ['chapter', 'Chapter'],
                    ['topic', 'Topic'],
                    ['section', 'Question section'],
                    ['exercise', 'Exercise'],
                    ['difficulty', 'Difficulty'],
                    ['sourcePdf', 'Source PDF'],
                  ] as const).map(([field, label]) => (
                    <label key={field} className={labelClass}>
                      {label}
                      <input
                        value={filters[field]}
                        onChange={(event) => setFilters({ ...filters, [field]: event.target.value })}
                        maxLength={field === 'sourcePdf' ? 400 : 200}
                        className={inputClass}
                        placeholder={`Exact ${label.toLowerCase()}`}
                      />
                    </label>
                  ))}
                </div>
              </details>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button type="submit" className={primaryButtonClass}>
                  <Filter className="h-3.5 w-3.5" /> Apply filters
                </button>
                <button type="button" onClick={clearFilters} className={secondaryButtonClass}>
                  Clear
                </button>
                <span className="text-[10px] text-slate-400">
                  Text filters are exact matches. Search uses a partial, case-insensitive match.
                </span>
              </div>
            </form>

            {listError && (
              <div role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800">
                <p className="flex items-center gap-2 font-bold"><AlertCircle className="h-4 w-4" /> Question list unavailable</p>
                <p className="mt-1">{listError}</p>
              </div>
            )}

            {!listError && list && list.questions.length === 0 && (
              <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-xs leading-5 text-slate-500">
                {list.count === 0
                  ? `No questions are stored in ${source.table}${sourceSubjectLock ? ` for ${sourceSubjectLock}` : ''} yet. Add one above or import a template; an empty bank is shown separately from an unavailable one.`
                  : 'No question matches the current filters.'}
              </div>
            )}

            {list && list.questions.length > 0 && (
              <>
                <div className="mt-3 hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left">
                    <thead>
                      <tr className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        <th className="rounded-l-lg px-3 py-2">Question</th>
                        <th className="px-3 py-2">Subject / chapter</th>
                        <th className="px-3 py-2">Answer</th>
                        <th className="px-3 py-2">Bank</th>
                        <th className="rounded-r-lg px-3 py-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.questions.map((question) => (
                        <tr key={question.id} className="border-b border-slate-100 align-top last:border-0">
                          <td className="px-3 py-3">
                            <p className="text-xs font-extrabold text-slate-800">{question.questionCode || 'No question code'}</p>
                            <p className="mt-1 max-w-md text-xs leading-5 text-slate-500">{question.preview || 'No question text'}</p>
                            <p className="mt-1 truncate font-mono text-[9px] text-slate-400" title={question.id}>{question.id}</p>
                          </td>
                          <td className="px-3 py-3">
                            <p className="text-xs font-bold text-slate-700">{question.subject || 'Unspecified'}</p>
                            <p className="mt-1 text-[11px] text-slate-500">{question.chapter}</p>
                            {question.topic && <p className="mt-0.5 text-[10px] text-slate-400">{question.topic}</p>}
                          </td>
                          <td className="px-3 py-3"><AnswerBadge answer={question.answerKey} /></td>
                          <td className="px-3 py-3">
                            <p className="text-[11px] font-bold text-slate-700">{destinationLabel}</p>
                            <p className="font-mono text-[9px] text-slate-400">{source.table}</p>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex justify-end gap-2">
                              <button type="button" onClick={() => startEditing(question)} disabled={isSaving || Boolean(deletingId)} className={secondaryButtonClass}>
                                <Pencil className="h-3.5 w-3.5" /> Edit
                              </button>
                              <button type="button" onClick={() => void handleDelete(question)} disabled={isSaving || Boolean(deletingId)} className={dangerButtonClass}>
                                {deletingId === question.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-3 space-y-2 md:hidden">
                  {list.questions.map((question) => (
                    <article key={question.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-extrabold text-slate-800">{question.questionCode || 'No question code'}</p>
                          <p className="mt-1 text-[11px] font-semibold text-slate-500">
                            {question.subject || 'Unspecified'} · {question.chapter}
                          </p>
                        </div>
                        <AnswerBadge answer={question.answerKey} />
                      </div>
                      <p className="mt-2 text-xs leading-5 text-slate-600">{question.preview || 'No question text'}</p>
                      <p className="mt-2 truncate font-mono text-[9px] text-slate-400" title={question.id}>{question.id}</p>
                      <p className="mt-1 text-[10px] font-semibold text-blue-700">{destinationLabel} · {source.table}</p>
                      <div className="mt-3 flex gap-2">
                        <button type="button" onClick={() => startEditing(question)} disabled={isSaving || Boolean(deletingId)} className={secondaryButtonClass}>
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </button>
                        <button type="button" onClick={() => void handleDelete(question)} disabled={isSaving || Boolean(deletingId)} className={dangerButtonClass}>
                          {deletingId === question.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          Delete
                        </button>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                  <p className="text-[11px] text-slate-500">
                    Showing {firstVisible.toLocaleString()}–{lastVisible.toLocaleString()} of {list.count.toLocaleString()}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="text-[11px] font-semibold text-slate-500">
                      Page size
                      <select
                        value={pageSize}
                        onChange={(event) => {
                          setPageSize(Number(event.target.value));
                          setPage(1);
                        }}
                        className="ml-2 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px]"
                      >
                        <option value="10">10</option>
                        <option value="25">25</option>
                        <option value="50">50</option>
                        <option value="100">100</option>
                      </select>
                    </label>
                    <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1 || isListLoading} className={secondaryButtonClass}>
                      <ChevronLeft className="h-3.5 w-3.5" /> Previous
                    </button>
                    <span className="text-[11px] font-bold text-slate-500">Page {list.page} of {totalPages}</span>
                    <button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page >= totalPages || isListLoading} className={secondaryButtonClass}>
                      Next <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
