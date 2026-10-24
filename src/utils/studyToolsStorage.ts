import { ExamQuestion, OptionLetter } from '../types/exam';
import { getActiveAccountOwnerId, getAccountLocalStorageKey } from './accountStorage';

const BOOKMARKS_KEY = 'oinkie_prep_bookmarks_v1';
const NOTES_KEY = 'oinkie_prep_notes_v1';
const FLASHCARDS_KEY = 'oinkie_prep_flashcards_v1';
const SYLLABUS_PROGRESS_KEY = 'oinkie_prep_syllabus_progress_v1';

export interface SavedBookmark {
  id: string;
  savedAt: number;
  question: ExamQuestion;
}

export interface StudyNote {
  id: string;
  title: string;
  body: string;
  updatedAt: number;
}

export interface StudyFlashcard {
  id: string;
  front: string;
  back: string;
  createdAt: number;
}

export interface StoredListResult<T> {
  items: T[];
  error: string | null;
}

function isOptionLetter(value: unknown): value is OptionLetter {
  return value === 'A' || value === 'B' || value === 'C' || value === 'D';
}

function isExamQuestion(value: unknown): value is ExamQuestion {
  if (!value || typeof value !== 'object') return false;
  const question = value as Record<string, unknown>;
  const options = question.options;
  if (!options || typeof options !== 'object') return false;
  const optionValues = options as Record<string, unknown>;
  return typeof question.id === 'string' &&
    Number.isSafeInteger(question.originalQuestionNumber) &&
    typeof question.subject === 'string' &&
    typeof question.topic === 'string' &&
    typeof question.section === 'string' &&
    Number.isFinite(question.sourcePage) &&
    typeof question.questionEn === 'string' &&
    (typeof question.questionHi === 'string' || question.questionHi === null) &&
    (['A', 'B', 'C', 'D'] as const).every((letter) => {
      const option = optionValues[letter];
      return !!option && typeof option === 'object' &&
        typeof (option as Record<string, unknown>).textEn === 'string' &&
        (typeof (option as Record<string, unknown>).textHi === 'string' ||
          (option as Record<string, unknown>).textHi === null);
    }) &&
    (isOptionLetter(question.answerKey) || question.answerKey === null) &&
    (typeof question.answerKeySource === 'string' || question.answerKeySource === null) &&
    typeof question.reviewRequired === 'boolean' &&
    Array.isArray(question.reviewFlags) &&
    question.reviewFlags.every((item) => typeof item === 'string') &&
    Array.isArray(question.missingContent) &&
    question.missingContent.every((item) => typeof item === 'string') &&
    Array.isArray(question.formulas) &&
    question.formulas.every((item) => typeof item === 'string');
}

function isBookmark(value: unknown): value is SavedBookmark {
  if (!value || typeof value !== 'object') return false;
  const bookmark = value as Record<string, unknown>;
  return typeof bookmark.id === 'string' &&
    Number.isFinite(bookmark.savedAt) &&
    isExamQuestion(bookmark.question);
}

function isStudyNote(value: unknown): value is StudyNote {
  if (!value || typeof value !== 'object') return false;
  const note = value as Record<string, unknown>;
  return typeof note.id === 'string' &&
    typeof note.title === 'string' &&
    typeof note.body === 'string' &&
    Number.isFinite(note.updatedAt);
}

function isStudyFlashcard(value: unknown): value is StudyFlashcard {
  if (!value || typeof value !== 'object') return false;
  const flashcard = value as Record<string, unknown>;
  return typeof flashcard.id === 'string' &&
    typeof flashcard.front === 'string' &&
    typeof flashcard.back === 'string' &&
    Number.isFinite(flashcard.createdAt);
}

function readList<T>(key: string, label: string, validate: (value: unknown) => value is T): StoredListResult<T> {
  try {
    const ownerId = getActiveAccountOwnerId();
    const storageKey = ownerId ? getAccountLocalStorageKey(ownerId, key) : key;
    const saved = localStorage.getItem(storageKey);
    if (!saved) return { items: [], error: null };
    let parsed: unknown;
    try {
      parsed = JSON.parse(saved);
    } catch (error) {
      return {
        items: [],
        error: `Saved ${label} data contains invalid JSON and was preserved: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    if (!Array.isArray(parsed) || !parsed.every(validate)) {
      return { items: [], error: `Saved ${label} data has an unsupported format and was preserved without changes.` };
    }
    return { items: parsed, error: null };
  } catch (error) {
    return {
      items: [],
      error: `Could not read saved ${label} data: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function writeList<T>(key: string, label: string, items: T[]): void {
  try {
    const ownerId = getActiveAccountOwnerId();
    const storageKey = ownerId ? getAccountLocalStorageKey(ownerId, key) : key;
    localStorage.setItem(storageKey, JSON.stringify(items));
  } catch (error) {
    throw new Error(`Could not save ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function readBookmarks(): StoredListResult<SavedBookmark> {
  return readList(BOOKMARKS_KEY, 'bookmarks', isBookmark);
}

export function saveBookmarks(items: SavedBookmark[]): void {
  writeList(BOOKMARKS_KEY, 'bookmarks', items);
}

export function readStudyNotes(): StoredListResult<StudyNote> {
  return readList(NOTES_KEY, 'study notes', isStudyNote);
}

export function saveStudyNotes(items: StudyNote[]): void {
  writeList(NOTES_KEY, 'study notes', items);
}

export function readStudyFlashcards(): StoredListResult<StudyFlashcard> {
  return readList(FLASHCARDS_KEY, 'flashcards', isStudyFlashcard);
}

export function saveStudyFlashcards(items: StudyFlashcard[]): void {
  writeList(FLASHCARDS_KEY, 'flashcards', items);
}

export function readSyllabusProgress(): StoredListResult<string> {
  return readList(SYLLABUS_PROGRESS_KEY, 'syllabus progress', (value): value is string => typeof value === 'string');
}

export function saveSyllabusProgress(items: string[]): void {
  writeList(SYLLABUS_PROGRESS_KEY, 'syllabus progress', items);
}

export function getQuestionBookmarkId(question: ExamQuestion): string {
  return `${question.subject}:${question.id}:${question.questionEn}`;
}
