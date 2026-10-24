import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AdminPanel } from '../src/admin/AdminPanel';
import {
  DASHBOARD_CONTENT_ACTIONS,
  DASHBOARD_CONTENT_ACTION_LABELS,
  isSafeHttpUrl,
  isYoutubeUrl,
} from '../src/admin/dashboardContent';
import { QuestionBankManager } from '../src/admin/QuestionBankManager';
import { QuestionBankQuestionForm } from '../src/admin/QuestionBankQuestionForm';
import { QuestionBankImportPanel } from '../src/admin/QuestionBankImportPanel';
import { createEmptyQuestionDraft } from '../src/questionBanks/questionInput';
import { getQuestionBankSource } from '../src/questionBanks/sourceRegistry';

test('admin content accepts only safe http links and https YouTube links', () => {
  assert.equal(isSafeHttpUrl('https://example.com/resource'), true);
  assert.equal(isSafeHttpUrl('http://example.com/resource'), true);
  assert.equal(isSafeHttpUrl('javascript:alert(1)'), false);
  assert.equal(isSafeHttpUrl('not a url'), false);

  assert.equal(isYoutubeUrl('https://www.youtube.com/watch?v=abc123'), true);
  assert.equal(isYoutubeUrl('https://youtube.com/playlist?list=abc123'), true);
  assert.equal(isYoutubeUrl('https://youtu.be/abc123'), true);
  assert.equal(isYoutubeUrl('http://www.youtube.com/watch?v=abc123'), false);
  assert.equal(isYoutubeUrl('https://example.com/watch?v=abc123'), false);
});

test('admin action metadata covers every action allowed by the database contract', () => {
  const uniqueActions = new Set(DASHBOARD_CONTENT_ACTIONS);
  assert.equal(uniqueActions.size, DASHBOARD_CONTENT_ACTIONS.length);
  for (const action of DASHBOARD_CONTENT_ACTIONS) {
    assert.ok(DASHBOARD_CONTENT_ACTION_LABELS[action], `missing label for ${action}`);
  }
});

test('admin panel exposes each managed content section and the unified question-bank manager', () => {
  const markup = renderToStaticMarkup(React.createElement(AdminPanel, { onBack: () => {} }));
  assert.match(markup, /Admin Controls/);
  assert.match(markup, /Quick Actions/);
  assert.match(markup, /Notifications/);
  assert.match(markup, /Quick Links/);
  assert.match(markup, /YouTube Resources/);
  assert.match(markup, /Question Banks/);
  assert.match(markup, /Loading admin content/);
});

test('question-bank manager starts with exactly five primary section buttons and keeps General/Archive secondary', () => {
  const markup = renderToStaticMarkup(React.createElement(QuestionBankManager));
  assert.match(markup, /Question Bank Manager/);
  assert.match(markup, /5 primary sections/);

  const primarySections = [...markup.matchAll(/data-primary-section="([^"]+)"/g)]
    .map((match) => match[1]);
  assert.deepEqual(primarySections, ['physics', 'chemistry', 'botany', 'zoology', 'pyqs']);
  assert.match(markup, /Physics/);
  assert.match(markup, /Chemistry/);
  assert.match(markup, /Botany/);
  assert.match(markup, /Zoology/);
  assert.match(markup, /PYQs/);
  assert.match(markup, /physics_questions/);
  assert.match(markup, /chemistry_questions/);
  assert.match(markup, /botany_questions/);
  assert.match(markup, /Other registered banks/);
  assert.match(markup, /data-secondary-source="general"/);
  assert.match(markup, /data-secondary-source="archive"/);
  assert.doesNotMatch(markup, /Selected destination/);
});

