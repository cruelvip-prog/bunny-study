import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  CheckCircle2,
  Clock3,
  FileDown,
  KeyRound,
  Printer,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { AnswerKeyStatus, ExamQuestion, OptionLetter, QuestionStatus, TestConfig } from '../types/exam';
import { parseAnswerKeyInput } from '../utils/answerKeyParser';
import { calculateExamResults } from '../utils/examLogic';
import { buildAnswerReport, downloadAnswerReportPdf } from '../utils/answerReport';
import { getOptionDisplayLabel, getQuestionLanguageView, QuestionLanguage } from '../utils/questionLanguage';
import { getCustomTestImportedAnswerKey } from '../utils/customTestBuilder';
import { MathText } from './MathText';
import { QuestionImages } from './QuestionImages';

interface ResultsViewProps {
  config: TestConfig;
  userAnswers: Record<number, OptionLetter | null>;
  statuses: Record<number, QuestionStatus>;
  initialAnswerKey: Record<number, OptionLetter> | null;
  initialAnswerKeyStatus: AnswerKeyStatus;
  examQuestions: ExamQuestion[];
  timeSpentSeconds: number;
  onAnswerKeyChange: (key: Record<number, OptionLetter> | null, status: AnswerKeyStatus) => void;
  onRestart: () => void;
}

type AnalysisTab = 'overview' | 'performance' | 'time' | 'attempt' | 'difficulty' | 'review';
type ReviewFilter = 'all' | 'correct' | 'incorrect' | 'unattempted' | 'not-visited';

const TABS: Array<{ id: AnalysisTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'performance', label: 'Performance' },
  { id: 'time', label: 'Time Analysis' },
  { id: 'attempt', label: 'Attempt Analysis' },
  { id: 'difficulty', label: 'Difficulty' },
  { id: 'review', label: 'Question Review' },
];

