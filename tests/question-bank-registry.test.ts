import assert from 'node:assert/strict';
import test from 'node:test';
import {
  QUESTION_BANK_ADMIN_SECTIONS,
  QUESTION_BANK_OTHER_SOURCE_IDS,
  QUESTION_BANK_PRIMARY_SECTION_IDS,
  QUESTION_BANK_SOURCES,
  QUESTION_BANK_SOURCE_IDS,
  getQuestionBankAdminSection,
  getQuestionBankAdminSectionSource,
  getQuestionBankSource,
  getQuestionBankSourceSubjects,
  isQuestionBankAdminSectionId,
  isQuestionBankSourceId,
  requireQuestionBankAdminSection,
  requireQuestionBankSource,
} from '../src/questionBanks/sourceRegistry';

test('preserves all registered source IDs, projects, labels, and tables', () => {
  assert.deepEqual(QUESTION_BANK_SOURCE_IDS, [
    'physics',
    'biology',
    'botany',
    'zoology',
    'pyq',
    'chemistry',
    'general',
    'archive',
  ]);
  assert.equal(QUESTION_BANK_SOURCES.length, 8);

  const mappings = Object.fromEntries(
    QUESTION_BANK_SOURCES.map((source) => [source.id, {
      label: source.label,
      table: source.table,
      subjects: [...source.subjects],
      envUrl: source.publicEnvironment.url,
      envKey: source.publicEnvironment.publishableKey,
      serverUrl: source.serverEnvironment.url,
      serverKey: source.serverEnvironment.serviceRoleKey,
    }]),
  );

  assert.deepEqual(mappings.physics, {
    label: 'Physics project',
    table: 'physics_questions',
    subjects: ['Physics'],
    envUrl: 'VITE_SUPABASE_PHYSICS_URL',
    envKey: 'VITE_SUPABASE_PHYSICS_PUBLISHABLE_KEY',
    serverUrl: 'OINKIE_PHYSICS_SUPABASE_URL',
    serverKey: 'OINKIE_PHYSICS_SUPABASE_SERVICE_ROLE_KEY',
  });
  assert.deepEqual(mappings.biology, {
    label: 'Biology project',
    table: 'biology_questions',
    subjects: ['Botany', 'Zoology'],
    envUrl: 'VITE_SUPABASE_BIOLOGY_URL',
    envKey: 'VITE_SUPABASE_BIOLOGY_PUBLISHABLE_KEY',
    serverUrl: 'OINKIE_BIOLOGY_SUPABASE_URL',
    serverKey: 'OINKIE_BIOLOGY_SUPABASE_SERVICE_ROLE_KEY',
  });
  assert.deepEqual(mappings.botany, {
    label: 'Botany project',
    table: 'botany_questions',
    subjects: ['Botany'],
    envUrl: 'VITE_SUPABASE_BIOLOGY_URL',
    envKey: 'VITE_SUPABASE_BIOLOGY_PUBLISHABLE_KEY',
    serverUrl: 'OINKIE_BIOLOGY_SUPABASE_URL',
    serverKey: 'OINKIE_BIOLOGY_SUPABASE_SERVICE_ROLE_KEY',
  });
  assert.deepEqual(mappings.zoology, {
    label: 'Zoology project',
    table: 'zoology_questions',
    subjects: ['Zoology'],
    envUrl: 'VITE_SUPABASE_BIOLOGY_URL',
    envKey: 'VITE_SUPABASE_BIOLOGY_PUBLISHABLE_KEY',
    serverUrl: 'OINKIE_BIOLOGY_SUPABASE_URL',
    serverKey: 'OINKIE_BIOLOGY_SUPABASE_SERVICE_ROLE_KEY',
  });
  assert.deepEqual(mappings.chemistry, {
    label: 'OINKIE Chemistry Bank',
    table: 'chemistry_questions',
    subjects: ['Chemistry'],
    envUrl: 'VITE_SUPABASE_CHEMISTRY_URL',
    envKey: 'VITE_SUPABASE_CHEMISTRY_PUBLISHABLE_KEY',
    serverUrl: 'OINKIE_CHEMISTRY_SUPABASE_URL',
    serverKey: 'OINKIE_CHEMISTRY_SUPABASE_SERVICE_ROLE_KEY',
  });
  assert.deepEqual(mappings.general, {
    label: 'General question bank',
    table: 'question_bank',
    subjects: ['Physics', 'Chemistry', 'Botany', 'Zoology'],
    envUrl: 'VITE_SUPABASE_GENERAL_URL',
    envKey: 'VITE_SUPABASE_GENERAL_PUBLISHABLE_KEY',
    serverUrl: 'OINKIE_GENERAL_SUPABASE_URL',
    serverKey: 'OINKIE_GENERAL_SUPABASE_SERVICE_ROLE_KEY',
  });
  assert.deepEqual(mappings.archive, {
    label: 'Question-bank archive',
    table: 'question_bank_archive',
    subjects: ['Physics', 'Chemistry', 'Botany', 'Zoology'],
    envUrl: 'VITE_SUPABASE_ARCHIVE_URL',
    envKey: 'VITE_SUPABASE_ARCHIVE_PUBLISHABLE_KEY',
    serverUrl: 'OINKIE_ARCHIVE_SUPABASE_URL',
    serverKey: 'OINKIE_ARCHIVE_SUPABASE_SERVICE_ROLE_KEY',
  });
});

