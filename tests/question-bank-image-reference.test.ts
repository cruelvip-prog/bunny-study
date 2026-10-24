import assert from 'node:assert/strict';
import test from 'node:test';

import { getQuestionBankSource } from '../src/questionBanks/sourceRegistry';
import { normalizeQuestionInput } from '../src/questionBanks/questionInput';
import { extractQuestionBankImport } from '../src/questionBanks/importQuestions';
import fs from 'node:fs';

function baseQuestion(images: unknown) {
  return {
    chapter: 'Image Reference Test',
    question_en: 'Question text',
    options: {
      A: { text_en: 'Option A', text_hi: null },
      B: { text_en: 'Option B', text_hi: null },
      C: { text_en: 'Option C', text_hi: null },
      D: { text_en: 'Option D', text_hi: null },
    },
    images,
  };
}

test('accepts a valid HTTPS image URL with hostname and path', () => {
  const source = getQuestionBankSource('physics');
  assert.ok(source);

  const result = normalizeQuestionInput(
    baseQuestion([
      {
        id: 'figure',
        type: 'question',
        mimeType: 'image/png',
        src: 'https://example.com/figure.png',
        alt: 'Question figure',
        caption: null,
      },
    ]),
    source,
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.payload.images, [
      {
        id: 'figure',
        type: 'question',
        mimeType: 'image/png',
        src: 'https://example.com/figure.png',
        alt: 'Question figure',
        caption: null,
      },
    ]);
  }
});

test('accepts a valid HTTP image URL', () => {
  const source = getQuestionBankSource('physics');
  assert.ok(source);

  const result = normalizeQuestionInput(
    baseQuestion([
      {
        id: 'figure',
        type: 'question',
        mimeType: 'image/png',
        src: 'http://example.com/figure.png',
        alt: 'Question figure',
        caption: null,
      },
    ]),
    source,
  );

  assert.equal(result.ok, true);
});

test('accepts a supported relative image path', () => {
  const source = getQuestionBankSource('physics');
  assert.ok(source);

  const result = normalizeQuestionInput(
    baseQuestion([
      {
        id: 'figure',
        type: 'question',
        mimeType: 'image/png',
        src: 'images/local-diagram.png',
        alt: 'Question figure',
        caption: null,
      },
    ]),
    source,
  );

  assert.equal(result.ok, true);
});

test('rejects a malformed URL and an unsupported protocol', () => {
  const source = getQuestionBankSource('physics');
  assert.ok(source);

  for (const src of ['https://', 'ftp://example.com/figure.png', 'javascript:alert(1)']) {
    const result = normalizeQuestionInput(
      baseQuestion([
        {
          id: 'figure',
          type: 'question',
          mimeType: 'image/png',
          src,
          alt: 'Question figure',
          caption: null,
        },
      ]),
      source,
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.errors.join('\n'), /has an invalid image reference/);
    }
  }
});

test('a URL-only image object does not produce an invalid-data-URI error', () => {
  const source = getQuestionBankSource('physics');
  assert.ok(source);

  const result = normalizeQuestionInput(
    baseQuestion([
      {
        id: 'figure',
        type: 'question',
        mimeType: 'image/png',
        src: 'https://example.com/figure.png',
        alt: 'Question figure',
        caption: null,
      },
    ]),
    source,
  );

  if (!result.ok) {
    assert.doesNotMatch(result.errors.join('\n'), /has an invalid data URI/);
  }
});

const tinyPngDataUri =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aWQAAAAASUVORK5CYII=';

test('accepts a real Base64 PNG data URI in the normalizer', () => {
  const source = getQuestionBankSource('botany');
  assert.ok(source);

  const result = normalizeQuestionInput(
    {
      chapter: 'Sexual Reproduction in Flowering Plants',
      question_en: 'In a typical angiosperm ovule, which structure contains the megaspore mother cell?',
      options: {
        A: { text_en: 'Nucellus', text_hi: 'न्यूसेलस' },
        B: { text_en: 'Integument', text_hi: 'अध्यावरण' },
        C: { text_en: 'Micropyle', text_hi: 'बीजांडद्वार' },
        D: { text_en: 'Funicle', text_hi: 'बीजांडवृंत' },
      },
      images: [
        {
          id: 'uploaded-classroom-image',
          type: 'question',
          mimeType: 'image/png',
          dataUri: tinyPngDataUri,
          alt: 'Biology classroom scene',
          caption: 'Biology reference image',
        },
      ],
    },
    source,
    { lockedSubject: 'Botany' },
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal((result.payload.images as Array<Record<string, unknown>>)[0].dataUri, tinyPngDataUri);
  }
});

test('rejects a genuinely malformed data URI prefix', () => {
  const source = getQuestionBankSource('botany');
  assert.ok(source);

  const result = normalizeQuestionInput(
    {
      chapter: 'Sexual Reproduction in Flowering Plants',
      question_en: 'Question text',
      options: {
        A: { text_en: 'Option A', text_hi: null },
        B: { text_en: 'Option B', text_hi: null },
        C: { text_en: 'Option C', text_hi: null },
        D: { text_en: 'Option D', text_hi: null },
      },
      images: [
        {
          id: 'bad',
          type: 'question',
          mimeType: 'image/png',
          dataUri: 'data:image/jpeg;base64,AAAA',
          alt: 'Bad image',
          caption: null,
        },
      ],
    },
    source,
    { lockedSubject: 'Botany' },
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.errors.join('\n'), /has an invalid data URI/);
  }
});

test('actual JSON import normalization accepts the biology image file', () => {
  const bank = JSON.parse(fs.readFileSync('C:/Users/SAI/Downloads/oinkie_biology_image_import_test.json', 'utf8'));
  const extracted = extractQuestionBankImport(bank, {
    sourceId: 'botany',
    table: 'botany_questions',
  });

  assert.equal(extracted.ok, true);
  if (!extracted.ok) return;

  const source = getQuestionBankSource('botany');
  assert.ok(source);

  const normalized = extracted.value.questions.map((question) =>
    normalizeQuestionInput(question, source, { lockedSubject: 'Botany' }),
  );

  assert.equal(normalized.every((result) => result.ok), true);
  const first = normalized[0];
  assert.ok(first && first.ok);
  if (first && first.ok) {
    const image = (first.payload.images as Array<Record<string, unknown>>)[0];
    assert.equal(image.type, 'question');
    assert.equal(image.mimeType, 'image/png');
    assert.match(String(image.dataUri), /^data:image\/png;base64,/);
    assert.equal(image.dataUri, bank.questions[0].images[0].dataUri);
  }
});