export const ResultsView: React.FC<ResultsViewProps> = ({
  config,
  userAnswers,
  statuses,
  initialAnswerKey,
  initialAnswerKeyStatus,
  examQuestions,
  timeSpentSeconds,
  onAnswerKeyChange,
  onRestart,
}) => {
  const [answerKey, setAnswerKey] = useState<Record<number, OptionLetter> | null>(initialAnswerKey);
  const [answerKeyStatus, setAnswerKeyStatus] = useState<AnswerKeyStatus>(initialAnswerKeyStatus);
  const [rawKeyInput, setRawKeyInput] = useState('');
  const [keyInputError, setKeyInputError] = useState<string | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [isDownloadingReport, setIsDownloadingReport] = useState(false);
  const [activeTab, setActiveTab] = useState<AnalysisTab>('overview');
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('all');
  const [reviewLanguage, setReviewLanguage] = useState<QuestionLanguage>('en');
  const customTestQuestionKey = useMemo(
    () => config.isCustomTest ? getCustomTestImportedAnswerKey(examQuestions) : {},
    [config.isCustomTest, examQuestions],
  );
  const effectiveAnswerKey = config.isCustomTest &&
      answerKeyStatus !== 'user-provided' && answerKeyStatus !== 'user-verified-import'
    ? Object.keys(customTestQuestionKey).length ? customTestQuestionKey : answerKey
    : answerKey;
  const effectiveAnswerKeyStatus = config.isCustomTest &&
      Object.keys(customTestQuestionKey).length > 0 &&
      answerKeyStatus !== 'user-provided' && answerKeyStatus !== 'user-verified-import'
    ? 'custom-test-imported'
    : answerKeyStatus;

  const results = useMemo(
    () => calculateExamResults(config, userAnswers, statuses, effectiveAnswerKey, effectiveAnswerKeyStatus),
    [config, userAnswers, statuses, effectiveAnswerKey, effectiveAnswerKeyStatus],
  );
  const answerReport = useMemo(
    () => buildAnswerReport(config, userAnswers, statuses, effectiveAnswerKey, effectiveAnswerKeyStatus, examQuestions),
    [config, userAnswers, statuses, effectiveAnswerKey, effectiveAnswerKeyStatus, examQuestions],
  );
  const notVisitedCount = results.questionResults.filter((question) => question.status === 'not_visited').length;
  const visitedUnansweredCount = results.questionResults.filter((question) =>
    !question.userAnswer && question.status !== 'not_visited',
  ).length;
  const unkeyedQuestionNumbers = results.questionResults
    .filter((question) => question.correctAnswer === null)
    .map((question) => question.questionNumber);
  const timeIsAvailable = Number.isFinite(timeSpentSeconds) && timeSpentSeconds >= 0;

  const handleApplyKey = () => {
    setKeyInputError(null);
    if (!rawKeyInput.trim()) {
      setKeyInputError('Please enter or paste the answer key text.');
      return;
    }
    const parsed = parseAnswerKeyInput(rawKeyInput, config.totalQuestions);
    if (parsed.errors.length) {
      setKeyInputError(parsed.errors.join(' '));
      return;
    }
    if (parsed.totalFound === 0) {
      setKeyInputError(parsed.errors[0] || 'No valid answers found. Format: 1:A 2:B 3:C or ABCD...');
      return;
    }
    setAnswerKey(parsed.keyMap);
    setAnswerKeyStatus('user-provided');
    onAnswerKeyChange(parsed.keyMap, 'user-provided');
  };

  const handleDownloadReport = async () => {
    setReportError(null);
    setIsDownloadingReport(true);
    try {
      await downloadAnswerReportPdf(answerReport);
    } catch (error) {
      setReportError(`Could not generate the PDF report. The in-app report is still available. ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsDownloadingReport(false);
    }
  };

  const filteredQuestions = results.questionResults.filter((question) => {
    if (reviewFilter === 'correct') return question.isCorrect === true;
    if (reviewFilter === 'incorrect') return question.isCorrect === false;
    if (reviewFilter === 'unattempted') return question.userAnswer === null && question.status !== 'not_visited';
    if (reviewFilter === 'not-visited') return question.status === 'not_visited';
    return true;
  });

  const difficultyGroups = ['easy', 'medium', 'hard'].map((difficulty) => {
    const questions = results.questionResults.filter((result) =>
      String(examQuestions[result.questionNumber - 1]?.schemaV2?.difficulty || '').toLowerCase() === difficulty,
    );
    return {
      difficulty,
      total: questions.length,
      correct: questions.filter((question) => question.isCorrect === true).length,
      incorrect: questions.filter((question) => question.isCorrect === false).length,
      unattempted: questions.filter((question) => question.userAnswer === null).length,
      notVisited: questions.filter((question) => question.status === 'not_visited').length,
      keyed: questions.filter((question) => question.correctAnswer !== null).length,
    };
  });
  const questionsWithDifficulty = difficultyGroups.reduce((sum, group) => sum + group.total, 0);
  const hasPartialQuestionBankKey = config.sourceType === 'question-bank' &&
    results.scoredQuestions > 0 && results.scoredQuestions < config.totalQuestions;
  const unscoredReason = config.sourceType === 'question-bank'
    ? answerKeyStatus === 'source-cited-unverified' || answerKeyStatus === 'ai-generated-review-required'
      ? 'Imported key is unverified'
      : 'No usable answer key was provided'
    : config.hasCustomPdf
      ? 'Key required for score'
      : 'Built-in demo is unscored';

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const currentIndex = TABS.findIndex((tab) => tab.id === activeTab);
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const next = (currentIndex + direction + TABS.length) % TABS.length;
    setActiveTab(TABS[next].id);
    document.getElementById(`analysis-tab-${TABS[next].id}`)?.focus();
  };

  return (
    <main className="results-page min-h-screen bg-slate-50 px-4 py-5 text-slate-800 sm:px-6 lg:px-8 print:bg-white print:p-0">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-700 text-xs font-extrabold tracking-wide text-white">OP</div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">Bunny study · Test Analysis</p>
              <h1 className="mt-1 truncate text-xl font-bold text-slate-900 sm:text-2xl">{config.title}</h1>
              <p className="mt-1 text-xs text-slate-500">
                {config.candidateName || 'Candidate'} · {config.totalQuestions} questions · {timeIsAvailable ? `Time taken ${formatTime(timeSpentSeconds)}` : 'Time data unavailable'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 print:hidden">
            <button type="button" onClick={() => window.print()} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
              <Printer className="h-4 w-4" aria-hidden="true" /> Print / Save PDF
            </button>
            <button type="button" onClick={() => { void handleDownloadReport(); }} disabled={isDownloadingReport} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
              <FileDown className="h-4 w-4 text-blue-700" aria-hidden="true" /> {isDownloadingReport ? 'Preparing…' : 'Download report'}
            </button>
            <button type="button" onClick={onRestart} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">
              <RotateCcw className="h-4 w-4" aria-hidden="true" /> New Test
            </button>
          </div>
        </header>

        {((config.hasCustomPdf && results.scoredQuestions < config.totalQuestions) ||
          (config.sourceType === 'question-bank' && results.scoredQuestions === 0)) && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5 print:hidden" aria-labelledby="answer-key-heading">
            <div className="flex items-center gap-2 text-sm font-bold text-amber-900">
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              <h2 id="answer-key-heading">Add a checked answer key to calculate the score</h2>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-amber-900/80">
              Enter a key you personally checked against the original source. Partial keys are accepted. The simulator does not authenticate imported answers or external sources.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={rawKeyInput}
                onChange={(event) => setRawKeyInput(event.target.value)}
                placeholder="Example: 1:B 2:C 3:A or BCAD…"
                aria-label="Answer key"
                className="min-h-11 min-w-0 flex-1 rounded-lg border border-amber-300 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
              />
              <button type="button" onClick={handleApplyKey} className="min-h-11 rounded-lg bg-amber-700 px-4 text-sm font-bold text-white hover:bg-amber-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700">
                Apply key
              </button>
            </div>
            {keyInputError && <p role="alert" className="mt-2 text-sm text-rose-700">{keyInputError}</p>}
          </section>
        )}
        {hasPartialQuestionBankKey && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5" aria-label="Partial answer key notice">
            <p className="text-sm leading-relaxed text-amber-900">
              Results use available answer keys for {results.scoredQuestions} of {config.totalQuestions} questions.
              {' '}No usable answer key is available for question(s) {unkeyedQuestionNumbers.join(', ')}; these are not scored. No missing answers were inferred.
            </p>
          </section>
        )}
        {reportError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{reportError}</p>}

        <div className="overflow-x-auto border-b border-slate-200 print:hidden" role="tablist" aria-label="Test analysis sections" onKeyDown={handleTabKeyDown}>
          <div className="flex min-w-max gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                id={`analysis-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls="analysis-panel"
                tabIndex={activeTab === tab.id ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                className={`min-h-11 border-b-2 px-4 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${
                  activeTab === tab.id ? 'border-blue-700 text-blue-800' : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <section id="analysis-panel" role="tabpanel" aria-labelledby={`analysis-tab-${activeTab}`} className="space-y-5">
          {activeTab === 'overview' && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Metric label="Total score" value={results.hasAnswerKey ? `${results.totalScore} / ${results.maxPossibleScore}` : 'Not scored'} detail={results.hasAnswerKey ? `${results.percentage}% of keyed maximum` : unscoredReason} icon={<BarChart3 className="h-5 w-5" />} />
                <Metric label="Correct" value={results.hasAnswerKey ? results.totalCorrect : '—'} detail={results.hasAnswerKey ? `+${results.totalCorrect * 4} marks` : 'Requires a checked answer key'} tone="green" icon={<CheckCircle2 className="h-5 w-5" />} />
                <Metric label="Incorrect" value={results.hasAnswerKey ? results.totalIncorrect : '—'} detail={results.hasAnswerKey ? `−${results.totalIncorrect} marks` : 'Requires a checked answer key'} tone="red" icon={<XCircle className="h-5 w-5" />} />
                <Metric label="Accuracy" value={results.hasAnswerKey ? `${results.accuracy}%` : '—'} detail={`${results.totalAttempted} attempted of ${config.totalQuestions}`} icon={<BookOpen className="h-5 w-5" />} />
              </div>
              <div className="grid gap-5 xl:grid-cols-[1.25fr_1fr]">
                <Card title="Response summary">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Count label="Attempted" value={results.totalAttempted} />
                    <Count label="Unanswered" value={visitedUnansweredCount} />
                    <Count label="Not visited" value={notVisitedCount} />
                    <Count label="Marked for review" value={results.totalMarkedForReview} />
                  </div>
                  <ProgressBar value={config.totalQuestions ? (results.totalAttempted / config.totalQuestions) * 100 : 0} label="Attempted questions" />
                </Card>
                <Card title="Subject-wise progress">
                  <SubjectBreakdown sections={results.sectionStats} hasKey={results.hasAnswerKey} />
                </Card>
              </div>
            </>
          )}

          {activeTab === 'performance' && (
            <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
              <Card title="Performance analysis">
                <div className="space-y-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm text-slate-600">Total score</span>
                    <strong className="text-2xl text-slate-900">{results.hasAnswerKey ? `${results.totalScore} / ${results.maxPossibleScore}` : 'Not scored'}</strong>
                  </div>
                  <StatBar label="Correct" value={results.totalCorrect} total={results.scoredQuestions} tone="green" displayValue={results.hasAnswerKey ? String(results.totalCorrect) : '—'} />
                  <StatBar label="Wrong" value={results.totalIncorrect} total={results.scoredQuestions} tone="red" displayValue={results.hasAnswerKey ? String(results.totalIncorrect) : '—'} />
                  <StatBar label="Not attempted" value={results.totalUnattempted} total={config.totalQuestions} tone="gray" />
                  <StatBar label="Not visited" value={notVisitedCount} total={config.totalQuestions} tone="indigo" />
                  {!results.hasAnswerKey && <p className="text-xs text-slate-500">Correct and wrong counts are unavailable until a usable answer key is provided.</p>}
                </div>
              </Card>
              <Card title="Subject-wise score and progress">
                <SubjectBreakdown sections={results.sectionStats} hasKey={results.hasAnswerKey} />
              </Card>
            </div>
          )}

          {activeTab === 'time' && (
            <Card title="Time analysis">
              {timeIsAvailable ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <Metric label="Time spent" value={formatTime(timeSpentSeconds)} detail="Calculated from the exam timer" icon={<Clock3 className="h-5 w-5" />} />
                  <Metric label="Questions attempted" value={`${results.totalAttempted} / ${config.totalQuestions}`} detail="Based on saved answer state" icon={<BookOpen className="h-5 w-5" />} />
                  <Metric label="Accuracy" value={results.hasAnswerKey ? `${results.accuracy}%` : 'Unavailable'} detail={results.hasAnswerKey ? 'Among keyed attempted questions' : 'Requires a checked answer key'} icon={<BarChart3 className="h-5 w-5" />} />
                  <Metric label="Time by subject" value="Unavailable" detail="Per-question timing is not recorded" icon={<Clock3 className="h-5 w-5" />} />
                </div>
              ) : (
                <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">Reliable timer data is unavailable for this attempt. No time-based insights are shown.</p>
              )}
              <p className="mt-4 text-sm text-slate-500">The application records overall timer duration only. It does not record time spent on individual questions or subjects.</p>
            </Card>
          )}

          {activeTab === 'attempt' && (
            <Card title="Attempt analysis">
              <div className="grid gap-3 sm:grid-cols-3">
                <Count label="Attempted" value={results.totalAttempted} />
                <Count label="Visited, unanswered" value={visitedUnansweredCount} />
                <Count label="Not visited" value={notVisitedCount} />
              </div>
              <p className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-600">
                These counts reflect saved response and visit status only. The app does not record per-question timing or behavioral attempt categories, so no ideal-time or attempt-type insights are inferred.
              </p>
            </Card>
          )}

          {activeTab === 'difficulty' && (
            <Card title="Difficulty analysis">
              {questionsWithDifficulty > 0 ? (
                <>
                  <p className="mb-4 text-sm text-slate-500">Breakdown uses difficulty metadata supplied with the imported questions.</p>
                  <div className="grid gap-3 md:grid-cols-3">
                    {difficultyGroups.filter((group) => group.total > 0).map((group) => (
                      <article key={group.difficulty} className="rounded-xl border border-slate-200 bg-white p-4">
                        <h3 className="font-semibold capitalize text-slate-900">{group.difficulty}</h3>
                        <p className="mt-1 text-sm text-slate-500">{group.total} questions</p>
                        <dl className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
                          <DataValue label="Correct" value={group.keyed ? String(group.correct) : '—'} />
                          <DataValue label="Incorrect" value={group.keyed ? String(group.incorrect) : '—'} />
                          <DataValue label="Unattempted" value={group.unattempted} />
                          <DataValue label="Not visited" value={group.notVisited} />
                        </dl>
                      </article>
                    ))}
                  </div>
                  {!results.hasAnswerKey && <p className="mt-4 text-sm text-slate-500">Correct and incorrect counts require a usable answer key.</p>}
                </>
              ) : (
                <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Difficulty metadata is unavailable for this test. No difficulty performance is inferred.</p>
              )}
            </Card>
          )}

          {activeTab === 'review' && (
            <Card title="Question review">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-500">Review the original question ID, submitted answer, key, and explanation where available.</p>
                <div className="flex flex-wrap gap-2">
                  <label className="sr-only" htmlFor="review-language">Review language</label>
                  <select id="review-language" value={reviewLanguage} onChange={(event) => setReviewLanguage(event.target.value as QuestionLanguage)} className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
                    <option value="en">English</option><option value="hi">हिन्दी</option>
                  </select>
                  <label className="sr-only" htmlFor="review-filter">Filter questions</label>
                  <select id="review-filter" value={reviewFilter} onChange={(event) => setReviewFilter(event.target.value as ReviewFilter)} className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
                    <option value="all">All questions</option><option value="correct">Correct</option><option value="incorrect">Incorrect</option><option value="unattempted">Visited, unanswered</option><option value="not-visited">Not visited</option>
                  </select>
                </div>
              </div>
              <div className="space-y-3">
                {filteredQuestions.map((result) => {
                  const question = examQuestions[result.questionNumber - 1];
                  const languageView = question ? getQuestionLanguageView(question, reviewLanguage) : null;
                  return (
                    <article key={question?.id || result.questionNumber} className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                            Question {result.questionNumber}{question ? ` · ID ${question.id}` : ''}
                          </p>
                          {question?.subject && <p className="mt-1 text-xs text-slate-500">{question.subject}{question.topic ? ` · ${question.topic}` : ''}</p>}
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${result.isCorrect === true ? 'bg-emerald-50 text-emerald-800' : result.isCorrect === false ? 'bg-rose-50 text-rose-800' : 'bg-slate-100 text-slate-700'}`}>
                          {result.isCorrect === true ? 'Correct' : result.isCorrect === false ? 'Incorrect' : result.userAnswer ? 'Attempted · not evaluated' : result.status === 'not_visited' ? 'Not visited' : 'Unanswered'}
                        </span>
                      </div>
                      {languageView ? (
                        <>
                          <div className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                            {languageView.question ? <MathText text={languageView.question} /> : <span className="text-amber-800">Question text is unavailable in English and Hindi.</span>}
                          </div>
                          <QuestionImages images={question?.images} type="question" />
                          {languageView.questionFallback && <p className="mt-1 text-xs text-blue-700">English question shown because Hindi text is unavailable.</p>}
                          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                            {(['A', 'B', 'C', 'D'] as const).map((option) => (
                              <li key={option} className={`rounded-lg border p-3 text-sm ${result.userAnswer === option ? 'border-blue-400 bg-blue-50' : result.correctAnswer === option ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                                <strong className="mr-2 text-slate-700">{getOptionDisplayLabel(option, reviewLanguage)}.</strong>
                                {languageView.options[option] ? <MathText text={languageView.options[option]!} /> : <span className="text-amber-800">Option text is unavailable in English and Hindi.</span>}
                                <QuestionImages images={question?.images} type="option" option={option} />
                              </li>
                            ))}
                          </ul>
                          {languageView.optionsFallback && <p className="mt-2 text-xs text-blue-700">English option text is shown for missing Hindi fields.</p>}
                          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                            <p><span className="text-slate-500">Your answer: </span><strong>{result.userAnswer ? getOptionDisplayLabel(result.userAnswer, reviewLanguage) : 'Not answered'}</strong></p>
                            <p><span className="text-slate-500">Correct answer: </span><strong>{result.correctAnswer ? getOptionDisplayLabel(result.correctAnswer, reviewLanguage) : 'No answer key supplied'}</strong></p>
                          </div>
                          {languageView.explanation && <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700"><MathText text={languageView.explanation} /></div>}
                          <QuestionImages images={question?.images} type="explanation" />
                        </>
                      ) : (
                        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                          <p><span className="text-slate-500">Your answer: </span><strong>{result.userAnswer || 'Not answered'}</strong></p>
                          <p><span className="text-slate-500">Correct answer: </span><strong>{result.correctAnswer || 'No answer key supplied'}</strong></p>
                          <p className="w-full text-slate-500">Question text and explanation are unavailable for this test.</p>
                        </div>
                      )}
                    </article>
                  );
                })}
                {filteredQuestions.length === 0 && <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No questions match this filter.</p>}
              </div>
            </Card>
          )}
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4 text-xs text-slate-500">
          <span>Answer-key status: <strong className="font-semibold text-slate-700">{effectiveAnswerKeyStatus.replaceAll('-', ' ')}</strong></span>
          <span>Scoring: +4 correct · −1 incorrect · 0 unanswered</span>
          <span>bunny study is an independent practice simulator.</span>
        </footer>
      </div>
    </main>
  );
};

function Metric({ label, value, detail, icon, tone = 'indigo' }: {
  label: string;
  value: string | number;
  detail: string;
  icon: React.ReactNode;
  tone?: 'indigo' | 'green' | 'red';
}) {
  const iconColor = tone === 'green' ? 'text-emerald-700 bg-emerald-50' : tone === 'red' ? 'text-rose-700 bg-rose-50' : 'text-blue-700 bg-blue-50';
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{value}</p>
        </div>
        <span className={`rounded-xl p-2 ${iconColor}`} aria-hidden="true">{icon}</span>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
    </article>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="mb-4 text-base font-bold text-slate-900">{title}</h2>
      {children}
    </article>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function DataValue({ label, value }: { label: string; value: string | number }) {
  return <><dt className="text-slate-500">{label}</dt><dd className="text-right font-semibold text-slate-800">{value}</dd></>;
}

function ProgressBar({ value, label }: { value: number; label: string }) {
  const percentage = Math.max(0, Math.min(100, value));
  return (
    <div className="mt-4">
      <div className="mb-1 flex justify-between text-xs text-slate-500"><span>{label}</span><span>{Math.round(percentage)}%</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={label} aria-valuenow={Math.round(percentage)} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-blue-700 transition-[width]" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

function StatBar({ label, value, total, tone, displayValue }: {
  label: string;
  value: number;
  total: number;
  tone: 'green' | 'red' | 'gray' | 'indigo';
  displayValue?: string;
}) {
  const percentage = total ? (value / total) * 100 : 0;
  const barColor = tone === 'green' ? 'bg-emerald-600' : tone === 'red' ? 'bg-rose-600' : tone === 'gray' ? 'bg-slate-500' : 'bg-blue-700';
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm"><span className="text-slate-600">{label}</span><strong className="text-slate-800">{displayValue ?? value}</strong></div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.max(0, Math.min(100, percentage))}%` }} /></div>
    </div>
  );
}

function SubjectBreakdown({ sections, hasKey }: {
  sections: ReturnType<typeof calculateExamResults>['sectionStats'];
  hasKey: boolean;
}) {
  const items = Object.entries(sections);
  if (!items.length) return <p className="text-sm text-slate-500">Subject data is unavailable.</p>;
  return (
    <div className="space-y-4">
      {items.map(([name, section]) => (
        <div key={name}>
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
            <strong className="text-sm text-slate-800">{name}</strong>
            <span className="text-xs text-slate-500">{hasKey ? `${section.score} / ${section.maxScore} marks` : `${section.attempted} / ${section.total} attempted`}</span>
          </div>
          {hasKey && <ProgressBar value={section.total ? (section.correct / section.total) * 100 : 0} label={`${name} correct`} />}
          {!hasKey && <ProgressBar value={section.total ? (section.attempted / section.total) * 100 : 0} label={`${name} attempted`} />}
        </div>
      ))}
    </div>
  );
}

function formatTime(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const remainingSeconds = wholeSeconds % 60;
  if (hours) return `${hours}h ${minutes}m ${remainingSeconds}s`;
  return `${minutes}m ${remainingSeconds}s`;
}
