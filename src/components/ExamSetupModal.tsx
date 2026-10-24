import React, { useState, useRef, useEffect } from 'react';
import {
  FileText,
  Upload,
  Sparkles,
  Clock,
  HelpCircle,
  Play,
  Key,
  Shield,
  BookOpen,
  FileJson,
} from 'lucide-react';
import { AnswerKeyStatus, ExamQuestion, ExamSection, OptionLetter, TestConfig } from '../types/exam';
import { parseAnswerKeyInput } from '../utils/answerKeyParser';
import { validatePdfFile } from '../utils/pdf';
import {
  createImportedAnswerKey,
  filterPracticeQuestions,
  generatePracticeQuestions,
  ValidatedQuestionBank,
  validateQuestionBankImageDecoding,
} from '../utils/questionBank';
import { loadStoredQuestionBanks, readStoredQuestionBanks, saveQuestionBankFile, StoredQuestionBanksResult } from '../utils/questionBankStorage';
import { validateQuestionBankFile } from '../utils/questionBankImport';
import { MathText } from './MathText';
import { QuestionImages } from './QuestionImages';

interface ExamStartOptions {
  questions?: ExamQuestion[];
  answerKeyStatus: AnswerKeyStatus;
}

interface ExamSetupModalProps {
  initialContentMode?: 'paper' | 'bank';
  initialPdfSourceType?: 'sample' | 'custom';
  initialPreset?: '45' | '90' | '180' | '200' | 'custom';
  onBackToDashboard: () => void;
  onStartExam: (
    config: TestConfig,
    pdfBlob: Blob | File | null,
    initialAnswerKey: Record<number, OptionLetter> | null,
    options: ExamStartOptions
  ) => Promise<void>;
  hasSavedSession: boolean;
  onResumeSavedSession: () => Promise<void>;
  onDiscardSavedSession: () => void;
  recoveryError?: string | null;
}

