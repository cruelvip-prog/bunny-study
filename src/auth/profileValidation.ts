export const STUDENT_CLASSES = ['11th', '12th', 'dropper'] as const;

export type StudentClass = typeof STUDENT_CLASSES[number];

export interface ProfileInput {
  fullName: string;
  studentClass: StudentClass | '';
  targetNeetYear: string;
  coachingInstitute: string;
}

export interface ValidatedProfileInput {
  full_name: string;
  student_class: StudentClass;
  target_neet_year: number;
  coaching_institute: string | null;
}

export type ProfileValidationResult =
  | { value: ValidatedProfileInput; error: null }
  | { value: null; error: string };

export function validateProfileInput(
  input: ProfileInput,
  currentUtcYear = new Date().getUTCFullYear(),
): ProfileValidationResult {
  const fullName = input.fullName.trim();
  if (!fullName) {
    return { value: null, error: 'Enter your full name.' };
  }
  if (!STUDENT_CLASSES.includes(input.studentClass as StudentClass)) {
    return { value: null, error: 'Choose your current class.' };
  }

  const targetYear = input.targetNeetYear.trim();
  if (!/^\d+$/.test(targetYear)) {
    return { value: null, error: 'Enter a valid target NEET year.' };
  }
  const year = Number(targetYear);
  if (!Number.isSafeInteger(year) || year > 2_147_483_647) {
    return { value: null, error: 'Enter a valid target NEET year.' };
  }
  if (year < currentUtcYear) {
    return {
      value: null,
      error: `Target NEET year must be ${currentUtcYear} or later.`,
    };
  }

  return {
    value: {
      full_name: fullName,
      student_class: input.studentClass as StudentClass,
      target_neet_year: year,
      coaching_institute: input.coachingInstitute.trim() || null,
    },
    error: null,
  };
}
