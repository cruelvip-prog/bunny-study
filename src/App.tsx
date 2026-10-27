/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  OptionLetter,
  QuestionStatus,
  TestConfig,
  ExamSessionState,
  ExamQuestion,
  ExamSection,
  AnswerKeyStatus,
} from './types/exam';
import {
  saveSessionState,
  readSavedSessionState,
  clearSavedSessionState,
  savePdfToIndexedDB,
  getPdfFromIndexedDB,
} from './utils/storage';
import { getDeadlineRemainingSeconds } from './utils/examLogic';
import { validatePdfFile } from './utils/pdf';
import { generateSampleNeetPdf } from './utils/sampleNeetPaper';
import { Header } from './components/Header';
import { PdfViewer } from './components/PdfViewer';
import { QuestionControl } from './components/QuestionControl';
import { QuestionPalette } from './components/QuestionPalette';
import { ExamSetupModal } from './components/ExamSetupModal';
import { ConfirmSubmitModal } from './components/ConfirmSubmitModal';
import { ResultsView } from './components/ResultsView';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { QuestionBankViewer } from './components/QuestionBankViewer';
import { Dashboard, DashboardAction } from './components/Dashboard';
import { FeatureScreen, FeatureScreens } from './components/FeatureScreens';
import { ProfileAccountScreen } from './components/ProfileAccountScreen';
import { AdminPanel } from './admin/AdminPanel';
import { useAdminAccess } from './admin/useAdminAccess';
import { PiggieChatFloating } from './components/PiggieChatFloating';
import { readDashboardHistory, recordCompletedSession } from './utils/dashboardHistory';
import { getCustomTestImportedAnswerKey } from './utils/customTestBuilder';
import { useAuth } from './auth/AuthProvider';
import { EmailAuthScreen, AuthStatusScreen } from './auth/EmailAuthScreen';
import { ProfileSetup } from './auth/ProfileSetup';
import { setActiveAccountOwnerId } from './utils/accountStorage';

export default function App() {
  const { state, retryProfileCheck, retrySessionRestore, signOut } = useAuth();

  if (state.status === 'loading' || state.status === 'checking-profile') {
    return (
      <AuthStatusScreen
        title="Preparing your study space"
        message="Restoring your secure session and checking your profile…"
      />
    );
  }
  if (state.status === 'configuration-error') {
    return <AuthStatusScreen title="Setup required" message={state.error} />;
  }
  if (state.status === 'auth-error') {
    return (
      <AuthStatusScreen
        title="Could not restore your session"
        message={state.error}
        action={{ label: 'Try again', onClick: () => void retrySessionRestore() }}
      />
    );
  }
  if (state.status === 'signed-out') return <EmailAuthScreen />;
  if (state.status === 'password-recovery') return <EmailAuthScreen recovery />;
  if (state.status === 'profile-error') {
    return (
      <AuthStatusScreen
        title="We could not verify your profile"
        message={state.error}
        action={{ label: 'Retry profile check', onClick: () => void retryProfileCheck() }}
      />
    );
  }
  if (state.status === 'needs-profile') return <ProfileSetup />;
  return <AuthenticatedAppGate userId={state.session.user.id} />;
}

function AuthenticatedAppGate({ userId }: { userId: string }) {
  const [readyUserId, setReadyUserId] = useState<string | null>(null);
  useEffect(() => {
    setActiveAccountOwnerId(userId);
    setReadyUserId(userId);
    return () => {
      setActiveAccountOwnerId(null);
    };
  }, [userId]);

  if (readyUserId !== userId) {
    return <AuthStatusScreen title="Preparing your study space" message="Opening your account-specific study data…" />;
  }
  return <AuthenticatedApp key={userId} userId={userId} />;
}

