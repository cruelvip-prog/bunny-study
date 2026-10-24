import { OptionLetter } from '../types/exam';

export interface ParseResult {
  keyMap: Record<number, OptionLetter>;
  totalFound: number;
  unrecognizedCount: number;
  errors: string[];
}

export function parseAnswerKeyInput(text: string, totalQuestions: number): ParseResult {
  const trimmed = text.trim();
  const keyMap: Record<number, OptionLetter> = {};
  const errors: string[] = [];

  if (!trimmed) {
    return { keyMap, totalFound: 0, unrecognizedCount: 0, errors: ['Input is empty'] };
  }

  // 1. Try JSON
  if (trimmed.startsWith('{') || trimmed.endsWith('}')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (error) {
      return {
        keyMap,
        totalFound: 0,
        unrecognizedCount: 1,
        errors: [`Invalid answer-key JSON: ${error instanceof Error ? error.message : String(error)}`],
      };
    }
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
      return { keyMap, totalFound: 0, unrecognizedCount: 1, errors: ['Answer-key JSON must be an object of question numbers and options.'] };
    }
    for (const [rawQuestion, rawOption] of Object.entries(parsed)) {
      const question = Number(rawQuestion);
      const option = typeof rawOption === 'string' || typeof rawOption === 'number'
        ? normalizeOption(String(rawOption))
        : null;
      if (!/^[1-9]\d*$/.test(rawQuestion) || !Number.isSafeInteger(question) || question > totalQuestions) {
        errors.push(`Answer-key question number "${rawQuestion}" is outside 1-${totalQuestions}.`);
      } else if (!option) {
        errors.push(`Answer-key value for question ${rawQuestion} must be A, B, C, D, or 1, 2, 3, 4.`);
      } else {
        keyMap[question] = option;
      }
    }
    if (errors.length) {
      return { keyMap: {}, totalFound: 0, unrecognizedCount: errors.length, errors };
    }
    if (!Object.keys(keyMap).length) {
      return { keyMap, totalFound: 0, unrecognizedCount: 1, errors: ['Answer-key JSON contains no question answers.'] };
    }
    return {
      keyMap,
      totalFound: Object.keys(keyMap).length,
      unrecognizedCount: 0,
      errors: [],
    };
  }

  // 2. Explicitly numbered answers allow sparse and partial keys.
  const numberedPattern = /(?:Q\s*)?(\d{1,4})\s*[:\.\-=\t,]\s*([A-Za-z0-9]+)/g;
  let match: RegExpExecArray | null;
  let foundWithNumbers = 0;
  let invalidNumberedAnswer = false;

  while ((match = numberedPattern.exec(trimmed)) !== null) {
    const qNum = parseInt(match[1], 10);
    const letter = normalizeOption(match[2]);
    if (qNum < 1 || qNum > totalQuestions) {
      errors.push(`Answer-key question number "${match[1]}" is outside 1-${totalQuestions}.`);
      invalidNumberedAnswer = true;
    } else if (keyMap[qNum] && keyMap[qNum] !== letter) {
      errors.push(`Answer key contains conflicting answers for question ${qNum}.`);
      invalidNumberedAnswer = true;
    } else if (!letter) {
      errors.push(`Answer-key value for question ${qNum} must be A, B, C, D, or 1, 2, 3, 4.`);
      invalidNumberedAnswer = true;
    } else if (letter) {
      keyMap[qNum] = letter;
      foundWithNumbers++;
    }
  }

  if (invalidNumberedAnswer) {
    return { keyMap: {}, totalFound: 0, unrecognizedCount: errors.length, errors };
  }
  // 3. Line-by-line format: e.g.
  // 1 A
  // 2 B
  // Whitespace-separated rows are handled here; comma-separated rows are
  // already covered by the numbered-answer parser above.
  const lines = trimmed.split(/[\r\n]+/);
  let lineMatches = 0;
  for (const line of lines) {
    const row = line.trim().match(/^(?:Q\s*)?(\d+)\s+([A-Za-z0-9]+)$/);
    if (!row) continue;
    const qNum = Number(row[1]);
    const letter = normalizeOption(row[2]);
    if (qNum < 1 || qNum > totalQuestions) {
      errors.push(`Answer-key question number "${row[1]}" is outside 1-${totalQuestions}.`);
    } else if (!letter) {
      errors.push(`Answer-key value for question ${qNum} must be A, B, C, D, or 1, 2, 3, 4.`);
    } else if (keyMap[qNum] && keyMap[qNum] !== letter) {
      errors.push(`Answer key contains conflicting answers for question ${qNum}.`);
    } else {
      keyMap[qNum] = letter;
      lineMatches++;
    }
  }

  if (errors.length) {
    return { keyMap: {}, totalFound: 0, unrecognizedCount: errors.length, errors };
  }

  if (lineMatches > 0 || foundWithNumbers > 0) {
    return {
      keyMap,
      totalFound: Object.keys(keyMap).length,
      unrecognizedCount: 0,
      errors: [],
    };
  }

  // 4. Sequential string of letters: e.g. "ABCDABCD..." or "12341234..."
  // Remove spaces, punctuation
  if (/^[\s,;|A-Da-d1-4]+$/.test(trimmed)) {
    const cleanSequence = trimmed.replace(/[\s,;|]/g, '');
    if (cleanSequence.length > totalQuestions) {
      return {
        keyMap,
        totalFound: 0,
        unrecognizedCount: cleanSequence.length - totalQuestions,
        errors: [`Answer-key sequence has ${cleanSequence.length} answers, but the exam has only ${totalQuestions} questions.`],
      };
    }
    let count = 0;
    for (let i = 0; i < cleanSequence.length && i < totalQuestions; i++) {
      const char = cleanSequence[i];
      const opt = normalizeOption(char);
      if (opt) {
        keyMap[i + 1] = opt;
        count++;
      }
    }
    return {
      keyMap,
      totalFound: count,
      unrecognizedCount: cleanSequence.length - count,
      errors: count === 0 ? ['Could not recognize valid A/B/C/D options'] : [],
    };
  }

  return {
    keyMap,
    totalFound: 0,
    unrecognizedCount: 0,
    errors: ['Unable to parse answer key format. Try e.g. "1:A 2:B 3:C" or plain "ABCD..."'],
  };
}

export function normalizeOption(val: string): OptionLetter | null {
  const v = val.trim().toUpperCase();
  if (v === 'A' || v === '1') return 'A';
  if (v === 'B' || v === '2') return 'B';
  if (v === 'C' || v === '3') return 'C';
  if (v === 'D' || v === '4') return 'D';
  return null;
}

export function exportAnswerKeyToString(keyMap: Record<number, OptionLetter>, totalQuestions: number): string {
  const parts: string[] = [];
  for (let i = 1; i <= totalQuestions; i++) {
    if (keyMap[i]) {
      parts.push(`${i}:${keyMap[i]}`);
    }
  }
  return parts.join(' ');
}