export const ExamSetupModal: React.FC<ExamSetupModalProps> = ({
  initialContentMode = 'paper',
  initialPdfSourceType = 'sample',
  initialPreset = '180',
  onBackToDashboard,
  onStartExam,
  hasSavedSession,
  onResumeSavedSession,
  onDiscardSavedSession,
  recoveryError = null,
}) => {
  const [preset, setPreset] = useState<'45' | '90' | '180' | '200' | 'custom'>(initialPreset);
  const [customQuestions, setCustomQuestions] = useState<number>(initialPreset === 'custom' ? 20 : 180);
  const [durationMinutes, setDurationMinutes] = useState<number>(initialPreset === 'custom' ? 30 : 200);
  const [candidateName, setCandidateName] = useState<string>('Candidate Aspirant');
  const [rollNumber, setRollNumber] = useState<string>('PRACTICE-0001');
  const [paperTitle, setPaperTitle] = useState<string>('NEET Demo Practice Paper (Incomplete)');

  // PDF source mode
  const [pdfSourceType, setPdfSourceType] = useState<'sample' | 'custom'>(initialPdfSourceType);
  const [contentMode, setContentMode] = useState<'paper' | 'bank'>(initialContentMode);
  const [uploadedPdfFile, setUploadedPdfFile] = useState<File | null>(null);
  const [questionBank, setQuestionBank] = useState<ValidatedQuestionBank | null>(null);
  const [storedQuestionBanks, setStoredQuestionBanks] = useState<StoredQuestionBanksResult>(() => readStoredQuestionBanks());
  const [questionBankStorageError, setQuestionBankStorageError] = useState<string | null>(null);
  const [questionBankErrors, setQuestionBankErrors] = useState<string[]>([]);
  const [questionBankImportProgress, setQuestionBankImportProgress] = useState<string | null>(null);
  const [questionBankFileName, setQuestionBankFileName] = useState<string | null>(null);
  const [bankSubject, setBankSubject] = useState('All');
  const [bankTopic, setBankTopic] = useState('All');
  const [bankQuestionCount, setBankQuestionCount] = useState(10);
  const [bankQuestionSearch, setBankQuestionSearch] = useState('');
  const [randomizeBankQuestions, setRandomizeBankQuestions] = useState(initialPreset === 'custom');
  const [confirmImportedKey, setConfirmImportedKey] = useState(false);

  useEffect(() => {
    let active = true;
    void loadStoredQuestionBanks().then((result) => {
      if (active) setStoredQuestionBanks(result);
    });
    return () => { active = false; };
  }, []);

  // Optional Answer Key input
  const [rawAnswerKeyText, setRawAnswerKeyText] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'setup' | 'instructions'>('setup');
  const [isStarting, setIsStarting] = useState<boolean>(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [isPdfValidating, setIsPdfValidating] = useState<boolean>(false);
  const [isUploadedPdfValid, setIsUploadedPdfValid] = useState<boolean>(false);
  const [pdfValidationError, setPdfValidationError] = useState<string | null>(null);
  const [isResuming, setIsResuming] = useState<boolean>(false);
  const [resumeError, setResumeError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfValidationRequestRef = useRef<number>(0);
  const bankFileInputRef = useRef<HTMLInputElement>(null);

  // Handle Preset Changes
  const handlePresetSelect = (selected: '45' | '90' | '180' | '200' | 'custom') => {
    setPreset(selected);
    if (selected === '45') {
      setCustomQuestions(45);
      setDurationMinutes(45);
      setPaperTitle('NEET Physics / Chemistry 45-Q Rapid Drill');
    } else if (selected === '90') {
      setCustomQuestions(90);
      setDurationMinutes(90);
      setPaperTitle('NEET Biology (Botany + Zoology) 90-Q Mock Test');
    } else if (selected === '180') {
      setCustomQuestions(180);
      setDurationMinutes(180);
      setPaperTitle('NEET (UG) 180-Question Practice Session');
    } else if (selected === '200') {
      setCustomQuestions(200);
      setDurationMinutes(200);
      setPaperTitle('NEET (UG) 200-Question Practice Session');
    }
  };

  const generateSections = (totalQ: number): ExamSection[] => {
    if (totalQ === 180) {
      return [
        { id: 'phy', name: 'Physics', startQ: 1, endQ: 45, total: 45 },
        { id: 'chem', name: 'Chemistry', startQ: 46, endQ: 90, total: 45 },
        { id: 'bot', name: 'Botany', startQ: 91, endQ: 135, total: 45 },
        { id: 'zoo', name: 'Zoology', startQ: 136, endQ: 180, total: 45 },
      ];
    }
    if (totalQ === 90) {
      return [
        { id: 'bot', name: 'Botany', startQ: 1, endQ: 45, total: 45 },
        { id: 'zoo', name: 'Zoology', startQ: 46, endQ: 90, total: 45 },
      ];
    }
    if (totalQ === 45) {
      return [{ id: 'sec1', name: 'Section 1', startQ: 1, endQ: 45, total: 45 }];
    }
    // Generic single section
    return [{ id: 'sec_all', name: 'All Questions', startQ: 1, endQ: totalQ, total: totalQ }];
  };

  const handleStart = async () => {
    setStartError(null);
    if (contentMode === 'bank') {
      if (!questionBank) {
        setStartError(questionBankErrors[0] || 'Import a valid JSON question bank before starting.');
        return;
      }
      setIsStarting(true);
      try {
        const selectedQuestions = generatePracticeQuestions(
          questionBank,
          bankSubject,
          bankTopic,
          bankQuestionCount,
          randomizeBankQuestions,
          bankQuestionSearch
        );
        const importedKey = createImportedAnswerKey(selectedQuestions, confirmImportedKey);
        const sections = buildBankSections(selectedQuestions);
        const config: TestConfig = {
          id: `bank-exam-${Date.now()}`,
          title: `${questionBank.sourcePdf.subject} Practice Test`,
          totalQuestions: selectedQuestions.length,
          durationMinutes: Math.max(1, durationMinutes),
          candidateName: candidateName.trim() || 'Practice Candidate',
          rollNumber: rollNumber.trim() || 'PRACTICE',
          sections,
          pdfFileName: null,
          hasCustomPdf: false,
          preset: 'custom',
          sourceType: 'question-bank',
        };
        await onStartExam(config, null, importedKey.key, {
          questions: selectedQuestions,
          answerKeyStatus: importedKey.status,
        });
      } catch (error) {
        setStartError(error instanceof Error ? error.message : String(error));
      } finally {
        setIsStarting(false);
      }
      return;
    }
    if (pdfSourceType === 'custom' && !uploadedPdfFile) {
      setStartError('Choose a PDF file before starting a custom exam.');
      return;
    }
    if (pdfSourceType === 'custom' && !isUploadedPdfValid) {
      setStartError(pdfValidationError || 'Wait for the selected PDF to finish validation.');
      return;
    }

    setIsStarting(true);
    try {
      const qCount = preset === 'custom' ? Math.max(1, customQuestions) : customQuestions;
      const durMins = Math.max(1, durationMinutes);
      const sections = generateSections(qCount);

      const config: TestConfig = {
        id: `exam-${Date.now()}`,
        title: paperTitle || 'NEET CBT Exam',
        totalQuestions: qCount,
        durationMinutes: durMins,
        candidateName: candidateName || 'NEET Candidate',
        rollNumber: rollNumber || 'PRACTICE-0001',
        sections,
        pdfFileName:
          pdfSourceType === 'sample'
            ? 'NEET_Incomplete_Demo_Paper.pdf'
            : uploadedPdfFile?.name || 'Custom_Question_Paper.pdf',
        hasCustomPdf: pdfSourceType === 'custom',
        preset,
        sourceType: pdfSourceType === 'custom' ? 'pdf' : 'demo',
      };

      let answerKey: Record<number, OptionLetter> | null = null;
      if (pdfSourceType === 'custom' && rawAnswerKeyText.trim()) {
        const parsed = parseAnswerKeyInput(rawAnswerKeyText, qCount);
        if (parsed.errors.length) {
          throw new Error(parsed.errors.join(' '));
        }
        if (parsed.totalFound > 0) {
          answerKey = parsed.keyMap;
        }
      }

      await onStartExam(config, pdfSourceType === 'custom' ? uploadedPdfFile : null, answerKey, {
        answerKeyStatus: answerKey ? 'user-provided' : 'none',
      });
    } catch (error) {
      setStartError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsStarting(false);
    }
  };

  const handleQuestionBankSelection = async (file: File | undefined) => {
    if (!file) return;
    setQuestionBankFileName(file.name);
    setQuestionBankErrors([]);
    setQuestionBankStorageError(null);
    try {
      const result = await validateQuestionBankFile(file, setQuestionBankImportProgress);
      if (!result.bank) {
        setQuestionBank(null);
        setQuestionBankErrors(result.errors);
        return;
      }
      setQuestionBankImportProgress('Checking embedded image decoding');
      await validateQuestionBankImageDecoding(result.bank);
      setQuestionBank(result.bank);
      setBankSubject(result.bank.summary.subjects[0] || 'All');
      setBankTopic('All');
      setBankQuestionCount(Math.min(10, result.bank.questions.length));
      setBankQuestionSearch('');
      setConfirmImportedKey(false);
      try {
        setQuestionBankImportProgress('Saving the complete JSON bank to browser storage');
        const savedBank = await saveQuestionBankFile(file, result.bank);
        setStoredQuestionBanks((previous) => ({
          banks: [savedBank, ...previous.banks.filter((entry) => entry.id !== savedBank.id)],
          error: null,
        }));
      } catch (error) {
        setQuestionBankStorageError(error instanceof Error ? error.message : String(error));
      }
    } catch (error) {
      setQuestionBank(null);
      setQuestionBankErrors([`Could not read question bank: ${error instanceof Error ? error.message : String(error)}`]);
    } finally {
      setQuestionBankImportProgress(null);
    }
  };

  const handleStoredQuestionBankSelection = (id: string) => {
    const entry = storedQuestionBanks.banks.find((bank) => bank.id === id);
    if (!entry) return;
    setQuestionBank(entry.bank);
    setQuestionBankFileName(entry.fileName);
    setQuestionBankErrors([]);
    setQuestionBankStorageError(null);
    setBankSubject(entry.bank.summary.subjects[0] || 'All');
    setBankTopic('All');
    setBankQuestionCount(Math.min(10, entry.bank.questions.length));
    setBankQuestionSearch('');
    setConfirmImportedKey(false);
  };

  const buildBankSections = (questions: ExamQuestion[]): ExamSection[] => {
    const sections: ExamSection[] = [];
    questions.forEach((question, index) => {
      const last = sections[sections.length - 1];
      if (last && last.name === question.subject) {
        last.endQ = index + 1;
        last.total++;
      } else {
        sections.push({
          id: `${question.subject}-${sections.length}`,
          name: question.subject,
          startQ: index + 1,
          endQ: index + 1,
          total: 1,
        });
      }
    });
    return sections;
  };

  const handlePdfSelection = async (file: File | undefined) => {
    if (!file) return;

    const requestId = ++pdfValidationRequestRef.current;
    setUploadedPdfFile(file);
    setPdfSourceType('custom');
    setPaperTitle(file.name.replace(/\.pdf$/i, ''));
    setIsPdfValidating(true);
    setIsUploadedPdfValid(false);
    setPdfValidationError(null);
    setStartError(null);

    try {
      await validatePdfFile(file);
      if (requestId === pdfValidationRequestRef.current) {
        setIsUploadedPdfValid(true);
      }
    } catch (error) {
      if (requestId === pdfValidationRequestRef.current) {
        setPdfValidationError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (requestId === pdfValidationRequestRef.current) {
        setIsPdfValidating(false);
      }
    }
  };

  const handleResume = async () => {
    setResumeError(null);
    setIsResuming(true);
    try {
      await onResumeSavedSession();
    } catch (error) {
      setResumeError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsResuming(false);
    }
  };

  const availableBankQuestions = questionBank
    ? filterPracticeQuestions(questionBank, bankSubject, bankTopic, bankQuestionSearch)
    : [];
  const hasValidBankSelection = Boolean(questionBank) &&
    Number.isSafeInteger(bankQuestionCount) &&
    bankQuestionCount >= 1 &&
    bankQuestionCount <= availableBankQuestions.length;
  const bankTopics = [...new Set((questionBank?.questions || [])
    .filter((question) => bankSubject === 'All' || question.subject === bankSubject)
    .map((question) => question.topic))];

  return (
    <div className={`exam-setup-dialog ${initialContentMode === 'paper' && initialPdfSourceType === 'custom' ? 'import-paper-setup ' : ''}fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/45 p-3 backdrop-blur-sm sm:p-6`}>
      <div className="my-auto flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        {/* Banner */}
        <div className="border-b border-slate-200 bg-white p-4 text-slate-900 sm:p-5">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-700 text-lg font-bold text-white">
                CBT
              </div>
              <div className="min-w-0">
                <h2 className="break-words text-lg font-bold tracking-tight text-slate-900">
                  NEET (UG) CBT Exam Simulator
                </h2>
                <p className="break-words text-sm text-slate-500">
                  Independent practice simulator &bull; not an official NTA service
                </p>
              </div>
            </div>

            <div className="flex max-w-full flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 text-sm">
              <button
                type="button"
                onClick={onBackToDashboard}
                className="rounded-lg px-3 py-2 font-semibold text-slate-600 transition hover:bg-white hover:text-slate-900"
              >
                Back to Dashboard
              </button>
              <button
                onClick={() => setActiveTab('setup')}
                className={`px-3 py-1 rounded font-semibold transition ${
                  activeTab === 'setup'
                    ? 'bg-blue-700 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-white hover:text-slate-900'
                }`}
              >
                Test Setup
              </button>
              <button
                onClick={() => setActiveTab('instructions')}
                className={`px-3 py-1 rounded font-semibold transition ${
                  activeTab === 'instructions'
                    ? 'bg-blue-700 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-white hover:text-slate-900'
                }`}
              >
                Instructions
              </button>
            </div>
          </div>
        </div>

        {/* Existing Session Alert if active */}
        {hasSavedSession && (
          <div className="mx-5 mt-4 p-3 bg-amber-950/60 border border-amber-600/60 rounded-lg flex items-center justify-between gap-3 text-xs text-amber-200">
            <div>
              <strong className="text-amber-100">Unfinished Exam Detected!</strong>
              <p className="text-[11px] text-amber-300">
                Your saved responses and time are available to resume. A custom PDF must also be present in saved storage.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleResume}
                disabled={isResuming}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded shadow transition"
              >
                {isResuming ? 'Restoring...' : 'Resume Exam'}
              </button>
              <button
                onClick={onDiscardSavedSession}
                className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Discard
              </button>
            </div>
          </div>
        )}
        {recoveryError && (
          <div role="alert" className="mx-5 mt-3 p-3 rounded-lg border border-rose-700 bg-rose-950/50 text-xs text-rose-200">
            <p>{recoveryError}</p>
            <button
              onClick={onDiscardSavedSession}
              className="mt-2 min-h-10 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-800 hover:bg-rose-100"
            >
              Clear unusable saved session
            </button>
          </div>
        )}
        {resumeError && (
          <p role="alert" className="mx-5 mt-2 text-xs text-rose-300">
            {resumeError}
          </p>
        )}

        {/* Tab 1: Setup */}
        {activeTab === 'setup' && (
          <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto text-slate-200 text-xs">
            {/* Question Preset Selector */}
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                Select Exam Format &amp; Questions:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {([
                  { id: '180', label: '180 Questions', sub: 'Practice template (180m)' },
                  { id: '200', label: '200 Questions', sub: 'Practice template (200m)' },
                  { id: '90', label: '90 Questions', sub: 'Biology Only (90m)' },
                  { id: '45', label: '45 Questions', sub: 'Speed Drill (45m)' },
                ] as const).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handlePresetSelect(item.id)}
                    className={`p-2.5 rounded-lg border text-left transition ${
                      preset === item.id
                        ? 'bg-blue-950/80 border-blue-500 shadow-md ring-1 ring-blue-500/50'
                        : 'bg-slate-850 border-slate-700 hover:border-slate-600 text-slate-300'
                    }`}
                  >
                    <div className="font-bold text-slate-100">{item.label}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{item.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Config Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-850/60 p-3.5 rounded-lg border border-slate-700/60">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Total Questions:
                </label>
                <input
                  type="number"
                  min={1}
                  max={300}
                  value={customQuestions}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val)) setCustomQuestions(val);
                  }}
                  className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-100 font-mono text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Test Duration (Minutes):
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={1}
                    max={400}
                    value={durationMinutes}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val)) setDurationMinutes(val);
                    }}
                    className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-100 font-mono text-xs focus:outline-none focus:border-blue-500 pl-8"
                  />
                  <Clock className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Candidate Name:
                </label>
                <input
                  type="text"
                  value={candidateName}
                  onChange={(e) => setCandidateName(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-100 text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Roll / Hall Ticket No:
                </label>
                <input
                  type="text"
                  value={rollNumber}
                  onChange={(e) => setRollNumber(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-100 font-mono text-xs focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Question Paper PDF Selection */}
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                Practice Source:
              </label>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <button
                  type="button"
                  aria-pressed={contentMode === 'paper'}
                  onClick={() => setContentMode('paper')}
                  className={`p-2.5 rounded-lg border text-left ${contentMode === 'paper' ? 'bg-blue-950/70 border-blue-500' : 'bg-slate-850 border-slate-700'}`}
                >
                  <strong>PDF / Demo Paper</strong>
                  <span className="block text-[10px] text-slate-400">Use the existing viewer workflow</span>
                </button>
                <button
                  type="button"
                  aria-pressed={contentMode === 'bank'}
                  onClick={() => setContentMode('bank')}
                  className={`p-2.5 rounded-lg border text-left ${contentMode === 'bank' ? 'bg-blue-950/70 border-blue-500' : 'bg-slate-850 border-slate-700'}`}
                >
                  <strong>Imported Question Bank</strong>
                  <span className="block text-[10px] text-slate-400">Local JSON; no upload or network</span>
                </button>
              </div>
            </div>

            {contentMode === 'paper' && <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                Question Paper Source:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {/* Sample Paper Option */}
                <div
                  onClick={() => {
                    setPdfSourceType('sample');
                    setPaperTitle('NEET Demo Practice Paper (Incomplete)');
                  }}
                  className={`p-3 rounded-lg border cursor-pointer transition flex items-start gap-3 ${
                    pdfSourceType === 'sample'
                      ? 'bg-blue-950/70 border-blue-500 ring-1 ring-blue-500/50'
                      : 'bg-slate-850 border-slate-700 hover:border-slate-600'
                  }`}
                >
                  <Sparkles className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-slate-100">
                      Incomplete Demo Practice Paper
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Partial demonstration content only. It is not a complete NEET paper and has no source-verified answer key.
                    </div>
                  </div>
                </div>

                {/* Upload Local PDF Option */}
                <div
                  onClick={() => {
                    setPdfSourceType('custom');
                    if (uploadedPdfFile) {
                      setPaperTitle(uploadedPdfFile.name.replace(/\.pdf$/i, ''));
                    } else {
                      setPaperTitle('Custom NEET Practice Paper');
                      fileInputRef.current?.click();
                    }
                  }}
                  className={`p-3 rounded-lg border cursor-pointer transition flex items-start gap-3 ${
                    pdfSourceType === 'custom'
                      ? 'bg-blue-950/70 border-blue-500 ring-1 ring-blue-500/50'
                      : 'bg-slate-850 border-slate-700 hover:border-slate-600'
                  }`}
                >
                  <Upload className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-100">Upload Your Own PDF</div>
                    <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                      {uploadedPdfFile
                        ? `Selected: ${uploadedPdfFile.name}`
                        : 'Select any local NEET PDF question paper'}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        void handlePdfSelection(e.target.files?.[0]);
                        e.currentTarget.value = '';
                      }}
                    />
                    {pdfSourceType === 'custom' && isPdfValidating && (
                      <p role="status" className="mt-1 text-[10px] text-blue-300">
                        Checking PDF contents...
                      </p>
                    )}
                    {pdfSourceType === 'custom' && pdfValidationError && (
                      <p role="alert" className="mt-1 text-[10px] text-rose-300">
                        {pdfValidationError}
                      </p>
                    )}
                    {pdfSourceType === 'custom' && !uploadedPdfFile && (
                      <p className="mt-1 text-[10px] text-amber-300">
                        A valid PDF is required before this exam can start.
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                      className="mt-2 text-[10px] font-bold text-blue-400 hover:underline"
                    >
                      Browse PDF File...
                    </button>
                  </div>
                </div>
              </div>
            </div>
            }

            {contentMode === 'bank' && (
              <section className="space-y-3 p-3.5 rounded-lg border border-slate-700 bg-slate-850/50" aria-label="Question bank import">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-slate-100">Import a local question bank</h3>
                    <p className="text-[11px] text-slate-400">Accepts schema 1.0 and schemaVersion 2 JSON without a fixed file-size limit. Files are parsed in a background worker and saved to IndexedDB when browser storage allows.</p>
                  </div>
                  <FileJson className="w-5 h-5 text-sky-400" aria-hidden="true" />
                </div>
                {storedQuestionBanks.banks.length > 0 && (
                  <label className="block text-[11px] text-slate-300">
                    Saved on this device ({storedQuestionBanks.banks.length})
                    <select
                      defaultValue=""
                      onChange={(event) => handleStoredQuestionBankSelection(event.target.value)}
                      className="mt-1 block w-full rounded border border-slate-700 bg-slate-800 p-2 text-slate-100"
                    >
                      <option value="">Choose a saved bank</option>
                      {storedQuestionBanks.banks.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.bank.sourcePdf.subject} · {entry.fileName}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {(storedQuestionBanks.error || questionBankStorageError) && (
                  <p role="alert" className="rounded bg-amber-950/40 p-2 text-[11px] text-amber-200">
                    {questionBankStorageError || storedQuestionBanks.error}
                  </p>
                )}
                <input ref={bankFileInputRef} type="file" accept=".json,application/json" aria-label="Choose question bank JSON" disabled={!!questionBankImportProgress} className="block w-full text-xs text-slate-300 file:mr-3 file:rounded file:border-0 file:bg-slate-700 file:px-3 file:py-2 file:text-slate-100 disabled:opacity-50" onChange={(event) => { void handleQuestionBankSelection(event.target.files?.[0]); event.currentTarget.value = ''; }} />
                {questionBankFileName && <p className="text-[11px] text-slate-300">Selected: {questionBankFileName}</p>}
                {questionBankImportProgress && <p role="status" aria-live="polite" className="rounded bg-blue-950/50 p-2 text-[11px] text-blue-200">{questionBankImportProgress}…</p>}
                {questionBankErrors.length > 0 && <div role="alert" className="max-h-28 overflow-auto rounded bg-rose-950/40 p-2 text-[11px] text-rose-200"><strong>Import rejected:</strong><ul className="list-disc pl-5">{questionBankErrors.map((error, index) => <li key={index}>{error}</li>)}</ul></div>}
                {questionBank && <>
                  <div role="status" className="rounded bg-slate-900 p-2.5 text-[11px] text-slate-200"><strong>Import summary:</strong> {questionBank.summary.totalQuestions} total; {questionBank.summary.validQuestions} valid; {questionBank.summary.rejectedQuestions} rejected.<br />Subjects: {questionBank.summary.subjects.join(', ')}. Topics: {questionBank.summary.topics.join(', ')}.<br />{questionBank.summary.reviewRequired} questions require manual content review. Source-provided keys are not independently verified by this app.</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <label className="text-[11px] text-slate-300">Subject<select value={bankSubject} onChange={(event) => { setBankSubject(event.target.value); setBankTopic('All'); }} className="mt-1 block w-full rounded bg-slate-800 border border-slate-700 p-2 text-slate-100"><option value="All">All subjects</option>{questionBank.summary.subjects.map((subject) => <option key={subject} value={subject}>{subject}</option>)}</select></label>
                    <label className="text-[11px] text-slate-300">Topic<select value={bankTopic} onChange={(event) => setBankTopic(event.target.value)} className="mt-1 block w-full rounded bg-slate-800 border border-slate-700 p-2 text-slate-100"><option value="All">All topics</option>{bankTopics.map((topic) => <option key={topic} value={topic}>{topic}</option>)}</select></label>
                    <label className="text-[11px] text-slate-300">Questions (available: {availableBankQuestions.length})<input type="number" min={1} max={Math.max(1, availableBankQuestions.length)} value={bankQuestionCount} onChange={(event) => setBankQuestionCount(Number(event.target.value))} className="mt-1 block w-full rounded bg-slate-800 border border-slate-700 p-2 text-slate-100" /></label>
                  </div>
                  {!hasValidBankSelection && (
                    <p role="alert" className="text-[11px] text-amber-300">
                      Enter a whole-number question count from 1 to {availableBankQuestions.length} for the current filters.
                    </p>
                  )}
                  <label className="block text-[11px] text-slate-300">
                    Search questions
                    <input
                      type="search"
                      value={bankQuestionSearch}
                      onChange={(event) => setBankQuestionSearch(event.target.value)}
                      placeholder="Search question text, options, or topic"
                      className="mt-1 block w-full rounded border border-slate-700 bg-slate-800 p-2 text-slate-100 placeholder:text-slate-500"
                    />
                  </label>
                  <label className="flex items-start gap-2 rounded border border-slate-700 bg-slate-900/70 p-2.5 text-[11px] text-slate-300">
                    <input
                      type="checkbox"
                      checked={randomizeBankQuestions}
                      onChange={(event) => setRandomizeBankQuestions(event.target.checked)}
                      className="mt-0.5"
                    />
                    <span>Randomly select questions from the matching set. When off, the first matching questions are used.</span>
                  </label>
                  <p className="text-[10px] leading-4 text-slate-400">
                    Difficulty filtering is not available yet. Schema v2 difficulty and scoring metadata are preserved; the simulator marking scheme remains +4 / −1 / 0.
                  </p>
                  <div className="rounded border border-slate-700 bg-slate-900 p-2.5">
                    <p className="mb-2 text-[11px] font-semibold text-slate-200">
                      Matching question preview ({Math.min(3, availableBankQuestions.length)} of {availableBankQuestions.length})
                    </p>
                    {availableBankQuestions.length ? (
                      <ol className="max-h-48 list-decimal space-y-2 overflow-y-auto pl-5 text-[11px] leading-5 text-slate-300">
                        {availableBankQuestions.slice(0, 3).map((question) => (
                          <li key={question.id} className="pr-1">
                            <span className="block"><MathText text={question.questionEn} /></span>
                            <QuestionImages images={question.images} type="question" />
                            {question.missingContent.length > 0 && (
                              <span className="mt-1 block text-amber-300">
                                Import note: {question.missingContent.join('; ')}
                              </span>
                            )}
                            <span className="block text-[10px] text-slate-500">{question.subject} · {question.topic}</span>
                            <div className="mt-1 grid grid-cols-1 gap-x-3 gap-y-0.5 text-[10px] leading-4 text-slate-400 sm:grid-cols-2">
                              {(['A', 'B', 'C', 'D'] as const).map((letter) => (
                                <div key={letter} className="min-w-0">
                                  <span className="flex gap-1">
                                  <strong className="shrink-0">{letter}.</strong>
                                  <MathText text={question.options[letter].textEn} className="min-w-0" />
                                  </span>
                                  <QuestionImages images={question.images} type="option" option={letter} />
                                </div>
                              ))}
                            </div>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="text-[11px] text-slate-400">No questions match the current filters.</p>
                    )}
                  </div>
                  <label className="flex items-start gap-2 rounded border border-amber-700/60 bg-amber-950/30 p-2.5 text-[11px] text-amber-200"><input type="checkbox" checked={confirmImportedKey} onChange={(event) => setConfirmImportedKey(event.target.checked)} className="mt-0.5" /><span>I have checked the selected questions and imported answer keys against the cited original source, and authorize scoring with these keys. Without this explicit confirmation, imported keys will not score the test.</span></label>
                </>}
              </section>
            )}

            {/* Answer Key Option */}
            <div className="bg-slate-850/60 p-3.5 rounded-lg border border-slate-700/60 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Key className="w-4 h-4 text-emerald-400" />
                  <span className="font-bold text-slate-200">Answer Key Scoring</span>
                </div>
              </div>

              {contentMode === 'bank' ? (
                <p className="text-[11px] text-amber-300">Imported keys are source-cited but not trusted by default. Scoring is enabled only after the explicit review confirmation above.</p>
              ) : pdfSourceType === 'sample' ? (
                <p className="text-[11px] text-amber-300">
                  Scoring is disabled for this incomplete demo because no answer key has been verified against a source.
                </p>
              ) : (
                <div>
                  <p className="text-[11px] text-slate-400 mb-1.5">
                    Optional: Paste the key for this custom PDF (e.g. <code>1:A 2:B 3:C</code> or <code>ABCD...</code>), or leave blank to enter it after the test.
                  </p>
                  <textarea
                    rows={2}
                    value={rawAnswerKeyText}
                    onChange={(e) => setRawAnswerKeyText(e.target.value)}
                    placeholder="e.g. 1:B 2:C 3:A 4:D ... or sequential: B CAD B..."
                    className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-100 font-mono text-[11px] focus:outline-none focus:border-blue-500"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Instructions */}
        {activeTab === 'instructions' && (
          <div className="p-5 space-y-3.5 max-h-[75vh] overflow-y-auto text-slate-300 text-xs">
            <div className="flex items-center gap-2 text-blue-400 font-bold text-sm">
              <BookOpen className="w-4 h-4" />
              <span>Practice Marking &amp; Interface Rules</span>
            </div>

            <div className="space-y-2 bg-slate-850/70 p-3 rounded-lg border border-slate-700 text-[11px] leading-relaxed">
              <p>
                <strong>1. Simulator Marking Scheme (not a compliance claim):</strong>
                <br />
                &bull; Correct Answer: <strong>+4 Marks</strong>
                <br />
                &bull; Incorrect Answer: <strong>-1 Mark</strong>
                <br />
                &bull; Unanswered / Unattempted: <strong>0 Marks</strong>
              </p>

              <p>
                <strong>2. Question Palette Symbols:</strong>
                <br />
                &bull; <span className="text-slate-400 font-semibold">Grey:</span> You have not visited the question yet.
                <br />
                &bull; <span className="text-rose-400 font-semibold">Red:</span> You have visited the question but not answered it.
                <br />
                &bull; <span className="text-emerald-400 font-semibold">Green:</span> You have answered the question.
                <br />
                &bull; <span className="text-purple-400 font-semibold">Purple:</span> You have marked the question for review without answering.
                <br />
                &bull; <span className="text-purple-400 font-semibold">Purple with Green Dot:</span> You have answered the question and marked for review (counted in evaluation!).
              </p>

              <p>
                <strong>3. Navigation Controls:</strong>
                <br />
                &bull; Click <strong>Save &amp; Next</strong> to save answer and move to the next question.
                <br />
                &bull; Click <strong>Clear Response</strong> to deselect chosen option.
                <br />
                &bull; Click any number on the <strong>Question Palette</strong> to jump directly.
              </p>

              <p>
                <strong>4. Keyboard Shortcuts:</strong>
                <br />
                &bull; Press <strong>1, 2, 3, 4</strong> or <strong>A, B, C, D</strong> to select options.
                <br />
                &bull; Press <strong>Enter</strong> or <strong>S</strong> for Save &amp; Next.
                <br />
                &bull; Press <strong>F</strong> or <strong>F11</strong> for Fullscreen mode.
              </p>
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="bg-slate-950 p-4 border-t border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-400 text-xs">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span>PDF.js worker is bundled locally</span>
          </div>

          <button
            type="button"
            onClick={handleStart}
            disabled={
              isStarting ||
              isPdfValidating ||
              (contentMode === 'paper' && pdfSourceType === 'custom' && (!uploadedPdfFile || !isUploadedPdfValid)) ||
              (contentMode === 'bank' && !hasValidBankSelection)
            }
            className="flex min-h-11 items-center gap-2 rounded-xl bg-blue-700 px-6 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>{isStarting ? 'Preparing Exam...' : contentMode === 'bank' ? 'Start Practice Test' : 'Start NEET Exam Now'}</span>
          </button>
        </div>
        {startError && (
          <p role="alert" className="px-5 pb-4 text-right text-xs text-rose-300">
            {startError}
          </p>
        )}
      </div>
    </div>
  );
};