function AuthenticatedApp({ userId }: { userId: string }) {
  const { isAdmin } = useAdminAccess(userId);
  // Session states
  const [config, setConfig] = useState<TestConfig | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<number>(1);
  const [userAnswers, setUserAnswers] = useState<Record<number, OptionLetter | null>>({});
  const [questionStatuses, setQuestionStatuses] = useState<Record<number, QuestionStatus>>({});
  const [timeRemainingSeconds, setTimeRemainingSeconds] = useState<number>(12000); // 200 mins default
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [startedAt, setStartedAt] = useState<number>(0);
  const [submittedAt, setSubmittedAt] = useState<number>(0);
  const [answerKey, setAnswerKey] = useState<Record<number, OptionLetter> | null>(null);
  const [answerKeyStatus, setAnswerKeyStatus] = useState<AnswerKeyStatus>('none');
  const [deadlineAtMs, setDeadlineAtMs] = useState<number>(0);
  const [examQuestions, setExamQuestions] = useState<ExamQuestion[]>([]);
  const [storageError, setStorageError] = useState<string | null>(null);

  // PDF Source
  const [pdfSource, setPdfSource] = useState<Blob | ArrayBuffer | string | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);

  // UI Modals & Settings
  const [showSetupModal, setShowSetupModal] = useState<boolean>(false);
  const [setupEntry, setSetupEntry] = useState<DashboardAction>('simulator');
  const [activeFeatureScreen, setActiveFeatureScreen] = useState<FeatureScreen | null>(null);
  const [featureSearchQuery, setFeatureSearchQuery] = useState('');
  const [showAdminPanel, setShowAdminPanel] = useState<boolean>(false);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState<boolean>(false);
  const [hasSavedSession, setHasSavedSession] = useState<boolean>(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [isResumingSession, setIsResumingSession] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [completedSessions, setCompletedSessions] = useState<ExamSessionState[]>([]);
  const [dashboardHistoryError, setDashboardHistoryError] = useState<string | null>(null);
  const [isViewingHistoryReport, setIsViewingHistoryReport] = useState<boolean>(false);
  const [isQuestionPaletteCollapsed, setIsQuestionPaletteCollapsed] = useState(false);

  // Splitter ratio (percentage of left pane, default 60%)
  const [leftPaneRatio, setLeftPaneRatio] = useState<number>(60);
  const isResizingRef = useRef<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Check saved session on mount
  useEffect(() => {
    const { session, error } = readSavedSessionState();
    const history = readDashboardHistory();
    setCompletedSessions(history.sessions);
    setDashboardHistoryError(history.error);
    if (session?.isSubmitted) {
      setConfig(session.config);
      setCurrentQuestion(session.currentQuestion);
      setUserAnswers(session.responses.answers);
      setQuestionStatuses(session.responses.statuses);
      setTimeRemainingSeconds(session.timeRemainingSeconds);
      setIsSubmitted(true);
      setStartedAt(session.startedAt);
      setSubmittedAt(session.submittedAt || Date.now());
      setAnswerKey(session.answerKey);
      setAnswerKeyStatus(session.answerKeyStatus || (session.answerKey ? 'user-provided' : 'none'));
      setDeadlineAtMs(session.deadlineAtMs || 0);
      setExamQuestions(session.examQuestions || []);
    } else if (session) {
      setHasSavedSession(true);
    }
    setRecoveryError(error);
  }, []);

  useEffect(() => {
    if (!isAdmin) setShowAdminPanel(false);
  }, [isAdmin]);

  // Sync fullscreen state
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, []);

  // Timer countdown
  useEffect(() => {
    if (!config || isSubmitted || !deadlineAtMs) return;
    const tick = () => {
      const maxSeconds = config.durationMinutes * 60;
      const remaining = getDeadlineRemainingSeconds(deadlineAtMs, maxSeconds);
      setTimeRemainingSeconds(remaining);
      if (remaining <= 0 && !isSubmitted) {
        setSubmittedAt(Date.now());
        setShowConfirmModal(false);
        setIsSubmitted(true);
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [config, isSubmitted, deadlineAtMs]);

  // Autosave all exam state, including bank content and absolute deadline.
  useEffect(() => {
    if (!config || isSubmitted || showSetupModal) return;

    const sessionState: ExamSessionState = {
      config,
      timeRemainingSeconds,
      currentQuestion,
      responses: {
        answers: userAnswers,
        statuses: questionStatuses,
      },
      isSubmitted,
      startedAt,
      submittedAt: isSubmitted ? submittedAt : undefined,
      answerKey,
      deadlineAtMs,
      examQuestions: config.sourceType === 'question-bank' ? examQuestions : undefined,
      answerKeyStatus,
    };
    try {
      saveSessionState(sessionState);
      setStorageError(null);
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : String(error));
    }
  }, [
    config, timeRemainingSeconds, currentQuestion, userAnswers, questionStatuses,
    isSubmitted, startedAt, submittedAt, answerKey, deadlineAtMs, examQuestions, answerKeyStatus, showSetupModal,
  ]);

  useEffect(() => {
    if (!config || !isSubmitted || !submittedAt) return;
    const completedSession: ExamSessionState = {
      config,
      timeRemainingSeconds,
      currentQuestion,
      responses: { answers: userAnswers, statuses: questionStatuses },
      isSubmitted: true,
      startedAt,
      submittedAt,
      answerKey,
      deadlineAtMs,
      examQuestions: config.sourceType === 'question-bank' ? examQuestions : undefined,
      answerKeyStatus,
    };
    try {
      if (!isViewingHistoryReport) {
        saveSessionState(completedSession);
        setStorageError(null);
      }
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : String(error));
    }
    try {
      recordCompletedSession(completedSession);
      const history = readDashboardHistory();
      setCompletedSessions(history.sessions);
      setDashboardHistoryError(history.error);
    } catch (error) {
      setDashboardHistoryError(error instanceof Error ? error.message : String(error));
    }
  }, [
    config, isSubmitted, submittedAt, timeRemainingSeconds, currentQuestion, userAnswers,
    questionStatuses, startedAt, answerKey, deadlineAtMs, examQuestions, answerKeyStatus, isViewingHistoryReport,
  ]);

  /*
   * The timer uses an absolute deadline rather than decrementing a cached
   * counter, so sleeping/reloading the tab does not grant extra time.
   */
  const handleStartExam = async (
    newConfig: TestConfig,
    uploadedFile: File | Blob | null,
    initialKey: Record<number, OptionLetter> | null,
    options: { questions?: ExamQuestion[]; answerKeyStatus: AnswerKeyStatus }
  ) => {
    const sourceType = newConfig.sourceType || (newConfig.hasCustomPdf ? 'pdf' : 'demo');
    if (sourceType === 'pdf' && !uploadedFile) {
      throw new Error('Choose a valid custom PDF before starting this exam.');
    }
    if (sourceType === 'question-bank' &&
        (!options.questions || options.questions.length !== newConfig.totalQuestions)) {
      throw new Error('A validated question set is required before starting a bank practice test.');
    }

    let examPdf: File | Blob | null = null;
    if (sourceType === 'pdf') {
      examPdf = uploadedFile;
    } else if (sourceType === 'demo') {
      examPdf = generateSampleNeetPdf(newConfig.totalQuestions);
    }

    if (examPdf) await savePdfToIndexedDB(newConfig.id, examPdf);
    clearSavedSessionState();

    const initialAnswers: Record<number, OptionLetter | null> = {};
    const initialStatuses: Record<number, QuestionStatus> = {};

    for (let i = 1; i <= newConfig.totalQuestions; i++) {
      initialAnswers[i] = null;
      initialStatuses[i] = i === 1 ? 'not_answered' : 'not_visited';
    }

    const started = Date.now();
    const deadline = started + newConfig.durationMinutes * 60 * 1000;
    setConfig({ ...newConfig, sourceType });
    setCurrentQuestion(1);
    setUserAnswers(initialAnswers);
    setQuestionStatuses(initialStatuses);
    setTimeRemainingSeconds(newConfig.durationMinutes * 60);
    setIsSubmitted(false);
    setIsViewingHistoryReport(false);
    setStartedAt(started);
    setDeadlineAtMs(deadline);
    setAnswerKey(initialKey);
    setAnswerKeyStatus(options.answerKeyStatus);
    setExamQuestions(options.questions || []);
    setIsQuestionPaletteCollapsed(false);
    setPdfSource(examPdf);
    setPdfFileName(examPdf
      ? sourceType === 'pdf'
        ? newConfig.pdfFileName || 'Custom_Question_Paper.pdf'
        : 'NEET_Incomplete_Demo_Paper.pdf'
      : null);

    setShowSetupModal(false);
    setHasSavedSession(false);
    setRecoveryError(null);
  };

  const handleStartPracticeTest = async (
    questions: ExamQuestion[],
    durationMinutes: number,
    title: string,
    useImportedAnswerKeys = false,
  ) => {
    if (hasSavedSession) {
      throw new Error('Resume or discard your unfinished saved test from the dashboard before starting another test.');
    }
    const sections: ExamSection[] = [];
    questions.forEach((question, index) => {
      const questionNumber = index + 1;
      const subject = question.subject.trim() || 'Practice';
      const lastSection = sections[sections.length - 1];
      if (lastSection?.name === subject) {
        lastSection.endQ = questionNumber;
        lastSection.total++;
      } else {
        sections.push({
          id: `section-${sections.length + 1}`,
          name: subject,
          startQ: questionNumber,
          endQ: questionNumber,
          total: 1,
        });
      }
    });

    const initialAnswerKey = getCustomTestImportedAnswerKey(questions);
    const config: TestConfig = {
      id: `bank-practice-${Date.now()}`,
      title,
      totalQuestions: questions.length,
      durationMinutes,
      candidateName: 'Practice Candidate',
      rollNumber: 'PRACTICE',
      sections,
      pdfFileName: null,
      hasCustomPdf: false,
      preset: 'custom',
      sourceType: 'question-bank',
      isCustomTest: useImportedAnswerKeys,
    };
    await handleStartExam(config, null, Object.keys(initialAnswerKey).length ? initialAnswerKey : null, {
      questions,
      answerKeyStatus: Object.keys(initialAnswerKey).length
        ? useImportedAnswerKeys ? 'custom-test-imported' : 'source-cited-unverified'
        : 'none',
    });
  };

  // Resume only a fully validated session. The saved data is retained on any restore failure.
  const handleResumeSavedSession = async () => {
    const { session: saved, error } = readSavedSessionState();
    if (!saved) {
      throw new Error(error || 'No valid saved session is available.');
    }

    const sourceType = saved.config.sourceType || (saved.config.hasCustomPdf ? 'pdf' : 'demo');
    let restoredPdf: Blob | ArrayBuffer | null = null;
    if (sourceType !== 'question-bank') {
      const storedPdf = await getPdfFromIndexedDB(saved.config.id);
      if (!storedPdf && sourceType === 'pdf') {
        throw new Error(
          'The saved custom PDF is missing or could not be restored. The saved session was kept; select the original PDF before resuming.'
        );
      }
      restoredPdf = storedPdf || generateSampleNeetPdf(saved.config.totalQuestions);
      if (!storedPdf) await savePdfToIndexedDB(saved.config.id, restoredPdf);
    }

    const deadline = saved.deadlineAtMs || saved.startedAt + saved.config.durationMinutes * 60 * 1000;
    const remaining = getDeadlineRemainingSeconds(deadline, saved.config.durationMinutes * 60);
    setConfig({ ...saved.config, sourceType });
    setCurrentQuestion(saved.currentQuestion);
    setUserAnswers(saved.responses.answers);
    setQuestionStatuses(saved.responses.statuses);
    setTimeRemainingSeconds(remaining);
    setIsSubmitted(saved.isSubmitted || remaining === 0);
    setIsViewingHistoryReport(false);
    setStartedAt(saved.startedAt);
    setDeadlineAtMs(deadline);
    setAnswerKey(saved.answerKey);
    setAnswerKeyStatus(saved.answerKeyStatus || (saved.answerKey ? 'user-provided' : 'none'));
    setExamQuestions(saved.examQuestions || []);
    setPdfSource(restoredPdf);
    setPdfFileName(
      saved.config.pdfFileName ||
        (sourceType === 'pdf' ? 'Restored_Question_Paper.pdf' :
          sourceType === 'demo' ? 'NEET_Incomplete_Demo_Paper.pdf' : null)
    );
    setShowSetupModal(false);
    setHasSavedSession(false);
    setRecoveryError(null);
  };

  const handleDashboardResume = async () => {
    setResumeError(null);
    setIsResumingSession(true);
    try {
      await handleResumeSavedSession();
    } catch (error) {
      setResumeError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsResumingSession(false);
    }
  };

  const handleDashboardSelection = (entry: DashboardAction) => {
    if (entry === 'simulator' || entry === 'import-paper') {
      setActiveFeatureScreen(null);
      setSetupEntry(entry);
      setShowSetupModal(true);
    } else {
      setActiveFeatureScreen(entry);
      setFeatureSearchQuery('');
    }
    setResumeError(null);
  };

  const handleFeatureNavigation = (screen: FeatureScreen, query?: string) => {
    setActiveFeatureScreen(screen);
    setFeatureSearchQuery(query || '');
  };

  const handleOpenCompletedReport = (session: ExamSessionState) => {
    setActiveFeatureScreen(null);
    setConfig(session.config);
    setCurrentQuestion(session.currentQuestion);
    setUserAnswers(session.responses.answers);
    setQuestionStatuses(session.responses.statuses);
    setTimeRemainingSeconds(session.timeRemainingSeconds);
    setIsSubmitted(true);
    setIsViewingHistoryReport(true);
    setStartedAt(session.startedAt);
    setSubmittedAt(session.submittedAt || Date.now());
    setAnswerKey(session.answerKey);
    setAnswerKeyStatus(session.answerKeyStatus || (session.answerKey ? 'user-provided' : 'none'));
    setDeadlineAtMs(session.deadlineAtMs || 0);
    setExamQuestions(session.examQuestions || []);
    setPdfSource(null);
    setPdfFileName(session.config.pdfFileName || null);
    setStorageError(null);
  };

  const handleDiscardSavedSession = () => {
    clearSavedSessionState();
    setHasSavedSession(false);
    setRecoveryError(null);
  };

  // Submit flow
  const handleFinalSubmit = () => {
    if (!config) return;
    const completionTime = Date.now();
    const finalStatuses = { ...questionStatuses };
    for (let question = 1; question <= config.totalQuestions; question++) {
      const status = finalStatuses[question];
      const marked = status === 'marked_for_review' || status === 'answered_marked_for_review';
      const answered = userAnswers[question] !== null && userAnswers[question] !== undefined;
      finalStatuses[question] = answered
        ? marked ? 'answered_marked_for_review' : 'answered'
        : marked ? 'marked_for_review' : status || 'not_visited';
    }
    try {
      saveSessionState({
        config,
        timeRemainingSeconds,
        currentQuestion,
        responses: { answers: userAnswers, statuses: finalStatuses },
        isSubmitted: true,
        startedAt,
        submittedAt: completionTime,
        answerKey,
        deadlineAtMs,
        examQuestions: config.sourceType === 'question-bank' ? examQuestions : undefined,
        answerKeyStatus,
      });
      setStorageError(null);
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : String(error));
    }
    setQuestionStatuses(finalStatuses);
    setShowConfirmModal(false);
    setIsSubmitted(true);
    setSubmittedAt(completionTime);
  };

  const handleResultAnswerKeyChange = (
    nextKey: Record<number, OptionLetter> | null,
    nextStatus: AnswerKeyStatus
  ) => {
    setAnswerKey(nextKey);
    setAnswerKeyStatus(nextStatus);
    if (isViewingHistoryReport) return;
    if (!config) return;
    try {
      saveSessionState({
        config,
        timeRemainingSeconds,
        currentQuestion,
        responses: { answers: userAnswers, statuses: questionStatuses },
        isSubmitted: true,
        startedAt,
        submittedAt: submittedAt || Date.now(),
        answerKey: nextKey,
        deadlineAtMs,
        examQuestions: config.sourceType === 'question-bank' ? examQuestions : undefined,
        answerKeyStatus: nextStatus,
      });
      setStorageError(null);
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : String(error));
    }
  };

  // Restart / Reset
  const handleRestart = () => {
    if (!isViewingHistoryReport) clearSavedSessionState();
    setConfig(null);
    setIsSubmitted(false);
    setIsViewingHistoryReport(false);
    setShowSetupModal(false);
    setActiveFeatureScreen(null);
  };

  /*
   * Question selection and navigation remain shared between PDF, demo, and
   * imported-bank practice tests.
   */
  const handleSelectOption = (opt: OptionLetter) => {
    setUserAnswers((prev) => ({
      ...prev,
      [currentQuestion]: opt,
    }));
    setQuestionStatuses((prev) => ({
      ...prev,
      [currentQuestion]: prev[currentQuestion] === 'marked_for_review' ||
        prev[currentQuestion] === 'answered_marked_for_review'
        ? 'answered_marked_for_review'
        : 'answered',
    }));
  };

  const navigateToQuestion = (targetQ: number) => {
    if (!config) return;
    const clampedQ = Math.max(1, Math.min(targetQ, config.totalQuestions));

    setQuestionStatuses((prev) => {
      const currentStatus = prev[currentQuestion];
      const hasAnswer = userAnswers[currentQuestion] !== null && userAnswers[currentQuestion] !== undefined;
      const updatedCurrentStatus = hasAnswer
        ? currentStatus === 'marked_for_review' || currentStatus === 'answered_marked_for_review'
          ? 'answered_marked_for_review'
          : 'answered'
        : currentStatus === 'answered_marked_for_review' || currentStatus === 'marked_for_review'
          ? 'marked_for_review'
          : 'not_answered';
      const targetStatus = prev[clampedQ] || 'not_visited';
      const updatedTargetStatus = targetStatus === 'not_visited' ? 'not_answered' : targetStatus;
      return { ...prev, [currentQuestion]: updatedCurrentStatus, [clampedQ]: updatedTargetStatus };
    });
    setCurrentQuestion(clampedQ);
  };

  const handleSaveAndNext = () => {
    if (!config) return;
    const hasAnswer = userAnswers[currentQuestion] !== null && userAnswers[currentQuestion] !== undefined;
    setQuestionStatuses((prev) => ({
      ...prev,
      [currentQuestion]: hasAnswer
        ? prev[currentQuestion] === 'marked_for_review' || prev[currentQuestion] === 'answered_marked_for_review'
          ? 'answered_marked_for_review'
          : 'answered'
        : prev[currentQuestion] === 'marked_for_review' ? 'marked_for_review' : 'not_answered',
    }));
    if (currentQuestion < config.totalQuestions) navigateToQuestion(currentQuestion + 1);
  };

  const handleSaveAndMarkForReview = () => {
    if (!config) return;
    const hasAnswer = userAnswers[currentQuestion] !== null && userAnswers[currentQuestion] !== undefined;
    setQuestionStatuses((prev) => ({
      ...prev,
      [currentQuestion]: hasAnswer ? 'answered_marked_for_review' : 'marked_for_review',
    }));
    if (currentQuestion < config.totalQuestions) navigateToQuestion(currentQuestion + 1);
  };

  const handleMarkForReviewAndNext = () => {
    if (!config) return;
    const hasAnswer = userAnswers[currentQuestion] !== null && userAnswers[currentQuestion] !== undefined;
    setQuestionStatuses((prev) => ({
      ...prev,
      [currentQuestion]: hasAnswer ? 'answered_marked_for_review' : 'marked_for_review',
    }));
    if (currentQuestion < config.totalQuestions) navigateToQuestion(currentQuestion + 1);
  };

  const handleClearResponse = () => {
    setUserAnswers((prev) => ({ ...prev, [currentQuestion]: null }));
    setQuestionStatuses((prev) => ({
      ...prev,
      [currentQuestion]: prev[currentQuestion] === 'answered_marked_for_review' ? 'marked_for_review' : 'not_answered',
    }));
  };

  const handlePrevious = () => {
    if (currentQuestion > 1) navigateToQuestion(currentQuestion - 1);
  };

  const handleNext = () => {
    if (config && currentQuestion < config.totalQuestions) navigateToQuestion(currentQuestion + 1);
  };

  const handlePdfUpload = async (file: File) => {
    if (!config) return;
    await validatePdfFile(file);
    await savePdfToIndexedDB(config.id, file);
    setPdfSource(file);
    setPdfFileName(file.name);
    setConfig((previous) => previous ? { ...previous, pdfFileName: file.name } : previous);
  };

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => console.warn('Fullscreen request failed:', err));
    } else {
      document.exitFullscreen().catch((err) => console.warn('Exit fullscreen failed:', err));
    }
  };

  // Keyboard shortcuts handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      const targetTag = target?.tagName.toLowerCase();
      const focusedAnswerOption = target?.closest('[role="radio"]');
      if (
        targetTag === 'input' ||
        targetTag === 'textarea' ||
        targetTag === 'select' ||
        target?.isContentEditable ||
        (target?.closest('button,[role="radio"]') && !focusedAnswerOption)
      ) return;

      if (showSetupModal || showConfirmModal || isSubmitted || !config) return;

      const key = e.key.toUpperCase();
      if (focusedAnswerOption && !['A', 'B', 'C', 'D', '1', '2', '3', '4'].includes(key)) return;

      // Options selection: A, B, C, D or 1, 2, 3, 4
      if (key === 'A' || key === '1') {
        e.preventDefault();
        handleSelectOption('A');
      } else if (key === 'B' || key === '2') {
        e.preventDefault();
        handleSelectOption('B');
      } else if (key === 'C' || key === '3') {
        e.preventDefault();
        handleSelectOption('C');
      } else if (key === 'D' || key === '4') {
        e.preventDefault();
        handleSelectOption('D');
      }
      // Save & Next: Enter or S
      else if (e.key === 'Enter' || key === 'S') {
        e.preventDefault();
        handleSaveAndNext();
      }
      // Clear: Backspace or Delete or C
      else if (e.key === 'Backspace' || e.key === 'Delete' || key === 'C') {
        e.preventDefault();
        handleClearResponse();
      }
      // Mark for Review: M or R
      else if (key === 'M' || key === 'R') {
        e.preventDefault();
        if (userAnswers[currentQuestion]) {
          handleSaveAndMarkForReview();
        } else {
          handleMarkForReviewAndNext();
        }
      }
      // Navigation: ArrowLeft or P -> Previous
      else if (e.key === 'ArrowLeft' || key === 'P') {
        e.preventDefault();
        handlePrevious();
      }
      // Navigation: ArrowRight or N -> Next
      else if (e.key === 'ArrowRight' || key === 'N') {
        e.preventDefault();
        handleNext();
      }
      // Fullscreen: F
      else if (key === 'F' && !e.ctrlKey) {
        e.preventDefault();
        toggleFullscreen();
      }
      // Shortcuts Help: ? or H
      else if (key === '?' || key === 'H') {
        e.preventDefault();
        setShowShortcutsModal((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    showSetupModal,
    showConfirmModal,
    isSubmitted,
    config,
    currentQuestion,
    userAnswers,
    handleSaveAndNext,
    handleSaveAndMarkForReview,
    handleMarkForReviewAndNext,
    handleClearResponse,
    handlePrevious,
    handleNext,
  ]);

  // Pane Splitter resizing
  const handleSplitterMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const rawPercent = ((moveEvent.clientX - rect.left) / rect.width) * 100;
      const clamped = Math.max(30, Math.min(rawPercent, 75));
      setLeftPaneRatio(clamped);
    };

    const onMouseUp = () => {
      isResizingRef.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Section name for current question
  const currentSectionName =
    config?.sections.find((s) => currentQuestion >= s.startQ && currentQuestion <= s.endQ)
      ?.name || 'All Questions';

  const answeredCount = Object.values(userAnswers).filter((v) => v !== null).length;

  return (
    <div className={`flex min-w-0 flex-col ${isSubmitted ? 'min-h-screen w-full bg-slate-50 text-slate-900' : config && !showSetupModal ? 'min-h-screen w-full bg-slate-50 text-slate-900 lg:h-screen lg:overflow-hidden' : config || showSetupModal ? 'h-screen w-full bg-slate-50 text-slate-900' : 'min-h-screen w-full bg-slate-100 text-slate-900'} font-sans`}>
      {!config && !isSubmitted && !showSetupModal && !activeFeatureScreen && showAdminPanel && isAdmin && (
        <AdminPanel onBack={() => setShowAdminPanel(false)} />
      )}
      {!config && !isSubmitted && !showSetupModal && !activeFeatureScreen && (!showAdminPanel || !isAdmin) && (
        <Dashboard
          onNavigate={handleDashboardSelection}
          hasSavedSession={hasSavedSession}
          recoveryError={recoveryError}
          resumeError={resumeError}
          isResuming={isResumingSession}
          onResume={handleDashboardResume}
          onDiscardSavedSession={handleDiscardSavedSession}
          completedSessions={completedSessions}
          historyError={dashboardHistoryError}
          onOpenReport={handleOpenCompletedReport}
          isAdmin={isAdmin}
          onOpenAdmin={() => setShowAdminPanel(true)}
        />
      )}
      {!config && !isSubmitted && !showSetupModal && activeFeatureScreen === 'profile' && (
        <ProfileAccountScreen onBack={() => setActiveFeatureScreen(null)} />
      )}
      {!config && !isSubmitted && !showSetupModal && activeFeatureScreen && activeFeatureScreen !== 'profile' && (
        <FeatureScreens
          screen={activeFeatureScreen}
          searchQuery={featureSearchQuery}
          sessions={completedSessions}
          onBack={() => setActiveFeatureScreen(null)}
          onNavigate={handleFeatureNavigation}
          onOpenReport={handleOpenCompletedReport}
          onStartTest={handleStartPracticeTest}
        />
      )}
      {/* Setup Modal on Initial Start or Restart */}
      {showSetupModal && (
        <ExamSetupModal
          initialContentMode={setupEntry === 'custom-test' ? 'bank' : 'paper'}
          initialPdfSourceType={setupEntry === 'import-paper' ? 'custom' : 'sample'}
          initialPreset={setupEntry === 'custom-test' ? 'custom' : '180'}
          onBackToDashboard={() => setShowSetupModal(false)}
          onStartExam={handleStartExam}
          hasSavedSession={hasSavedSession}
          onResumeSavedSession={handleResumeSavedSession}
          onDiscardSavedSession={handleDiscardSavedSession}
          recoveryError={recoveryError}
        />
      )}

      {/* Confirmation Modal before Final Submit */}
      {showConfirmModal && config && (
        <ConfirmSubmitModal
          isOpen={showConfirmModal}
          onClose={() => setShowConfirmModal(false)}
          onConfirm={handleFinalSubmit}
          totalQuestions={config.totalQuestions}
          timeRemainingSeconds={timeRemainingSeconds}
          statuses={questionStatuses}
        />
      )}

      {/* Keyboard Shortcuts Reference Modal */}
      <KeyboardShortcutsModal
        isOpen={showShortcutsModal}
        onClose={() => setShowShortcutsModal(false)}
      />

      {/* If Exam is Finished: Display Results Scorecard */}
      {isSubmitted && config && (
        <>
          {storageError && (
            <div role="alert" className="fixed bottom-3 left-3 z-40 max-w-md rounded border border-amber-700 bg-amber-950/95 p-3 text-xs text-amber-100 shadow-lg">
              The completed report could not be saved for reload recovery. {storageError}
            </div>
          )}
          <ResultsView
            config={config}
            userAnswers={userAnswers}
            statuses={questionStatuses}
            initialAnswerKey={answerKey}
            initialAnswerKeyStatus={answerKeyStatus}
            examQuestions={examQuestions}
            timeSpentSeconds={config.durationMinutes * 60 - timeRemainingSeconds}
            onAnswerKeyChange={handleResultAnswerKeyChange}
            onRestart={handleRestart}
          />
        </>
      )}

      {/* In-Exam Active Interface */}
      {!isSubmitted && config && !showSetupModal && (
        <>
          {/* Official Candidate & Timer Header */}
          <Header
            config={config}
            timeRemainingSeconds={timeRemainingSeconds}
            isFullscreen={isFullscreen}
            onToggleFullscreen={toggleFullscreen}
            onOpenHelp={() => setShowShortcutsModal(true)}
            onRequestSubmit={() => setShowConfirmModal(true)}
            answeredCount={answeredCount}
            totalQuestions={config.totalQuestions}
          />

          {config.sourceType === 'question-bank' && examQuestions[currentQuestion - 1] ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-slate-100 lg:flex-row lg:overflow-hidden">
              <div className="h-[calc(100vh-9rem)] min-h-[34rem] w-full min-w-0 shrink-0 lg:h-full lg:min-h-0 lg:flex-1">
                <QuestionBankViewer
                  question={examQuestions[currentQuestion - 1]}
                  questionNumber={currentQuestion}
                  totalQuestions={config.totalQuestions}
                  showManualReviewWarning={!config.isCustomTest}
                  selectedOption={userAnswers[currentQuestion] || null}
                  status={questionStatuses[currentQuestion] || 'not_visited'}
                  onSelectOption={handleSelectOption}
                  onSaveAndNext={handleSaveAndNext}
                  onMarkForReviewAndNext={handleMarkForReviewAndNext}
                  onClearResponse={handleClearResponse}
                  onPrevious={handlePrevious}
                  onNext={handleNext}
                />
              </div>
              <aside
                className={`flex w-full min-w-0 shrink-0 flex-col border-t border-slate-200 bg-white transition-[width] lg:h-full lg:min-h-0 lg:border-l lg:border-t-0 ${
                  isQuestionPaletteCollapsed
                    ? 'h-auto lg:w-14'
                    : 'h-[22rem] lg:w-80 lg:flex-none'
                }`}
              >
                <div className="flex min-h-12 items-center justify-between border-b border-slate-200 px-3">
                  {!isQuestionPaletteCollapsed && (
                    <div>
                      <h2 className="text-sm font-semibold text-slate-800">Question Palette</h2>
                      <p className="text-xs text-slate-500">{config.totalQuestions} questions</p>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsQuestionPaletteCollapsed((collapsed) => !collapsed)}
                    aria-expanded={!isQuestionPaletteCollapsed}
                    aria-controls="imported-question-palette"
                    aria-label={isQuestionPaletteCollapsed ? 'Expand question palette' : 'Collapse question palette'}
                    title={isQuestionPaletteCollapsed ? 'Expand question palette' : 'Collapse question palette'}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                  >
                    {isQuestionPaletteCollapsed
                      ? <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                      : <ChevronRight className="h-5 w-5" aria-hidden="true" />}
                  </button>
                </div>
                <div id="imported-question-palette" hidden={isQuestionPaletteCollapsed} className="min-h-0 flex-1">
                  <QuestionPalette
                    totalQuestions={config.totalQuestions}
                    currentQuestion={currentQuestion}
                    sections={config.sections}
                    statuses={questionStatuses}
                    onSelectQuestion={navigateToQuestion}
                    onSubmitExam={() => setShowConfirmModal(true)}
                    showTitle={false}
                  />
                </div>
              </aside>
            </div>
          ) : (
          <>
          <div
            ref={containerRef}
            className="relative flex min-h-0 flex-1 select-none flex-col overflow-hidden lg:flex-row"
          >
            {/* Left Pane: PDF question paper */}
            <div
              className="h-1/2 min-h-0 lg:h-full overflow-hidden transition-[width] duration-75"
              style={{
                width: window.innerWidth >= 1024 ? `${leftPaneRatio}%` : '100%',
              }}
            >
              <PdfViewer
                pdfSource={pdfSource}
                pdfFileName={pdfFileName}
                onPdfUpload={handlePdfUpload}
                className="h-full"
              />
            </div>
            {/* Splitter Resizer Handle (Desktop only) */}
            <div
              onMouseDown={handleSplitterMouseDown}
              className="hidden lg:flex w-2.5 bg-slate-100 hover:bg-blue-100 active:bg-blue-200 cursor-col-resize items-center justify-center transition-colors group z-20 border-x border-slate-200"
              title="Drag to adjust split ratio"
            >
              <div className="w-0.5 h-8 bg-slate-400 group-hover:bg-blue-600 rounded" />
            </div>

            {/* Right Pane: Active Question & Palette (Independent Scrolling) */}
            <div
              className="h-1/2 min-h-0 lg:h-full flex flex-col md:flex-row overflow-hidden bg-white"
              style={{
                width:
                  window.innerWidth >= 1024
                    ? `${100 - leftPaneRatio}%`
                    : '100%',
              }}
            >
              {/* Question Response Controls */}
              <div className="flex-1 h-full overflow-y-auto">
                <QuestionControl
                  questionNumber={currentQuestion}
                  totalQuestions={config.totalQuestions}
                  sectionName={currentSectionName}
                  isDemoMode={config.sourceType === 'demo' || (!config.sourceType && !config.hasCustomPdf)}
                  examQuestion={examQuestions[currentQuestion - 1]}
                  selectedOption={userAnswers[currentQuestion] || null}
                  status={questionStatuses[currentQuestion] || 'not_visited'}
                  onSelectOption={handleSelectOption}
                  onSaveAndNext={handleSaveAndNext}
                  onSaveAndMarkForReview={handleSaveAndMarkForReview}
                  onMarkForReviewAndNext={handleMarkForReviewAndNext}
                  onClearResponse={handleClearResponse}
                  onPrevious={handlePrevious}
                  onNext={handleNext}
                  isPaletteVisible={!isQuestionPaletteCollapsed}
                  onTogglePalette={() => setIsQuestionPaletteCollapsed((collapsed) => !collapsed)}
                />
              </div>

              {/* NTA Question Palette */}
              <div
                id="pdf-question-palette"
                hidden={isQuestionPaletteCollapsed}
                className="w-full md:w-64 lg:w-72 h-64 md:h-full min-h-0 overflow-hidden border-t md:border-t-0 md:border-l border-slate-200"
              >
                <QuestionPalette
                  totalQuestions={config.totalQuestions}
                  currentQuestion={currentQuestion}
                  sections={config.sections}
                  statuses={questionStatuses}
                  onSelectQuestion={navigateToQuestion}
                  onSubmitExam={() => setShowConfirmModal(true)}
                />
              </div>
            </div>
          </div>
          </>
          )}
        </>
      )}
      {storageError && !showSetupModal && !isSubmitted && (
        <div role="alert" className="fixed bottom-3 left-3 z-40 max-w-md rounded border border-amber-700 bg-amber-950/95 p-3 text-xs text-amber-100 shadow-lg">
          {storageError} Keep this tab open until progress can be saved.
        </div>
      )}
    </div>
  );
}
