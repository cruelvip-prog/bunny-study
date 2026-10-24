import { ExamQuestion, OptionLetter } from '../types/exam';

export type QuestionLanguage = 'en' | 'hi';

export interface QuestionLanguageView {
  questionId: string;
  language: QuestionLanguage;
  available: boolean;
  question: string | null;
  questionFallback: boolean;
  questionUnavailableInBothLanguages: boolean;
  options: Record<OptionLetter, string | null>;
  optionsUnavailableInBothLanguages: Record<OptionLetter, boolean>;
  optionsFallback: boolean;
  explanation: string | null;
  explanationFallback: boolean;
  solution: string | null;
  solutionFallback: boolean;
  explanationUnavailable: boolean;
  solutionUnavailable: boolean;
}

const OPTION_LETTERS: OptionLetter[] = ['A', 'B', 'C', 'D'];
const HINDI_OPTION_LABELS: Record<OptionLetter, string> = {
  A: '१',
  B: '२',
  C: '३',
  D: '४',
};

export function getOptionDisplayLabel(letter: OptionLetter, language: QuestionLanguage): string {
  return language === 'hi' ? HINDI_OPTION_LABELS[letter] : letter;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function getQuestionLanguageView(
  question: ExamQuestion,
  language: QuestionLanguage,
): QuestionLanguageView {
  const rawLanguage = question.schemaV2?.languages;
  const getLanguageContent = (code: QuestionLanguage): Record<string, unknown> | null => {
    if (!isRecord(rawLanguage)) return null;
    const value = rawLanguage[code];
    return isRecord(value) ? value : null;
  };
  const content = getLanguageContent(language);
  const hasText = (value: unknown): value is string =>
    typeof value === 'string' && value.trim().length > 0;
  const englishContent = getLanguageContent('en');
  const hindiContent = getLanguageContent('hi');
  const englishQuestionSource = englishContent?.question ?? question.questionEn;
  const hindiQuestionSource = hindiContent?.question ?? question.questionHi;
  const selectedQuestionSource = language === 'en' ? englishQuestionSource : hindiQuestionSource;
  const fallbackQuestionSource = language === 'hi' ? englishQuestionSource : null;
  const selectedQuestion = hasText(selectedQuestionSource) ? selectedQuestionSource : null;
  const fallbackQuestion = hasText(fallbackQuestionSource) ? fallbackQuestionSource : null;
  const displayQuestion = selectedQuestion || fallbackQuestion;
  const questionFallback = selectedQuestion === null && fallbackQuestion !== null;
  let optionsFallback = false;
  const optionsUnavailableInBothLanguages = {} as Record<OptionLetter, boolean>;
  const options = Object.fromEntries(OPTION_LETTERS.map((letter) => {
    const englishOption = question.options[letter].textEn;
    const hindiOption = question.options[letter].textHi;
    const selectedOption = language === 'en' ? englishOption : hindiOption;
    const fallbackOption = language === 'hi' ? englishOption : null;
    const localizedOption = hasText(selectedOption) ? selectedOption : null;
    const englishFallback = hasText(fallbackOption) ? fallbackOption : null;
    if (!localizedOption && englishFallback) optionsFallback = true;
    optionsUnavailableInBothLanguages[letter] = !hasText(englishOption) && !hasText(hindiOption);
    return [letter, localizedOption || englishFallback];
  })) as Record<OptionLetter, string | null>;
  const allOptionsMissing = OPTION_LETTERS.every((letter) => options[letter] === null);
  const selectedExplanation = hasText(content?.explanation) ? content?.explanation as string : null;
  const legacyExplanation = language === 'en' ? question.explanationEn : question.explanationHi;
  const selectedLegacyExplanation = hasText(legacyExplanation) ? legacyExplanation : null;
  const englishExplanation = language === 'hi'
    ? hasText(englishContent?.explanation) ? englishContent?.explanation as string
      : hasText(question.explanationEn) ? question.explanationEn
        : null
    : null;
  const explanation = selectedExplanation || selectedLegacyExplanation || englishExplanation;
  const explanationFallback = selectedExplanation === null && englishExplanation !== null;
  const selectedSolution = hasText(content?.solution) ? content?.solution as string : null;
  const englishSolution = language === 'hi' && hasText(englishContent?.solution)
    ? englishContent?.solution as string
    : null;
  const solution = selectedSolution || englishSolution;
  const solutionFallback = selectedSolution === null && englishSolution !== null;

  return {
    questionId: question.id,
    language,
    available: displayQuestion !== null || !allOptionsMissing,
    question: displayQuestion,
    questionFallback,
    questionUnavailableInBothLanguages: !hasText(englishQuestionSource) && !hasText(hindiQuestionSource),
    options,
    optionsUnavailableInBothLanguages,
    optionsFallback,
    explanation,
    explanationFallback: explanationFallback || (
      language === 'hi' && selectedLegacyExplanation === null && hasText(question.explanationEn)
    ),
    solution,
    solutionFallback,
    explanationUnavailable: false,
    solutionUnavailable: false,
  };
}