test('Botany section exposes its locked Biology route, CRUD list, and paired import/export controls', () => {
  const markup = renderToStaticMarkup(React.createElement(QuestionBankManager, {
    initialSectionId: 'botany',
  }));
  assert.match(markup, /Back to all sections/);
  assert.match(markup, /Questions in Botany/);
  assert.match(markup, /botany_questions/);
  assert.match(markup, /no subject column/);
  assert.match(markup, /Add question/);
  assert.match(markup, /Search question text or code/);
  assert.match(markup, /Answer status/);
  assert.match(markup, /Language availability/);
  assert.match(markup, /Import JSON/);
  assert.match(markup, /Download JSON Template/);
  assert.match(markup, /Maximum 1,000/);
});

test('PYQs section is active and exposes write and import controls', () => {
  const markup = renderToStaticMarkup(React.createElement(QuestionBankManager, {
    initialSectionId: 'pyqs',
  }));
  assert.match(markup, /Back to all sections/);
  assert.match(markup, /pyq_questions/);
});

test('remote question form previews valid embedded and stored image references', () => {
  const source = getQuestionBankSource('physics');
  assert.ok(source);
  const draft = createEmptyQuestionDraft('physics');
  draft.images = JSON.stringify([
    {
      id: 'figure',
      type: 'question',
      mimeType: 'image/png',
      dataUri: 'data:image/png;base64,AAAA',
      alt: 'Question figure',
      caption: 'Worked figure',
    },
    {
      id: 'option-a',
      type: 'option',
      mimeType: 'image/png',
      src: 'https://example.test/option.png',
      alt: 'Option A figure',
      caption: null,
      option: 'A',
    },
  ]);

  const markup = renderToStaticMarkup(React.createElement(QuestionBankQuestionForm, {
    source,
    section: null,
    lockedSubject: null,
    draft,
    editingId: null,
    isSaving: false,
    issues: [],
    onChange: () => {},
    onSubmit: () => {},
    onCancel: () => {},
  }));

  assert.match(markup, /Image preview/);
  assert.match(markup, /src="data:image\/png;base64,AAAA"/);
  assert.match(markup, /src="https:\/\/example\.test\/option\.png"/);
  assert.match(markup, /Question figure/);
  assert.match(markup, /Worked figure/);
});

test('remote question form reports invalid image JSON without crashing', () => {
  const source = getQuestionBankSource('physics');
  assert.ok(source);
  const draft = createEmptyQuestionDraft('physics');
  draft.images = '{not valid json';

  const markup = renderToStaticMarkup(React.createElement(QuestionBankQuestionForm, {
    source,
    section: null,
    lockedSubject: null,
    draft,
    editingId: null,
    isSaving: false,
    issues: [],
    onChange: () => {},
    onSubmit: () => {},
    onCancel: () => {},
  }));

  assert.match(markup, /Image preview unavailable/);
  assert.doesNotMatch(markup, /<img/);
});


test('import preview renders an embedded image beside the sample question', () => {
  const source = getQuestionBankSource('botany');
  assert.ok(source);

  const markup = renderToStaticMarkup(React.createElement(QuestionBankImportPanel, {
    source,
    section: null,
    lockedSubject: null,
    preview: {
      fileName: 'oinkie_biology_image_import_test.json',
      format: 'legacy-bank',
      validCount: 1,
      invalid: [],
      warnings: [],
      tooMany: false,
      sample: 'In a typical angiosperm ovule, which structure contains the megaspore mother cell?',
      images: [
        {
          id: 'uploaded-classroom-image',
          type: 'question',
          mimeType: 'image/png',
          dataUri: 'data:image/png;base64,AAAA',
          alt: 'Biology classroom scene',
          caption: 'Biology reference image',
        },
      ],
    },
    importError: '',
    result: null,
    isImporting: false,
    onFile: () => {},
    onCancelPreview: () => {},
    onConfirmImport: () => {},
    onDownloadTemplate: () => {},
  }));

  assert.match(markup, /Image preview/);
  assert.match(markup, /src="data:image\/png;base64,AAAA"/);
  assert.match(markup, /Biology classroom scene/);
});