test('registry declares the source-specific subject contract and admin capabilities', () => {
  const physics = requireQuestionBankSource('physics');
  const biology = requireQuestionBankSource('biology');
  const chemistry = requireQuestionBankSource('chemistry');

  assert.equal(physics.subjectField, null);
  assert.equal(physics.fixedSubject, 'Physics');
  assert.equal(biology.subjectField, 'subject_area');
  assert.equal(biology.fixedSubject, null);
  assert.equal(chemistry.subjectField, 'subject');
  assert.equal(chemistry.fixedSubject, 'Chemistry');
  assert.equal(chemistry.idKind, 'uuid');

  for (const source of QUESTION_BANK_SOURCES) {
    assert.equal(source.capabilities.publicRead, true);
    assert.equal(source.capabilities.adminRead, true);
    assert.equal(source.capabilities.adminCreate, true);
    assert.equal(source.capabilities.adminUpdate, true);
    assert.equal(source.capabilities.adminDelete, true);
    assert.equal(source.capabilities.adminImport, true);
    assert.ok(source.fields.includes('question_en'));
    assert.ok(source.fields.includes('options'));
    assert.ok(source.fields.includes('source_page'));
  }
});

test('declares exactly five primary admin sections with source-correct subject locks', () => {
  assert.deepEqual(QUESTION_BANK_PRIMARY_SECTION_IDS, [
    'physics',
    'chemistry',
    'botany',
    'zoology',
    'pyqs',
  ]);
  assert.equal(QUESTION_BANK_ADMIN_SECTIONS.length, 5);
  assert.deepEqual([...QUESTION_BANK_OTHER_SOURCE_IDS], ['biology', 'general', 'archive']);

  const mappings = QUESTION_BANK_ADMIN_SECTIONS.map((section) => ({
    id: section.id,
    label: section.label,
    source: section.sourceId,
    table: sourceSectionTable(section.id),
    subject: section.subject,
    setupRequired: Boolean(section.setupRequired),
  }));
  assert.deepEqual(mappings, [
    { id: 'physics', label: 'Physics', source: 'physics', table: 'physics_questions', subject: 'Physics', setupRequired: false },
    { id: 'chemistry', label: 'Chemistry', source: 'chemistry', table: 'chemistry_questions', subject: 'Chemistry', setupRequired: false },
    { id: 'botany', label: 'Botany', source: 'botany', table: 'botany_questions', subject: 'Botany', setupRequired: false },
    { id: 'zoology', label: 'Zoology', source: 'zoology', table: 'zoology_questions', subject: 'Zoology', setupRequired: false },
    { id: 'pyqs', label: 'PYQs', source: 'pyq', table: 'pyq_questions', subject: null, setupRequired: false },
  ]);

  assert.equal(getQuestionBankAdminSectionSource('physics')?.id, 'physics');
  assert.equal(getQuestionBankAdminSectionSource('botany')?.id, 'botany');
  assert.equal(getQuestionBankAdminSectionSource('zoology')?.id, 'zoology');
  assert.equal(getQuestionBankAdminSectionSource('biology'), null);
  assert.equal(getQuestionBankAdminSectionSource('pyqs')?.id, 'pyq');
  assert.equal(isQuestionBankAdminSectionId('general'), false);
  assert.equal(getQuestionBankAdminSection('archive'), null);
  assert.throws(() => requireQuestionBankAdminSection('general'), /Unknown question-bank admin section/);
});

function sourceSectionTable(sectionId: Parameters<typeof getQuestionBankAdminSectionSource>[0]): string | null {
  return getQuestionBankAdminSectionSource(sectionId)?.table ?? null;
}

test('source lookup fails closed and never resolves an unregistered or fallback table', () => {
  assert.equal(getQuestionBankSource('chemistry')?.table, 'chemistry_questions');
  assert.equal(getQuestionBankSource('not-a-source'), null);
  assert.equal(getQuestionBankSource(undefined), null);
  assert.equal(isQuestionBankSourceId('archive'), true);
  assert.equal(isQuestionBankSourceId('question_bank'), false);
  assert.throws(() => requireQuestionBankSource('missing'), /Unknown question-bank source/);
  assert.deepEqual(getQuestionBankSourceSubjects('chemistry'), ['Chemistry']);

  const tables = QUESTION_BANK_SOURCES.map((source) => source.table);
  assert.equal(new Set(tables).size, tables.length);
});
