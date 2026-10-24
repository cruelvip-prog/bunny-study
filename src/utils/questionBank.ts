import { ExamImage, ExamImageType, ExamQuestion, OptionLetter } from '../types/exam';

export const QUESTION_BANK_MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const QUESTION_BANK_MAX_TOTAL_IMAGE_BYTES = 70 * 1024 * 1024;

const EMBEDDED_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

export interface QuestionBankSummary {
  totalQuestions: number;
  validQuestions: number;
  rejectedQuestions: number;
  subjects: string[];
  topics: string[];
  reviewRequired: number;
}

export interface ValidatedQuestionBank {
  schemaVersion: string;
  sourcePdf: {
    fileName: string;
    totalPages: number;
    subject: string;
  };
  questions: ExamQuestion[];
  summary: QuestionBankSummary;
  sourceMetadata?: Record<string, unknown>;
}

export interface BankValidationResult {
  bank: ValidatedQuestionBank | null;
  summary: QuestionBankSummary;
  errors: string[];
}

const OPTION_LETTERS: OptionLetter[] = ['A', 'B', 'C', 'D'];
const EMPTY_SUMMARY: QuestionBankSummary = {
  totalQuestions: 0,
  validQuestions: 0,
  rejectedQuestions: 0,
  subjects: [],
  topics: [],
  reviewRequired: 0,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isImageReference(value: unknown): boolean {
  return value === null || typeof value === 'string' || isRecord(value) ||
    (Array.isArray(value) && value.every((item) => typeof item === 'string' || isRecord(item)));
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MiB`;
  return `${Math.round(bytes / 1024)} KiB`;
}

export async function validateQuestionBankImageDecoding(bank: ValidatedQuestionBank): Promise<void> {
  const embeddedImages = [...new Map(bank.questions.flatMap((question) => question.images || [])
    .filter((image) => image.dataUri)
    .map((image) => [image.id, image])).values()];
  if (!embeddedImages.length) return;
  const unavailable = new Map<string, string>();
  for (const image of embeddedImages) {
    let bitmap: ImageBitmap | null = null;
    try {
      if (typeof createImageBitmap === 'function') {
        const response = await fetch(image.dataUri!);
        if (!response.ok) throw new Error(`Image data could not be read (${response.status}).`);
        bitmap = await createImageBitmap(await response.blob());
      } else if (typeof Image === 'function') {
        await new Promise<void>((resolve, reject) => {
          const element = new Image();
          element.onload = () => resolve();
          element.onerror = () => reject(new Error('Browser image decoding failed.'));
          element.src = image.dataUri!;
        });
      } else {
        throw new Error('This browser does not provide an image decoder.');
      }
    } catch (error) {
      unavailable.set(image.id, error instanceof Error ? error.message : String(error));
    } finally {
      bitmap?.close();
    }
  }
  if (unavailable.size) {
    for (const question of bank.questions) {
      const failedImages = (question.images || []).filter((image) => unavailable.has(image.id));
      if (!failedImages.length) continue;
      question.images = question.images?.filter((image) => !unavailable.has(image.id));
      const warnings = failedImages.map((image) =>
        `Image "${image.id}" could not be decoded as ${image.mimeType}: ${unavailable.get(image.id)}; it was skipped.`);
      question.missingContent = [...question.missingContent, ...warnings];
      question.reviewFlags = [...question.reviewFlags, 'One or more supplied images could not be loaded; question text and answers remain available.'];
      question.reviewRequired = true;
    }
    bank.summary.reviewRequired = bank.questions.filter((question) => question.reviewRequired).length;
  }
}

function hasImageSignature(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === 'image/png') {
    return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  }
  if (mimeType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mimeType === 'image/gif') {
    return bytes.length >= 6 && /^GIF8[79]a$/.test(String.fromCharCode(...bytes.slice(0, 6)));
  }
  if (mimeType === 'image/webp') {
    return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
      String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  }
  return false;
}

function getDataUriSignature(dataUri: string): Uint8Array {
  const base64Start = dataUri.indexOf(',') + 1;
  const prefix = dataUri.slice(base64Start, base64Start + 16);
  try {
    return Uint8Array.from(atob(prefix), (character) => character.charCodeAt(0));
  } catch {
    return new Uint8Array();
  }
}

function getDataUriMimeType(dataUri: string): string | null {
  return /^data:(image\/[^;,]+);base64,/i.exec(dataUri)?.[1]?.toLowerCase() || null;
}

function formatInlineImageErrors(errors: string[]): string {
  return errors.map((error) => error.replace(/^image_assets\[\d+\]\./, '')).join(' ');
}

function parseImageAsset(value: unknown, index: number): {
  image: ExamImage | null;
  bytes: number;
  errors: string[];
  paths: string[];
} {
  const prefix = `image_assets[${index}]`;
  if (!isRecord(value)) {
    return { image: null, bytes: 0, errors: [`${prefix} must be an image metadata object.`], paths: [] };
  }
  const errors: string[] = [];
  const paths: string[] = [];
  if (!nonEmptyString(value.id)) errors.push(`${prefix}.id must be non-empty text.`);
  const type = value.type;
  if (!['question', 'option', 'explanation'].includes(String(type))) {
    errors.push(`${prefix}.type must be question, option, or explanation.`);
  }
  const alt = typeof value.alt === 'string' ? value.alt : '';
  if (!(value.alt === undefined || typeof value.alt === 'string')) errors.push(`${prefix}.alt must be text.`);
  const caption = value.caption === undefined || value.caption === null
    ? null
    : typeof value.caption === 'string' ? value.caption : null;
  if (!(value.caption === undefined || value.caption === null || typeof value.caption === 'string')) {
    errors.push(`${prefix}.caption must be text or null.`);
  }

  let image: ExamImage | null = null;
  let bytes = 0;
  if (typeof value.dataUri === 'string') {
    const mimeType = value.mimeType;
    if (typeof mimeType !== 'string' || !EMBEDDED_IMAGE_MIME_TYPES.has(mimeType)) {
      errors.push(`${prefix}.mimeType must be one of PNG, JPEG, WebP, or GIF.`);
    }
    const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]*={0,2})$/.exec(value.dataUri);
    if (!match || match[1] !== mimeType) {
      errors.push(`${prefix}.dataUri must be valid Base64 data using the declared supported image MIME type.`);
    } else {
      const base64 = match[2];
      if (!base64.length || base64.length % 4 !== 0 ||
          (base64.includes('=') && !/^[A-Za-z0-9+/]+={1,2}$/.test(base64))) {
        errors.push(`${prefix}.dataUri contains malformed Base64 data.`);
      } else {
        const decodedLength = base64.length / 4 * 3 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
        if (decodedLength > QUESTION_BANK_MAX_IMAGE_BYTES) {
          errors.push(`${prefix} exceeds the ${formatBytes(QUESTION_BANK_MAX_IMAGE_BYTES)} per-image limit.`);
        } else {
          const signature = getDataUriSignature(value.dataUri);
          if (!hasImageSignature(signature, match[1])) {
            errors.push(`${prefix}.dataUri does not contain valid ${match[1]} image bytes.`);
          } else {
            bytes = decodedLength;
          }
        }
      }
    }
    if (typeof value.alt !== 'string') {
      errors.push(`${prefix}.alt must be text (use an empty string when decorative).`);
    }
    if (!errors.length) {
      image = {
        id: value.id as string,
        type: type as ExamImageType,
        mimeType: value.mimeType as string,
        dataUri: value.dataUri,
        alt,
        caption,
      };
    }
  } else if (typeof value.path === 'string' || typeof value.url === 'string') {
    const src = typeof value.url === 'string' ? value.url : value.path as string;
    const safeUrl = /^https?:\/\//i.test(src);
    const safeRelativePath = !/^[a-z][a-z0-9+.-]*:/i.test(src) && !src.startsWith('//');
    if (!src || (!safeUrl && !safeRelativePath)) {
      errors.push(`${prefix}.path/url must be an HTTP(S) URL or a relative path.`);
    } else {
      paths.push(src);
      image = {
        id: value.id as string,
        type: type as ExamImageType,
        mimeType: typeof value.mimeType === 'string' ? value.mimeType : 'application/octet-stream',
        src,
        alt,
        caption,
      };
    }
  } else {
    errors.push(`${prefix}.dataUri is required; image prompts and filenames do not contain image data.`);
  }
  return { image: errors.length ? null : image, bytes, errors, paths };
}

function mapQuestion(
  value: unknown,
  index: number,
  totalPages: number,
  assets: Map<string, ExamImage>,
  invalidInlineImages: Map<string, string>,
): {
  question: ExamQuestion | null;
  errors: string[];
} {
  const prefix = `questions[${index}]`;
  const errors: string[] = [];
  if (!isRecord(value)) return { question: null, errors: [`${prefix} must be an object.`] };

  if (!nonEmptyString(value.id)) errors.push(`${prefix}.id must be a non-empty string.`);
  if (!Number.isSafeInteger(value.question_number) || Number(value.question_number) < 1) {
    errors.push(`${prefix}.question_number must be a positive integer.`);
  }
  for (const field of ['chapter', 'exercise', 'section'] as const) {
    if (!nonEmptyString(value[field])) errors.push(`${prefix}.${field} must be a non-empty string.`);
  }
  if (!Number.isSafeInteger(value.source_page) || Number(value.source_page) < 1 ||
      Number(value.source_page) > totalPages) {
    errors.push(`${prefix}.source_page must be between 1 and source_pdf.total_pages (${totalPages}).`);
  }
  if (!(value.question_code === null || typeof value.question_code === 'string')) {
    errors.push(`${prefix}.question_code must be a string or null.`);
  }
  if (!nonEmptyString(value.question_en)) errors.push(`${prefix}.question_en must be non-empty text.`);
  if (!(value.question_hi === undefined || nullableString(value.question_hi))) {
    errors.push(`${prefix}.question_hi must be a string or null.`);
  }
  if (!isRecord(value.options)) {
    errors.push(`${prefix}.options must be an object with exactly A, B, C, and D.`);
  } else {
    const keys = Object.keys(value.options).sort();
    if (keys.join(',') !== 'A,B,C,D') errors.push(`${prefix}.options must contain exactly A, B, C, and D.`);
    for (const label of OPTION_LETTERS) {
      const option = value.options[label];
      if (!isRecord(option)) {
        errors.push(`${prefix}.options.${label} must be an object.`);
      } else {
        if (!nonEmptyString(option.text_en)) errors.push(`${prefix}.options.${label}.text_en must be non-empty.`);
        if (!(option.text_hi === undefined || nullableString(option.text_hi))) {
          errors.push(`${prefix}.options.${label}.text_hi must be a string or null.`);
        }
      }
    }
  }
  if (!(value.answer_key === null || OPTION_LETTERS.includes(value.answer_key as OptionLetter))) {
    errors.push(`${prefix}.answer_key must be A, B, C, D, or null.`);
  }
  if (!(value.answer_key_source === null || typeof value.answer_key_source === 'string')) {
    errors.push(`${prefix}.answer_key_source must be a string or null.`);
  }
  if (!Array.isArray(value.formulas) || !stringArray(value.formulas)) {
    errors.push(`${prefix}.formulas must be an array of strings.`);
  }
  const resolvedImages: ExamImage[] = [];
  const imageWarnings: string[] = [];
  const imageReferences = isRecord(value.images) ? value.images : null;
  if (value.images !== undefined && value.images !== null && !imageReferences) {
    imageWarnings.push('Image metadata is malformed and was skipped.');
  }
  if (imageReferences) {
    const images = imageReferences;
    const addImageRefs = (refs: unknown, expectedType: ExamImageType, option?: OptionLetter) => {
      if (refs === null || refs === undefined) return;
      if (!isImageReference(refs)) {
        imageWarnings.push(`An invalid ${expectedType} image reference was skipped.`);
        return;
      }
      const ids = Array.isArray(refs) ? refs : [refs];
      for (const id of ids) {
        const imageId = isRecord(id) ? id.id : id;
        if (typeof imageId !== 'string') {
          imageWarnings.push(`An invalid ${expectedType} image reference was skipped.`);
          continue;
        }
        const image = assets.get(imageId);
        if (!image) {
          if (/^data:/i.test(imageId)) {
            const detail = invalidInlineImages.get(imageId);
            imageWarnings.push(detail
              ? `Embedded image data URI could not be loaded: ${detail}; the question was kept.`
              : 'Embedded image data URI could not be resolved; the question was kept.');
          } else {
            imageWarnings.push(`Image "${imageId}" could not be loaded; the question was kept.`);
          }
          continue;
        }
        const inlineDataUri = /^data:/i.test(imageId);
        if (image.type !== expectedType && !inlineDataUri) {
          imageWarnings.push(`Image "${imageId}" has the wrong image type and was skipped.`);
          continue;
        }
        resolvedImages.push({
          ...image,
          ...(inlineDataUri ? { type: expectedType } : {}),
          ...(option ? { option } : {}),
        });
      }
    };
    addImageRefs(images.question_en, 'question');
    addImageRefs(images.question_hi, 'question');
    if (Array.isArray(images.options)) {
      images.options.forEach((reference, optionIndex) => {
        const option = OPTION_LETTERS[optionIndex];
        if (option) addImageRefs(reference, 'option', option);
      });
      if (images.options.length !== OPTION_LETTERS.length) {
        imageWarnings.push('Option image metadata did not contain exactly four references; invalid entries were skipped.');
      }
    } else if (images.options !== undefined) {
      imageWarnings.push('Option image metadata is malformed and was skipped.');
    }
    addImageRefs(images.explanation, 'explanation');
  }
  if (!stringArray(value.review_flags)) errors.push(`${prefix}.review_flags must be an array of strings.`);
  if (!stringArray(value.missing_content)) errors.push(`${prefix}.missing_content must be an array of strings.`);

  if (errors.length) return { question: null, errors };

  const options = value.options as Record<OptionLetter, Record<string, unknown>>;
  const missingContent = [...value.missing_content as string[], ...imageWarnings];
  const reviewFlags = [...value.review_flags as string[]];
  if (imageWarnings.length) reviewFlags.push('One or more supplied images could not be loaded; question text and answers remain available.');
  const sourceText = `${reviewFlags.join(' ')} ${String(value.answer_key_source || '')}`;
  const aiGenerated = /ai[- ]?(?:generated|assisted)|model[- ]?generated|source_comparison_required/i.test(sourceText);

  return {
    question: {
      id: value.id as string,
      originalQuestionNumber: value.question_number as number,
      subject: '',
      topic: value.chapter as string,
      ...(typeof value.topic === 'string' ? { topicName: value.topic } : {}),
      section: value.section as string,
      sourcePage: value.source_page as number,
      questionEn: value.question_en as string,
      questionHi: typeof value.question_hi === 'string' ? value.question_hi : null,
      options: Object.fromEntries(OPTION_LETTERS.map((label) => [label, {
        textEn: options[label].text_en as string,
        textHi: typeof options[label].text_hi === 'string' ? options[label].text_hi : null,
      }])) as ExamQuestion['options'],
      answerKey: value.answer_key as OptionLetter | null,
      answerKeySource: value.answer_key_source as string | null,
      reviewRequired: reviewFlags.length > 0 || missingContent.length > 0,
      reviewFlags,
      missingContent,
      formulas: value.formulas as string[],
      ...(typeof value.explanation_en === 'string' || value.explanation_en === null
        ? { explanationEn: value.explanation_en as string | null } : {}),
      ...(typeof value.explanation_hi === 'string' || value.explanation_hi === null
        ? { explanationHi: value.explanation_hi as string | null } : {}),
      ...(resolvedImages.length ? {
        images: [...new Map(resolvedImages.map((image) => [
          `${image.type}:${image.option || ''}:${image.id}`,
          image,
        ])).values()],
      } : {}),
      ...(aiGenerated ? { answerKeySource: `${String(value.answer_key_source || '')} [AI/review flagged]`.trim() } : {}),
    },
    errors: [],
  };
}

interface V2Option {
  id: string;
  text: string;
  label: OptionLetter;
  explicitLabel: boolean;
}

function parseV2Options(value: unknown): V2Option[] | null {
  const entries: Array<[string, unknown]> = Array.isArray(value)
    ? value.map((option, index) => [String(index), option])
    : isRecord(value) ? Object.entries(value) : [];
  if (entries.length !== OPTION_LETTERS.length) return null;
  const canonicalKeys = entries.every(([key]) => OPTION_LETTERS.includes(key as OptionLetter));
  const options = entries.map(([key, rawOption], index) => {
    const option = typeof rawOption === 'string' ? { text: rawOption } :
      isRecord(rawOption) ? rawOption : null;
    if (!option || !(option.text === undefined || option.text === null || typeof option.text === 'string')) return null;
    return {
      id: typeof option.id === 'string' && option.id.length
        ? option.id
        : typeof option.optionId === 'string' && option.optionId.length
          ? option.optionId
          : key,
      text: typeof option.text === 'string' ? option.text : '',
      label: canonicalKeys ? key as OptionLetter : OPTION_LETTERS[index],
      explicitLabel: canonicalKeys,
    };
  });
  if (options.some((option) => option === null)) return null;
  return options as V2Option[];
}

function getV2ImageType(value: unknown, key: string): ExamImageType | null {
  if (value === 'question' || value === 'option' || value === 'explanation') return value;
  const normalizedKey = key.toLocaleLowerCase();
  if (normalizedKey.includes('question')) return 'question';
  if (normalizedKey.includes('option') || OPTION_LETTERS.includes(key as OptionLetter)) return 'option';
  if (normalizedKey.includes('explanation')) return 'explanation';
  return null;
}

function normalizeV2Images(
  value: unknown,
  questionId: string,
): { images: ExamImage[]; unresolved: string[]; bytes: number } {
  const images: ExamImage[] = [];
  const unresolved: string[] = [];
  const embeddedByUri = new Map<string, ExamImage>();
  let bytes = 0;
  let imageIndex = 0;
  const visit = (item: unknown, key: string, type: ExamImageType | null, option?: OptionLetter) => {
    if (typeof item === 'string') {
      if (/^data:/i.test(item)) {
        const existing = embeddedByUri.get(item);
        if (existing) {
          images.push({
            ...existing,
            type: type || 'question',
            ...(type === 'option' && option ? { option } : {}),
          });
          return;
        }
        const mimeType = getDataUriMimeType(item);
        const parsedImage = parseImageAsset({
          id: `${questionId}-image-${imageIndex++}`,
          type: type || 'question',
          mimeType: mimeType || '',
          dataUri: item,
          alt: '',
          caption: null,
        }, imageIndex);
        if (!parsedImage.image) {
          unresolved.push(`Embedded image data URI could not be loaded: ${formatInlineImageErrors(parsedImage.errors)}`);
          return;
        }
        bytes += parsedImage.bytes;
        embeddedByUri.set(item, parsedImage.image);
        images.push({
          ...parsedImage.image,
          ...(type === 'option' && option ? { option } : {}),
        });
      } else if (/^https?:\/\//i.test(item)) {
        images.push({
          id: `${questionId}-image-${imageIndex++}`,
          type: type || 'question',
          mimeType: 'application/octet-stream',
          src: item,
          alt: '',
          caption: null,
          ...(type === 'option' && option ? { option } : {}),
        });
      } else {
        unresolved.push(`Image reference "${item}" was not loaded; file paths are not treated as image bytes.`);
      }
      return;
    }
    if (Array.isArray(item)) {
      item.forEach((entry, index) => {
        const option = type === 'option' && OPTION_LETTERS[index]
          ? OPTION_LETTERS[index]
          : undefined;
        visit(entry, String(index), type, option);
      });
      return;
    }
    if (!isRecord(item)) return;

    const itemType = getV2ImageType(item.type, key) || type;
    const hasImageContent = typeof item.dataUri === 'string' ||
      typeof item.url === 'string' || typeof item.path === 'string';
    if (hasImageContent) {
      if (typeof item.path === 'string' && typeof item.dataUri !== 'string' &&
          typeof item.url !== 'string') {
        unresolved.push(`Image "${item.path}" was not loaded; file paths are not treated as image bytes.`);
        return;
      }
      if (typeof item.url === 'string' && !/^https?:\/\//i.test(item.url) &&
          typeof item.dataUri !== 'string') {
        unresolved.push(`Image URL "${item.url}" is not an HTTP(S) URL and could not be resolved.`);
        return;
      }
      const candidate = {
        ...item,
        id: nonEmptyString(item.id) ? item.id : `${questionId}-image-${imageIndex++}`,
        type: itemType || 'question',
        mimeType: item.mimeType || item.mime_type,
        ...(typeof item.url === 'string' ? { url: item.url } : {}),
      };
      const parsedImage = parseImageAsset(candidate, imageIndex);
      if (!parsedImage.image) {
        unresolved.push(...parsedImage.errors.map((error) => `Image could not be loaded: ${error}`));
        return;
      }
      bytes += parsedImage.bytes;
      images.push({
        ...parsedImage.image,
        ...(itemType === 'option' && (option || OPTION_LETTERS.includes(item.option as OptionLetter))
          ? { option: option || item.option as OptionLetter }
          : {}),
      });
      return;
    }
    if (typeof item.id === 'string') {
      unresolved.push(`Image reference "${item.id}" could not be resolved to image bytes or an HTTP(S) URL.`);
      return;
    }
    Object.entries(item).forEach(([childKey, child]) => {
      const childType = getV2ImageType(childKey, childKey) || itemType;
      const childOption = childType === 'option' && OPTION_LETTERS.includes(childKey as OptionLetter)
        ? childKey as OptionLetter
        : undefined;
      visit(child, childKey, childType, childOption);
    });
  };
  visit(value, 'images', null);
  return { images, unresolved, bytes };
}

function validateQuestionBankV2(parsed: Record<string, unknown>): BankValidationResult {
  const errors: string[] = [];
  const questions: ExamQuestion[] = [];
  const seenIds = new Set<string>();
  const subjects = new Set<string>();
  const topics = new Set<string>();
  let reviewRequired = 0;
  let totalImageBytes = 0;
  if (!Array.isArray(parsed.questions)) {
    return {
      bank: null,
      summary: { ...EMPTY_SUMMARY },
      errors: ['Schema v2 requires a questions array.'],
    };
  }
  parsed.questions.forEach((rawQuestion, index) => {
    const prefix = `questions[${index}]`;
    if (!isRecord(rawQuestion)) {
      errors.push(`${prefix} must be an object.`);
      return;
    }
    const questionErrors: string[] = [];
    const mappingWarnings: string[] = [];
    if (!nonEmptyString(rawQuestion.id)) questionErrors.push(`${prefix}.id must be non-empty text.`);
    if (!nonEmptyString(rawQuestion.subject)) questionErrors.push(`${prefix}.subject must be non-empty text.`);
    if (!nonEmptyString(rawQuestion.chapter)) questionErrors.push(`${prefix}.chapter must be non-empty text.`);
    if (!nonEmptyString(rawQuestion.topic)) questionErrors.push(`${prefix}.topic must be non-empty text.`);
    const id = typeof rawQuestion.id === 'string' ? rawQuestion.id : `${index + 1}`;
    if (seenIds.has(id)) questionErrors.push(`${prefix}.id duplicates another v2 question (${id}).`);
    seenIds.add(id);

    const languages = rawQuestion.languages;
    if (!isRecord(languages)) {
      questionErrors.push(`${prefix}.languages must be an object containing en and/or hi language objects.`);
    }
    const english = isRecord(languages) && isRecord(languages.en) ? languages.en : null;
    const hindi = isRecord(languages) && isRecord(languages.hi) ? languages.hi : null;
    if (!english && !hindi) questionErrors.push(`${prefix}.languages must contain an en or hi object.`);
    const englishQuestion = english && typeof english.question === 'string' ? english.question : '';
    const hindiQuestion = hindi && typeof hindi.question === 'string' ? hindi.question : null;
    if (!englishQuestion.trim() && !(hindiQuestion || '').trim()) {
      questionErrors.push(`${prefix}.languages must provide non-empty question text in en or hi.`);
    }
    for (const [code, language] of [['en', english], ['hi', hindi]] as const) {
      if (language && language.question !== undefined &&
          language.question !== null && typeof language.question !== 'string') {
        questionErrors.push(`${prefix}.languages.${code}.question must be text or null.`);
      }
    }

    const englishOptions = english && english.options !== undefined
      ? parseV2Options(english.options)
      : null;
    if (english && english.options !== undefined && !englishOptions) {
      questionErrors.push(`${prefix}.languages.en.options must contain exactly four options, as A-D keys or option objects with text.`);
    } else if (englishOptions?.some((option) => !option.text.trim())) {
      questionErrors.push(`${prefix}.languages.en.options must contain non-empty text for all four choices.`);
    }
    const parsedHindiOptions = hindi && hindi.options !== undefined
      ? parseV2Options(hindi.options)
      : null;
    const hindiOptions = parsedHindiOptions;
    const primaryOptions = englishOptions || hindiOptions;
    if (!primaryOptions) {
      questionErrors.push(`${prefix}.languages must provide four options in at least one language.`);
    }
    const optionTexts: Record<OptionLetter, { textEn: string; textHi: string | null }> = {
      A: { textEn: '', textHi: null },
      B: { textEn: '', textHi: null },
      C: { textEn: '', textHi: null },
      D: { textEn: '', textHi: null },
    };
    const optionIds = new Map<string, OptionLetter>();
    primaryOptions?.forEach((entry) => {
      if (englishOptions) optionTexts[entry.label].textEn = entry.text;
      if (!englishOptions && hindiOptions) optionTexts[entry.label].textHi = entry.text;
      if (optionIds.has(entry.id)) questionErrors.push(`${prefix}.languages options contain duplicate option id "${entry.id}".`);
      else optionIds.set(entry.id, entry.label);
    });
    if (hindiOptions && englishOptions) {
      const hindiById = new Map(hindiOptions.map((entry) => [entry.id, entry]));
      const matchingIds = englishOptions.every((entry) => hindiById.has(entry.id)) &&
        hindiOptions.every((entry) => optionIds.has(entry.id));
      const matchingLabels = englishOptions.every((entry) => entry.explicitLabel) &&
        hindiOptions.every((entry) => entry.explicitLabel);
      if (!matchingIds && !matchingLabels) {
        mappingWarnings.push('Hindi option IDs do not match the English option IDs; Hindi option text was retained in source metadata but could not be aligned safely.');
      } else {
        hindiOptions.forEach((entry) => {
          const label = matchingIds
            ? optionIds.get(entry.id)
            : entry.label;
          if (label) optionTexts[label].textHi = entry.text || null;
        });
      }
    } else if (hindiOptions && !englishOptions) {
      hindiOptions.forEach((entry) => {
        optionTexts[entry.label].textHi = entry.text;
      });
    }

    let answerKey: OptionLetter | null = null;
    const correctAnswer = rawQuestion.correctAnswer;
    const requiresMultipleAnswers = typeof rawQuestion.questionType === 'string' &&
      /multi|multiple|select[_ -]?all|multiple[_ -]?response/i.test(rawQuestion.questionType);
    if (correctAnswer === null || correctAnswer === undefined || correctAnswer === '') {
      answerKey = null;
    } else if (!requiresMultipleAnswers) {
      const answerValue = isRecord(correctAnswer) && typeof correctAnswer.optionId === 'string'
        ? correctAnswer.optionId
        : correctAnswer;
      const answers = Array.isArray(answerValue) ? answerValue : [answerValue];
      if (answers.length === 1 && typeof answers[0] === 'string') {
        const answer = answers[0];
        if (OPTION_LETTERS.includes(answer as OptionLetter)) {
          answerKey = answer as OptionLetter;
        } else {
          answerKey = optionIds.get(answer) || null;
        }
      }
    }
    const reviewFlags: string[] = [...mappingWarnings];
    const missingContent: string[] = [];
    if (correctAnswer !== null && correctAnswer !== undefined && correctAnswer !== '' && !answerKey) {
      reviewFlags.push('Schema v2 correctAnswer could not be represented as one of the four internal answer choices; the original value is preserved.');
    }
    if (requiresMultipleAnswers && correctAnswer !== null && correctAnswer !== undefined) {
      reviewFlags.push('This v2 question type may require multiple answers and is not scored by the single-answer simulator.');
    }
    const normalizedImages = normalizeV2Images(rawQuestion.images, id);
    if (totalImageBytes + normalizedImages.bytes > QUESTION_BANK_MAX_TOTAL_IMAGE_BYTES) {
      normalizedImages.unresolved.push(`Embedded images exceed the ${formatBytes(QUESTION_BANK_MAX_TOTAL_IMAGE_BYTES)} bank image-data limit and were not attached to the internal image renderer.`);
      normalizedImages.images.length = 0;
    } else totalImageBytes += normalizedImages.bytes;
    missingContent.push(...normalizedImages.unresolved);
    if (missingContent.length) reviewFlags.push('One or more v2 images could not be resolved; see missing-content details.');
    if (questionErrors.length) {
      errors.push(...questionErrors);
      return;
    }
    const subject = rawQuestion.subject as string;
    const topic = rawQuestion.topic as string;
    const question: ExamQuestion = {
      id,
      originalQuestionNumber: index + 1,
      subject,
      topic,
      section: typeof rawQuestion.subtopic === 'string' ? rawQuestion.subtopic : '',
      sourcePage: 0,
      questionEn: englishQuestion,
      questionHi: hindiQuestion,
      options: optionTexts,
      answerKey,
      answerKeySource: null,
      reviewRequired: reviewFlags.length > 0,
      reviewFlags,
      missingContent,
      formulas: [],
      ...(english && typeof english.explanation === 'string' ? { explanationEn: english.explanation } : {}),
      ...(hindi && typeof hindi.explanation === 'string' ? { explanationHi: hindi.explanation } : {}),
      ...(normalizedImages.images.length ? { images: normalizedImages.images } : {}),
      schemaV2: rawQuestion,
    };
    questions.push(question);
    subjects.add(subject);
    topics.add(topic);
    if (question.reviewRequired) reviewRequired++;
  });
  if (!questions.length && !errors.length) errors.push('The schema v2 question bank is empty.');

  const summary: QuestionBankSummary = {
    totalQuestions: Array.isArray(parsed.questions) ? parsed.questions.length : 0,
    validQuestions: questions.length,
    rejectedQuestions: (parsed.questions as unknown[]).length - questions.length,
    subjects: [...subjects].sort(),
    topics: [...topics].sort(),
    reviewRequired,
  };
  if (errors.length) return { bank: null, summary, errors };
  const firstQuestion = questions[0];
  return {
    bank: {
      schemaVersion: '2',
      sourcePdf: {
        fileName: '',
        totalPages: 0,
        subject: firstQuestion?.subject || '',
      },
      questions,
      summary,
      sourceMetadata: parsed,
    },
    summary,
    errors: [],
  };
}

export function validateQuestionBankText(text: string): BankValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return {
      bank: null,
      summary: { ...EMPTY_SUMMARY },
      errors: [`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`],
    };
  }

  if (!isRecord(parsed)) {
    return { bank: null, summary: { ...EMPTY_SUMMARY }, errors: ['Question bank root must be a JSON object.'] };
  }
  if ('schemaVersion' in parsed) {
    if (parsed.schemaVersion !== 2) {
      return {
        bank: null,
        summary: { ...EMPTY_SUMMARY },
        errors: [`Unsupported schemaVersion "${String(parsed.schemaVersion)}". This importer accepts schemaVersion 2 or the legacy schema_version "1.0".`],
      };
    }
    return validateQuestionBankV2(parsed);
  }

  const errors: string[] = [];
  if (parsed.schema_version !== '1.0') {
    errors.push('Unsupported schema_version. This importer accepts question-bank schema "1.0" only.');
  }
  const source = parsed.source_pdf;
  if (!isRecord(source)) {
    errors.push('source_pdf must be an object.');
  } else {
    if (!nonEmptyString(source.file_name)) errors.push('source_pdf.file_name must be non-empty.');
    if (!nonEmptyString(source.subject)) errors.push('source_pdf.subject must be non-empty.');
    if (!Number.isSafeInteger(source.total_pages) || Number(source.total_pages) < 1) {
      errors.push('source_pdf.total_pages must be a positive integer.');
    }
  }
  const imageAssetsInput = Array.isArray(parsed.image_assets) ? parsed.image_assets : [];
  const imageAssets = new Map<string, ExamImage>();
  const embeddedImagesByUri = new Map<string, ExamImage>();
  const invalidInlineImages = new Map<string, string>();
  const seenImageIds = new Set<string>();
  let totalImageBytes = 0;
  let inlineImageIndex = 0;
  if (imageAssetsInput.length) {
    imageAssetsInput.forEach((rawAsset, index) => {
      const result = parseImageAsset(rawAsset, index);
      if (result.image) {
        if (result.bytes && totalImageBytes + result.bytes > QUESTION_BANK_MAX_TOTAL_IMAGE_BYTES) {
          return;
        }
        totalImageBytes += result.bytes;
        if (result.image.dataUri && !embeddedImagesByUri.has(result.image.dataUri)) {
          embeddedImagesByUri.set(result.image.dataUri, result.image);
        }
        if (seenImageIds.has(result.image.id) || imageAssets.has(result.image.id)) {
          imageAssets.delete(result.image.id);
        } else {
          seenImageIds.add(result.image.id);
          imageAssets.set(result.image.id, result.image);
          for (const legacyPath of result.paths) {
            if (imageAssets.has(legacyPath)) {
              errors.push(`image_assets[${index}] legacy path/url duplicates another image reference (${legacyPath}).`);
            } else {
              imageAssets.set(legacyPath, result.image);
            }
          }
        }
      }
    });
  }
  if (!Array.isArray(parsed.questions)) {
    errors.push('questions must be an array.');
    return { bank: null, summary: { ...EMPTY_SUMMARY }, errors };
  }
  const totalPages = isRecord(source) && Number.isSafeInteger(source.total_pages)
    ? Number(source.total_pages)
    : 0;
  const rawQuestions = parsed.questions;
  rawQuestions.forEach((rawQuestion, questionIndex) => {
    if (!isRecord(rawQuestion) || !isRecord(rawQuestion.images)) return;
    const imageValues = [
      ['question_en', rawQuestion.images.question_en],
      ['question_hi', rawQuestion.images.question_hi],
      ['explanation', rawQuestion.images.explanation],
      ...((Array.isArray(rawQuestion.images.options) ? rawQuestion.images.options : [])
        .map((image, optionIndex) => [`options[${optionIndex}]`, image] as const)),
    ] as const;
    imageValues.forEach(([location, value]) => {
      const imageType: ExamImageType = location === 'explanation'
        ? 'explanation'
        : location.startsWith('options')
          ? 'option'
          : 'question';
      const directAssets = Array.isArray(value) ? value : [value];
      directAssets.forEach((asset, assetIndex) => {
        if (typeof asset === 'string' && /^data:/i.test(asset)) {
          if (imageAssets.has(asset) || invalidInlineImages.has(asset)) return;
          const existing = embeddedImagesByUri.get(asset);
          if (existing) {
            imageAssets.set(asset, existing);
            return;
          }
          const mimeType = getDataUriMimeType(asset);
          const result = parseImageAsset({
            id: `inline-image-${inlineImageIndex++}`,
            type: imageType,
            mimeType: mimeType || '',
            dataUri: asset,
            alt: '',
            caption: null,
          }, questionIndex);
          if (!result.image) {
            invalidInlineImages.set(asset, formatInlineImageErrors(result.errors));
            return;
          }
          if (totalImageBytes + result.bytes > QUESTION_BANK_MAX_TOTAL_IMAGE_BYTES) {
            invalidInlineImages.set(
              asset,
              `Embedded images exceed the ${formatBytes(QUESTION_BANK_MAX_TOTAL_IMAGE_BYTES)} bank image-data limit.`,
            );
            return;
          }
          totalImageBytes += result.bytes;
          embeddedImagesByUri.set(asset, result.image);
          imageAssets.set(asset, result.image);
          return;
        }
        if (!isRecord(asset)) return;
        const result = parseImageAsset(asset, questionIndex);
        if (result.image) {
          if (result.bytes && totalImageBytes + result.bytes > QUESTION_BANK_MAX_TOTAL_IMAGE_BYTES) return;
          totalImageBytes += result.bytes;
          if (result.image.dataUri && !embeddedImagesByUri.has(result.image.dataUri)) {
            embeddedImagesByUri.set(result.image.dataUri, result.image);
          }
          if (seenImageIds.has(result.image.id) || imageAssets.has(result.image.id)) {
            imageAssets.delete(result.image.id);
          } else {
            seenImageIds.add(result.image.id);
            imageAssets.set(result.image.id, result.image);
          }
        }
      });
    });
  });
  const questions: ExamQuestion[] = [];
  const seenIds = new Map<string, number>();
  const seenQuestionContent = new Map<string, number>();
  const subjects = new Set<string>();
  const topics = new Set<string>();
  let reviewRequired = 0;
  let rejectedQuestions = 0;

  rawQuestions.forEach((rawQuestion, index) => {
    const result = mapQuestion(rawQuestion, index, totalPages, imageAssets, invalidInlineImages);
    if (result.question) {
      const id = result.question.id;
      const prior = seenIds.get(id);
      if (prior !== undefined) {
        result.errors.push(`questions[${index}].id duplicates questions[${prior}] (${id}).`);
      } else {
        seenIds.set(id, index);
      }
      const normalizedContent = [
        result.question.subject,
        result.question.topic,
        result.question.questionEn,
        ...OPTION_LETTERS.map((letter) => result.question!.options[letter].textEn),
      ].join('\u0000').replace(/\s+/g, ' ').trim().toLowerCase();
      const duplicateContent = seenQuestionContent.get(normalizedContent);
      if (duplicateContent !== undefined) {
        result.errors.push(`questions[${index}] duplicates question content in questions[${duplicateContent}].`);
      } else {
        seenQuestionContent.set(normalizedContent, index);
      }
    }
    if (result.errors.length) {
      rejectedQuestions++;
      errors.push(...result.errors);
      return;
    }
    const question = result.question!;
    question.subject = isRecord(source) ? String(source.subject) : '';
    questions.push(question);
    subjects.add(question.subject);
    topics.add(question.topic);
    if (question.reviewRequired) reviewRequired++;
  });

  const summary: QuestionBankSummary = {
    totalQuestions: rawQuestions.length,
    validQuestions: questions.length,
    rejectedQuestions,
    subjects: [...subjects].sort(),
    topics: [...topics].sort(),
    reviewRequired,
  };

  if (rawQuestions.length === 0) errors.push('The question bank is empty.');
  if (errors.length) return { bank: null, summary, errors };

  return {
    bank: {
      schemaVersion: parsed.schema_version as string,
      sourcePdf: {
        fileName: (source as Record<string, unknown>).file_name as string,
        totalPages,
        subject: (source as Record<string, unknown>).subject as string,
      },
      questions,
      summary,
      sourceMetadata: 'pyqPaper' in parsed ? { pyqPaper: parsed.pyqPaper } : undefined,
    },
    summary,
    errors: [],
  };
}

export function generatePracticeQuestions(
  bank: ValidatedQuestionBank,
  subject: string,
  topic: string,
  count: number,
  randomize = false,
  searchText = '',
  random: () => number = Math.random
): ExamQuestion[] {
  if (!Number.isSafeInteger(count) || count < 1) throw new Error('Question count must be a positive integer.');
  const filtered = filterPracticeQuestions(bank, subject, topic, searchText);
  if (!filtered.length) throw new Error('No questions match the selected subject and topic.');
  if (count > filtered.length) {
    throw new Error(`Only ${filtered.length} questions match the selected filters; reduce the test count.`);
  }
  if (randomize) {
    for (let index = filtered.length - 1; index > 0; index--) {
      const target = Math.floor(random() * (index + 1));
      [filtered[index], filtered[target]] = [filtered[target], filtered[index]];
    }
  }
  return filtered.slice(0, count).map((question) => ({ ...question, options: { ...question.options } }));
}

export function filterPracticeQuestions(
  bank: ValidatedQuestionBank,
  subject: string,
  topic: string,
  searchText = ''
): ExamQuestion[] {
  const query = searchText.trim().toLocaleLowerCase();
  return bank.questions.filter((question) =>
    (subject === 'All' || question.subject === subject) &&
    (topic === 'All' || question.topic === topic) &&
    (!query || [
      question.id,
      question.questionEn,
      question.questionHi || '',
      question.subject,
      question.topic,
      ...Object.values(question.options).flatMap((option) => [option.textEn, option.textHi || '']),
    ].join(' ').toLocaleLowerCase().includes(query))
  );
}

export function createImportedAnswerKey(
  questions: ExamQuestion[],
  userConfirmedSourceReview: boolean
): { key: Record<number, OptionLetter> | null; status: 'none' | 'source-cited-unverified' | 'user-verified-import' | 'ai-generated-review-required' } {
  const key: Record<number, OptionLetter> = {};
  const hasAiFlags = questions.some((question) =>
    /AI\/review flagged/i.test(question.answerKeySource || '') ||
    question.reviewFlags.some((flag) =>
      /\bai(?:[- ]?(?:generated|assisted))?\b|model[- ]?generated|draft|source_comparison_required/i.test(flag)
    )
  );
  if (!userConfirmedSourceReview) {
    return { key: null, status: hasAiFlags ? 'ai-generated-review-required' : 'source-cited-unverified' };
  }
  questions.forEach((question, index) => {
    if (question.answerKey) key[index + 1] = question.answerKey;
  });
  return {
    key: Object.keys(key).length ? key : null,
    status: 'user-verified-import',
  };
}
