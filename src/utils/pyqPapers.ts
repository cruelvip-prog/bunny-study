import type { StoredQuestionBank } from './questionBankStorage';
import type { ExamQuestion } from '../types/exam';

export interface PyqPaper {
  bankId: string;
  title: string;
  year: number;
  session: string | null;
  subjects: string[];
  questions: ExamQuestion[];
  durationMinutes: number | null;
  marks: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readPositiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

export function getPrebuiltPyqPapers(banks: StoredQuestionBank[]): PyqPaper[] {
  return banks.flatMap((storedBank) => {
    const metadata = storedBank.bank.sourceMetadata?.pyqPaper;
    if (!isRecord(metadata) || metadata.type !== 'neet-pyq') return [];

    const year = readPositiveInteger(metadata.year);
    const title = typeof metadata.title === 'string' ? metadata.title.trim() : '';
    if (!year || year < 1900 || year > 9999 || !title || !storedBank.bank.questions.length) return [];

    const questions = storedBank.bank.questions.map((question) => ({ ...question }));
    const subjects = [...new Set(questions.map((question) => question.subject.trim()).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right));

    return [{
      bankId: storedBank.id,
      title,
      year,
      session: typeof metadata.session === 'string' && metadata.session.trim()
        ? metadata.session.trim()
        : null,
      subjects,
      questions,
      durationMinutes: readPositiveInteger(metadata.durationMinutes),
      marks: readPositiveInteger(metadata.marks),
    }];
  }).sort((left, right) =>
    right.year - left.year ||
    left.title.localeCompare(right.title) ||
    left.bankId.localeCompare(right.bankId)
  );
}
