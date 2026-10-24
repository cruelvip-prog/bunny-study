import { ExamQuestion, OptionLetter } from '../types/exam';

export type BuilderClassLevel = '11' | '12';

export interface BuilderQuestionMetadata {
  classLevel: BuilderClassLevel | null;
  chapter: string;
  topic: string | null;
}

export interface CustomTestFilters {
  subjects: string[];
  classLevel: BuilderClassLevel | 'All';
  selectedTopicKeys: string[] | null;
  deduplicateById?: boolean;
}

export interface BuilderSelectionState {
  checked: boolean;
  indeterminate: boolean;
}

export interface CustomTestConfiguration {
  selectedQuestionCount: number;
  questionCount: number;
  availableQuestionCount: number;
  durationMinutes: number;
}

export function getCustomTestImportedAnswerKey(
  questions: ExamQuestion[],
): Record<number, OptionLetter> {
  const answerKey: Record<number, OptionLetter> = {};
  questions.forEach((question, index) => {
    if (question.answerKey) answerKey[index + 1] = question.answerKey;
  });
  return answerKey;
}

export function getCustomTestConfigurationError(
  configuration: CustomTestConfiguration,
): string | null {
  if (configuration.selectedQuestionCount === 0) {
    return 'Select at least one subject, chapter, or topic before reviewing your test.';
  }
  if (!Number.isSafeInteger(configuration.questionCount) || configuration.questionCount < 1) {
    return 'Enter a whole-number question count greater than zero.';
  }
  if (configuration.questionCount > configuration.availableQuestionCount) {
    return `Only ${configuration.availableQuestionCount} eligible question(s) are available; ${configuration.questionCount} requested. Select more content or reduce the question count.`;
  }
  if (!Number.isSafeInteger(configuration.durationMinutes) ||
      configuration.durationMinutes < 1 || configuration.durationMinutes > 400) {
    return 'Enter a whole-number duration from 1 to 400 minutes.';
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function metadataText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readClassLevel(value: unknown): BuilderClassLevel | null {
  if (typeof value === 'number') {
    return value === 11 || value === 12 ? String(value) as BuilderClassLevel : null;
  }
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(?:class\s*)?(11|12)(?:th)?$/i);
  return match ? match[1] as BuilderClassLevel : null;
}

export function getBuilderQuestionMetadata(question: ExamQuestion): BuilderQuestionMetadata {
  const raw = isRecord(question.schemaV2) ? question.schemaV2 : {};
  const rawClass = raw.class ?? raw.classLevel;
  return {
    classLevel: readClassLevel(rawClass),
    chapter: metadataText(raw.chapter) || metadataText(question.topic) || 'Uncategorized',
    topic: metadataText(question.topicName) || metadataText(raw.topic),
  };
}

export function getBuilderTopicKey(
  question: ExamQuestion,
  metadata = getBuilderQuestionMetadata(question),
): string {
  return JSON.stringify([question.subject.trim(), metadata.classLevel, metadata.chapter, metadata.topic]);
}

export function getBuilderChapterSelectionKeys(
  questions: ExamQuestion[],
  subject: string,
  chapter: string,
  classLevel: BuilderClassLevel | 'All' = 'All',
): string[] {
  return [...new Set(getUniqueBuilderQuestions(questions)
    .filter((question) => {
      const metadata = getBuilderQuestionMetadata(question);
      return question.subject.trim().toLocaleLowerCase() === subject.trim().toLocaleLowerCase() &&
        metadata.chapter === chapter &&
        (classLevel === 'All' || metadata.classLevel === classLevel);
    })
    .map((question) => getBuilderTopicKey(question)))];
}

export function getBuilderSelectionState(
  keys: string[],
  selectedKeys: string[],
): BuilderSelectionState {
  const selected = new Set(selectedKeys);
  const selectedCount = keys.filter((key) => selected.has(key)).length;
  return {
    checked: keys.length > 0 && selectedCount === keys.length,
    indeterminate: selectedCount > 0 && selectedCount < keys.length,
  };
}

export function toggleBuilderSelection(
  selectedKeys: string[],
  keys: string[],
): string[] {
  const selected = new Set(selectedKeys);
  const shouldDeselect = keys.length > 0 && keys.every((key) => selected.has(key));
  keys.forEach((key) => {
    if (shouldDeselect) selected.delete(key);
    else selected.add(key);
  });
  return [...selected];
}

export function getUniqueBuilderQuestions(
  questions: ExamQuestion[],
  identity: 'content' | 'id' = 'content',
): ExamQuestion[] {
  const seen = new Set<string>();
  return questions.filter((question) => {
    if (identity === 'id') {
      if (seen.has(question.id)) return false;
      seen.add(question.id);
      return true;
    }
    const contentKey = JSON.stringify([
      question.subject.trim().toLocaleLowerCase(),
      question.questionEn.trim().replace(/\s+/g, ' ').toLocaleLowerCase(),
      question.questionHi?.trim().replace(/\s+/g, ' ').toLocaleLowerCase() || '',
      ...(['A', 'B', 'C', 'D'] as const).flatMap((letter) => [
        question.options[letter].textEn.trim().replace(/\s+/g, ' ').toLocaleLowerCase(),
        question.options[letter].textHi?.trim().replace(/\s+/g, ' ').toLocaleLowerCase() || '',
      ]),
    ]);
    if (seen.has(contentKey)) return false;
    seen.add(contentKey);
    return true;
  });
}

export function filterCustomTestQuestions(
  questions: ExamQuestion[],
  filters: CustomTestFilters,
): ExamQuestion[] {
  const selectedSubjects = new Set(filters.subjects.map((subject) => subject.toLocaleLowerCase()));
  const selectedTopics = filters.selectedTopicKeys === null
    ? null
    : new Set(filters.selectedTopicKeys);

  return getUniqueBuilderQuestions(questions, filters.deduplicateById ? 'id' : 'content').filter((question) => {
    const metadata = getBuilderQuestionMetadata(question);
    if (!selectedSubjects.has(question.subject.trim().toLocaleLowerCase())) return false;
    if (filters.classLevel !== 'All' && metadata.classLevel !== filters.classLevel) return false;
    return selectedTopics === null || selectedTopics.has(getBuilderTopicKey(question, metadata));
  });
}

export function createCustomTestQuestions(
  questions: ExamQuestion[],
  filters: CustomTestFilters,
  count: number,
  random: () => number = Math.random,
): ExamQuestion[] {
  return sampleCustomTestQuestions(
    filterCustomTestQuestions(questions, filters),
    count,
    random,
    filters.deduplicateById ? 'id' : 'content',
  );
}

export function sampleCustomTestQuestions(
  eligibleQuestions: ExamQuestion[],
  count: number,
  random: () => number = Math.random,
  identity: 'content' | 'id' = 'content',
): ExamQuestion[] {
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new Error('Question count must be a positive integer.');
  }
  const pool = [...getUniqueBuilderQuestions(eligibleQuestions, identity)];
  if (pool.length < count) {
    throw new Error(`Only ${pool.length} unique eligible question(s) are available; ${count} requested.`);
  }

  for (let index = pool.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1));
    [pool[index], pool[target]] = [pool[target], pool[index]];
  }
  return pool.slice(0, count);
}
