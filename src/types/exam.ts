export type OptionLetter = 'A' | 'B' | 'C' | 'D';
export type ExamSourceType = 'demo' | 'pdf' | 'question-bank';
export type AnswerKeyStatus =
  | 'none'
  | 'user-provided'
  | 'source-cited-unverified'
  | 'user-verified-import'
  | 'custom-test-imported'
  | 'ai-generated-review-required';

export type ExamImageType = 'question' | 'option' | 'explanation';

export interface ExamImage {
  id: string;
  type: ExamImageType;
  mimeType: string;
  dataUri?: string;
  src?: string;
  alt: string;
  caption: string | null;
  option?: OptionLetter;
}

export interface ExamQuestion {
  id: string;
  originalQuestionNumber: number;
  subject: string;
  topic: string;
  topicName?: string;
  section: string;
  sourcePage: number;
  questionEn: string;
  questionHi: string | null;
  options: Record<OptionLetter, { textEn: string; textHi: string | null }>;
  answerKey: OptionLetter | null;
  answerKeySource: string | null;
  reviewRequired: boolean;
  reviewFlags: string[];
  missingContent: string[];
  formulas: string[];
  explanationEn?: string | null;
  explanationHi?: string | null;
  images?: ExamImage[];
  schemaV2?: Record<string, unknown>;
}

export type QuestionStatus =
  | 'not_visited'
  | 'not_answered'
  | 'answered'
  | 'marked_for_review'
  | 'answered_marked_for_review';

export interface ExamSection {
  id: string;
  name: string;
  startQ: number;
  endQ: number;
  total: number;
}

export interface TestConfig {
  id: string;
  title: string;
  totalQuestions: number;
  durationMinutes: number;
  candidateName: string;
  rollNumber: string;
  sections: ExamSection[];
  pdfFileName?: string | null;
  hasCustomPdf: boolean;
  preset: '45' | '90' | '180' | '200' | 'custom';
  sourceType?: ExamSourceType;
  isCustomTest?: boolean;
}

export interface UserResponses {
  answers: Record<number, OptionLetter | null>;
  statuses: Record<number, QuestionStatus>;
}

export interface ExamSessionState {
  config: TestConfig;
  timeRemainingSeconds: number;
  currentQuestion: number;
  responses: UserResponses;
  isSubmitted: boolean;
  startedAt: number;
  submittedAt?: number;
  answerKey: Record<number, OptionLetter> | null;
  deadlineAtMs?: number;
  examQuestions?: ExamQuestion[];
  answerKeyStatus?: AnswerKeyStatus;
}

export interface QuestionResult {
  questionNumber: number;
  section: string;
  userAnswer: OptionLetter | null;
  correctAnswer: OptionLetter | null;
  status: QuestionStatus;
  isCorrect: boolean | null;
  marks: number | null; // +4, -1, 0, or null if answer key not given
}

export interface ExamResultsSummary {
  totalQuestions: number;
  totalAttempted: number;
  totalUnattempted: number;
  totalMarkedForReview: number;
  totalCorrect: number;
  totalIncorrect: number;
  totalScore: number;
  maxPossibleScore: number;
  percentage: number;
  accuracy: number;
  hasAnswerKey: boolean;
  answerKeyStatus: AnswerKeyStatus;
  scoredQuestions: number;
  questionResults: QuestionResult[];
  sectionStats: Record<
    string,
    {
      total: number;
      attempted: number;
      correct: number;
      incorrect: number;
      unattempted: number;
      score: number;
      maxScore: number;
    }
  >;
}
