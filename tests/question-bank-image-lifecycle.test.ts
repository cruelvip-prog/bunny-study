import assert from 'node:assert/strict';
import test from 'node:test';
import { getQuestionBankSource } from '../src/questionBanks/sourceRegistry';
import { normalizeQuestionInput } from '../src/questionBanks/questionInput';
import { mapRemoteQuestionRow } from '../src/utils/remoteQuestionBank';
import { uploadRemoteQuestionImages } from '../server/questionBankRepository';

const tinyPngDataUri =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aWQAAAAASUVORK5CYII=';

test('remote-loaded question preserves an embedded dataUri image', () => {
  const row = {
    id: 'remote-1',
    subject: 'Physics',
    question_en: 'Question',
    question_hi: null,
    options: { A: { text_en: 'A', text_hi: null }, B: { text_en: 'B', text_hi: null }, C: { text_en: 'C', text_hi: null }, D: { text_en: 'D', text_hi: null } },
    answer_key: 'A',
    chapter: 'C',
    topic: 'T',
    images: [{ id: 'diagram', type: 'question', mimeType: 'image/png', dataUri: tinyPngDataUri, alt: 'Diagram', caption: null }],
  };
  const question = mapRemoteQuestionRow(row, 'physics', 1);
  assert.equal(question.images?.[0].dataUri, tinyPngDataUri);
});

test('remote-loaded question preserves a persisted image URL', () => {
  const row = {
    id: 'remote-2',
    subject: 'Physics',
    question_en: 'Question',
    question_hi: null,
    options: { A: { text_en: 'A', text_hi: null }, B: { text_en: 'B', text_hi: null }, C: { text_en: 'C', text_hi: null }, D: { text_en: 'D', text_hi: null } },
    answer_key: 'A',
    chapter: 'C',
    topic: 'T',
    images: JSON.stringify([{ id: 'diagram', type: 'question', mimeType: 'image/png', src: 'https://example.com/diagram.png', alt: 'Diagram', caption: null }]),
  };
  const question = mapRemoteQuestionRow(row, 'physics', 1);
  assert.equal(question.images?.[0].src, 'https://example.com/diagram.png');
});

test('remote image mapping supports option and explanation images', () => {
  const row = {
    id: 'remote-3',
    subject: 'Physics',
    question_en: 'Question',
    question_hi: null,
    options: { A: { text_en: 'A', text_hi: null }, B: { text_en: 'B', text_hi: null }, C: { text_en: 'C', text_hi: null }, D: { text_en: 'D', text_hi: null } },
    answer_key: 'A',
    chapter: 'C',
    topic: 'T',
    images: [
      { id: 'opt-a', type: 'option', mimeType: 'image/png', src: 'https://example.com/a.png', alt: 'A', caption: null, option: 'A' },
      { id: 'exp', type: 'explanation', mimeType: 'image/png', src: 'https://example.com/e.png', alt: 'E', caption: null },
    ],
  };
  const question = mapRemoteQuestionRow(row, 'physics', 1);
  assert.equal(question.images?.filter((image) => image.type === 'option' && image.option === 'A').length, 1);
  assert.equal(question.images?.some((image) => image.type === 'explanation'), true);
});

test('normalization preserves images for all four subjects', () => {
  for (const subject of ['physics', 'chemistry', 'botany', 'zoology'] as const) {
    const source = getQuestionBankSource(subject === 'physics' ? 'physics' : subject === 'chemistry' ? 'chemistry' : subject === 'botany' ? 'botany' : 'zoology');
    assert.ok(source);
    const lockedSubject = subject === 'physics' ? 'Physics' : subject === 'chemistry' ? 'Chemistry' : subject === 'botany' ? 'Botany' : 'Zoology';
    const result = normalizeQuestionInput({
      chapter: 'C',
      question_en: 'Q',
      options: { A: { text_en: 'a', text_hi: null }, B: { text_en: 'b', text_hi: null }, C: { text_en: 'c', text_hi: null }, D: { text_en: 'd', text_hi: null } },
      images: [{ id: 'img', type: 'question', mimeType: 'image/png', dataUri: tinyPngDataUri, alt: 'alt', caption: null }],
    }, source, { lockedSubject } as any);
    assert.equal(result.ok, true, subject);
    if (result.ok) {
      assert.equal((result.payload.images as any[])[0].dataUri, tinyPngDataUri);
    }
  }
});