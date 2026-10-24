import assert from 'node:assert/strict';
import test from 'node:test';

import { getQuestionBankSource } from '../src/questionBanks/sourceRegistry';
import { uploadRemoteQuestionImages } from '../server/questionBankRepository';

test('uploads embedded images to deterministic paths and reuses them on retry', async () => {
  const source = getQuestionBankSource('physics');
  assert.ok(source);

  const uploads: Array<{ bucket: string; path: string; options: { upsert?: boolean } }> = [];
  const client = {
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, _bytes: Uint8Array, options: { upsert?: boolean }) => {
          uploads.push({ bucket, path, options });
          return { data: { path }, error: null };
        },
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://example.test/storage/v1/object/public/question-bank-images/${path}` },
        }),
      }),
    },
  } as any;

  const images = [
    {
      id: 'figure',
      type: 'question',
      mimeType: 'image/png',
      dataUri: 'data:image/png;base64,AAAA',
      alt: 'Figure',
      caption: null,
    },
  ];

  const first = await uploadRemoteQuestionImages(client as any, source, images);
  const second = await uploadRemoteQuestionImages(client as any, source, images);

  assert.equal(uploads.length, 2);
  assert.equal(uploads[0].bucket, 'question-bank-images');
  assert.equal(uploads[0].path, uploads[1].path);
  assert.equal(uploads[0].options.upsert, true);
  assert.match(uploads[0].path, /^physics_questions\/figure\/[0-9a-f]{64}\.png$/);

  assert.equal((first[0] as any).dataUri, undefined);
  assert.equal((first[0] as any).src, (second[0] as any).src);
  assert.equal((first[0] as any).src, `https://example.test/storage/v1/object/public/question-bank-images/${uploads[0].path}`);
});

test('preserves image references that are already stored as URLs', async () => {
  const source = getQuestionBankSource('physics');
  assert.ok(source);

  const client = {
    storage: {
      from: () => ({
        upload: async () => {
          throw new Error('upload should not be called');
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: path } }),
      }),
    },
  } as any;

  const images = [
    {
      id: 'external',
      type: 'question',
      mimeType: 'image/png',
      src: 'https://example.test/existing.png',
      alt: 'Existing',
      caption: null,
    },
  ];

  const result = await uploadRemoteQuestionImages(client as any, source, images);
  assert.deepEqual(result, images);
});

test('rejects malformed embedded image data URIs without uploading', async () => {
  const source = getQuestionBankSource('physics');
  assert.ok(source);

  const client = {
    storage: {
      from: () => ({
        upload: async () => {
          throw new Error('upload should not be called');
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: path } }),
      }),
    },
  } as any;

  await assert.rejects(
    uploadRemoteQuestionImages(client as any, source, [
      {
        id: 'bad',
        type: 'question',
        mimeType: 'image/png',
        dataUri: 'data:image/png;base64,not-base64!',
        alt: 'Bad',
        caption: null,
      },
    ]),
    /invalid data URI/,
  );
});
