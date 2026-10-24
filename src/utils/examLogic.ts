import {
  AnswerKeyStatus,
  ExamResultsSummary,
  ExamSessionState,
  OptionLetter,
  QuestionStatus,
  TestConfig,
} from '../types/exam';

const OPTIONS = new Set<OptionLetter>(['A', 'B', 'C', 'D']);
const STATUSES = new Set<QuestionStatus>([
  'not_visited',
  'not_answered',
  'answered',
  'marked_for_review',
  'answered_marked_for_review',
]);

export function getDeadlineRemainingSeconds(deadlineAtMs: number, maxSeconds: number, now = Date.now()): number {
  if (!Number.isFinite(deadlineAtMs) || !Number.isFinite(maxSeconds) || maxSeconds < 0) return 0;
  return Math.max(0, Math.min(maxSeconds, Math.ceil((deadlineAtMs - now) / 1000)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validateAndNormalizeSession(value: unknown): { session: ExamSessionState | null; error: string | null } {
  if (!isRecord(value)) return { session: null, error: 'Saved session must be an object.' };
  const config = value.config;
  const responses = value.responses;
  const configValid = isRecord(config) &&
    typeof config.id === 'string' && config.id.length > 0 &&
    typeof config.title === 'string' && config.title.length > 0 &&
    Number.isSafeInteger(config.totalQuestions) && Number(config.totalQuestions) > 0 &&
    Number.isSafeInteger(config.durationMinutes) && Number(config.durationMinutes) > 0 &&
    Array.isArray(config.sections) &&
    typeof config.hasCustomPdf === 'boolean';
  if (!configValid) return { session: null, error: 'Saved session has invalid exam configuration.' };
  const total = Number(config.totalQuestions);
  const durationSeconds = Number(config.durationMinutes) * 60;
  const sourceType = config.sourceType || (config.hasCustomPdf ? 'pdf' : 'demo');
  if (!['demo', 'pdf', 'question-bank'].includes(String(sourceType)) ||
      (sourceType === 'pdf') !== config.hasCustomPdf) {
    return { session: null, error: 'Saved content source does not match the exam configuration.' };
  }
  const sectionRangesValid = (config.sections as unknown[]).every((section) =>
    isRecord(section) &&
    typeof section.id === 'string' &&
    typeof section.name === 'string' &&
    Number.isSafeInteger(section.startQ) &&
    Number.isSafeInteger(section.endQ) &&
    Number.isSafeInteger(section.total) &&
    Number(section.startQ) >= 1 &&
    Number(section.endQ) >= Number(section.startQ) &&
    Number(section.endQ) <= total &&
    Number(section.total) === Number(section.endQ) - Number(section.startQ) + 1
  );
  if (!sectionRangesValid) return { session: null, error: 'Saved exam section ranges are invalid.' };
  if (!isRecord(responses) || !isRecord(responses.answers) || !isRecord(responses.statuses)) {
    return { session: null, error: 'Saved session is missing response or question-status data.' };
  }
  if (!Number.isSafeInteger(value.currentQuestion) || Number(value.currentQuestion) < 1 ||
      Number(value.currentQuestion) > total) {
    return { session: null, error: 'Saved current-question position is outside the exam.' };
  }
  if (!Number.isFinite(value.timeRemainingSeconds) || Number(value.timeRemainingSeconds) < 0 ||
      Number(value.timeRemainingSeconds) > durationSeconds) {
    return { session: null, error: 'Saved remaining time is outside the configured duration.' };
  }
  if (!Number.isFinite(value.startedAt) || Number(value.startedAt) <= 0 ||
      typeof value.isSubmitted !== 'boolean') {
    return { session: null, error: 'Saved session timing or submission state is invalid.' };
  }

  const answers: Record<number, OptionLetter | null> = {};
  const statuses: Record<number, QuestionStatus> = {};
  for (const [rawIndex, answer] of Object.entries(responses.answers)) {
    const index = Number(rawIndex);
    if (!Number.isSafeInteger(index) || index < 1 || index > total ||
        !(answer === null || OPTIONS.has(answer as OptionLetter))) {
      return { session: null, error: `Saved answer for question "${rawIndex}" is invalid.` };
    }
    answers[index] = answer as OptionLetter | null;
  }
  for (const [rawIndex, status] of Object.entries(responses.statuses)) {
    const index = Number(rawIndex);
    if (!Number.isSafeInteger(index) || index < 1 || index > total || !STATUSES.has(status as QuestionStatus)) {
      return { session: null, error: `Saved status for question "${rawIndex}" is invalid.` };
    }
    statuses[index] = status as QuestionStatus;
  }
  let answerKey: Record<number, OptionLetter> | null = null;
  if (value.answerKey !== null && value.answerKey !== undefined) {
    if (!isRecord(value.answerKey)) return { session: null, error: 'Saved answer key is malformed.' };
    answerKey = {};
    for (const [rawIndex, answer] of Object.entries(value.answerKey)) {
      const index = Number(rawIndex);
      if (!Number.isSafeInteger(index) || index < 1 || index > total || !OPTIONS.has(answer as OptionLetter)) {
        return { session: null, error: `Saved answer key entry "${rawIndex}" is invalid.` };
      }
      answerKey[index] = answer as OptionLetter;
    }
  }

  const normalizedConfig = { ...config, sourceType } as unknown as TestConfig;
  const deadlineAtMs = Number.isFinite(value.deadlineAtMs)
    ? Number(value.deadlineAtMs)
    : Number(value.startedAt) + durationSeconds * 1000;
  const maxDeadline = Number(value.startedAt) + durationSeconds * 1000;
  if (!Number.isFinite(deadlineAtMs) || deadlineAtMs < Number(value.startedAt) ||
      deadlineAtMs > maxDeadline + 1000) {
    return { session: null, error: 'Saved exam deadline is invalid or would extend the configured duration.' };
  }
  const answerKeyStatus = value.answerKeyStatus as AnswerKeyStatus | undefined;
  if (answerKeyStatus && ![
    'none',
    'user-provided',
    'source-cited-unverified',
    'user-verified-import',
    'custom-test-imported',
    'ai-generated-review-required',
  ].includes(answerKeyStatus)) {
    return { session: null, error: 'Saved answer-key provenance is unsupported.' };
  }
  if (normalizedConfig.sourceType === 'question-bank') {
    if (!Array.isArray(value.examQuestions) || value.examQuestions.length !== total ||
        !value.examQuestions.every((question) => isRecord(question) &&
          typeof question.id === 'string' &&
          typeof question.questionEn === 'string' &&
          isRecord(question.options))) {
      return { session: null, error: 'Saved question-bank exam is missing valid question content.' };
    }
  }

  return {
    session: {
      config: normalizedConfig,
      timeRemainingSeconds: getDeadlineRemainingSeconds(deadlineAtMs, durationSeconds),
      currentQuestion: Number(value.currentQuestion),
      responses: { answers, statuses },
      isSubmitted: value.isSubmitted,
      startedAt: Number(value.startedAt),
      submittedAt: Number.isFinite(value.submittedAt) ? Number(value.submittedAt) : undefined,
      answerKey,
      deadlineAtMs,
      examQuestions: Array.isArray(value.examQuestions) ? value.examQuestions as ExamSessionState['examQuestions'] : undefined,
      answerKeyStatus: answerKeyStatus || (answerKey ? 'user-provided' : 'none'),
    },
    error: null,
  };
}

export function calculateExamResults(
  config: TestConfig,
  userAnswers: Record<number, OptionLetter | null>,
  statuses: Record<number, QuestionStatus>,
  answerKey: Record<number, OptionLetter> | null,
  answerKeyStatus: AnswerKeyStatus
): ExamResultsSummary {
  const questionResults: ExamResultsSummary['questionResults'] = [];
  const sectionStats: ExamResultsSummary['sectionStats'] = {};
  for (const section of config.sections) {
    sectionStats[section.name] = {
      total: 0,
      attempted: 0,
      correct: 0,
      incorrect: 0,
      unattempted: 0,
      score: 0,
      maxScore: 0,
    };
  }

  let totalAttempted = 0;
  let totalCorrect = 0;
  let totalIncorrect = 0;
  let totalUnattempted = 0;
  let totalMarkedForReview = 0;
  let totalScore = 0;
  let scoredQuestions = 0;
  const canScore = answerKeyStatus === 'user-provided' ||
    answerKeyStatus === 'user-verified-import' ||
    (config.sourceType === 'question-bank' && answerKeyStatus === 'custom-test-imported');
  for (let index = 1; index <= config.totalQuestions; index++) {
    const userAnswer = userAnswers[index] || null;
    const status = statuses[index] || 'not_visited';
    const sectionName = config.sections.find((section) =>
      index >= section.startQ && index <= section.endQ
    )?.name || 'General';
    if (!sectionStats[sectionName]) {
      sectionStats[sectionName] = {
        total: 0, attempted: 0, correct: 0, incorrect: 0, unattempted: 0, score: 0, maxScore: 0,
      };
    }
    sectionStats[sectionName].total++;
    const isMarked = status === 'marked_for_review' || status === 'answered_marked_for_review';
    if (isMarked) totalMarkedForReview++;
    if (userAnswer) {
      totalAttempted++;
      sectionStats[sectionName].attempted++;
    } else {
      totalUnattempted++;
      sectionStats[sectionName].unattempted++;
    }

    const correctAnswer = canScore ? answerKey?.[index] || null : null;
    let isCorrect: boolean | null = null;
    let marks: number | null = null;
    if (correctAnswer) {
      scoredQuestions++;
      sectionStats[sectionName].maxScore += 4;
      if (!userAnswer) {
        marks = 0;
      } else if (userAnswer === correctAnswer) {
        isCorrect = true;
        marks = 4;
        totalCorrect++;
        totalScore += 4;
        sectionStats[sectionName].correct++;
        sectionStats[sectionName].score += 4;
      } else {
        isCorrect = false;
        marks = -1;
        totalIncorrect++;
        totalScore -= 1;
        sectionStats[sectionName].incorrect++;
        sectionStats[sectionName].score -= 1;
      }
    }
    questionResults.push({
      questionNumber: index,
      section: sectionName,
      userAnswer,
      correctAnswer,
      status,
      isCorrect,
      marks,
    });
  }

  const totalScoredAttempted = questionResults.filter((result) => result.correctAnswer && result.userAnswer).length;
  const maxPossibleScore = scoredQuestions * 4;
  return {
    totalQuestions: config.totalQuestions,
    totalAttempted,
    totalUnattempted,
    totalMarkedForReview,
    totalCorrect,
    totalIncorrect,
    totalScore,
    maxPossibleScore,
    percentage: maxPossibleScore ? Math.round((Math.max(0, totalScore) / maxPossibleScore) * 100) : 0,
    accuracy: totalScoredAttempted ? Math.round((totalCorrect / totalScoredAttempted) * 100) : 0,
    hasAnswerKey: canScore && scoredQuestions > 0,
    answerKeyStatus,
    scoredQuestions,
    questionResults,
    sectionStats,
  };
}
