import assert from 'node:assert/strict';
import test from 'node:test';
import { extractQuestionBankImport } from '../src/questionBanks/importQuestions';
import { normalizeQuestionInput } from '../src/questionBanks/questionInput';
import {
  QUESTION_BANK_TEMPLATE_FORMAT,
  QUESTION_BANK_TEMPLATE_SCHEMA_VERSION,
  buildQuestionBankTemplate,
  questionBankTemplateFileName,
} from '../src/questionBanks/questionTemplate';
import {
  QUESTION_BANK_ADMIN_SECTIONS,
  requireQuestionBankAdminSection,
  requireQuestionBankSource,
} from '../src/questionBanks/sourceRegistry';

test('every configured primary section template passes the real importer and validator', () => {
  for (const section of QUESTION_BANK_ADMIN_SECTIONS) {
    const source = section.sourceId ? requireQuestionBankSource(section.sourceId) : null;
    if (!source) {
      assert.equal(section.id, 'pyqs');
      assert.ok(section.setupRequired);
      continue;
    }

    const template = buildQuestionBankTemplate(source, {
      section,
      subjectLock: section.subject,
    });
    const serialized = JSON.parse(JSON.stringify(template)) as Record<string, unknown>;
    assert.equal(serialized.format, QUESTION_BANK_TEMPLATE_FORMAT);
    assert.equal(serialized.schema_version, QUESTION_BANK_TEMPLATE_SCHEMA_VERSION);

    const extracted = extractQuestionBankImport(serialized, {
      sectionId: section.id,
      sourceId: source.id,
      table: source.table,
    });
    assert.equal(extracted.ok, true, `${section.label} template extraction failed`);
    if (!extracted.ok) continue;
    assert.equal(extracted.value.format, 'admin-template');
    assert.equal(extracted.value.questions.length, 1);

    const normalized = normalizeQuestionInput(
      extracted.value.questions[0],
      source,
      { lockedSubject: section.subject },
    );
    assert.equal(normalized.ok, true, `${section.label} template normalization failed`);
    if (!normalized.ok) continue;

    if (source.subjectField) {
      assert.equal(normalized.payload[source.subjectField], section.subject ?? source.subjects[0]);
    } else {
      assert.equal('subject' in normalized.payload, false);
    }

    const sample = template.questions[0] as Record<string, unknown>;
    assert.ok(typeof sample.question_en === 'string' && sample.question_en.trim());
    assert.ok(typeof sample.question_hi === 'string' && sample.question_hi.trim());
    assert.deepEqual(Object.keys(sample.options as Record<string, unknown>).sort(), ['A', 'B', 'C', 'D']);
    assert.equal(sample.answer_key, 'A');
    assert.ok(Array.isArray(sample.tags));
    assert.equal(template.destination.source, source.id);
    assert.equal(template.destination.table, source.table);
    assert.match(template.documentation.images, /supported/i);
    assert.match(questionBankTemplateFileName(source, section), new RegExp(`^oinkie-${section.id}-`));
  }
});

test('source-specific templates contain the correct routing values, never another default source', () => {
  const chemistrySection = requireQuestionBankAdminSection('chemistry');
  const chemistrySource = requireQuestionBankSource('chemistry');
  const chemistry = buildQuestionBankTemplate(chemistrySource, {
    section: chemistrySection,
    subjectLock: chemistrySection.subject,
  });
  assert.equal(chemistry.destination.source, 'chemistry');
  assert.equal(chemistry.destination.table, 'chemistry_questions');
  assert.equal(chemistry.destination.subject_field, 'subject');
  assert.equal(chemistry.destination.subject, 'Chemistry');
  assert.equal(chemistry.destination.id_kind, 'uuid');
  assert.equal((chemistry.questions[0] as Record<string, unknown>).subject, 'Chemistry');

  const botanySection = requireQuestionBankAdminSection('botany');
  const biologySource = requireQuestionBankSource('biology');
  const botany = buildQuestionBankTemplate(biologySource, {
    section: botanySection,
    subjectLock: botanySection.subject,
  });
  assert.equal(botany.destination.source, 'biology');
  assert.equal(botany.destination.subject_field, 'subject_area');
  assert.equal(botany.destination.subject, 'Botany');
  assert.equal((botany.questions[0] as Record<string, unknown>).subject_area, 'Botany');

  const zoologySection = requireQuestionBankAdminSection('zoology');
  const zoology = buildQuestionBankTemplate(biologySource, {
    section: zoologySection,
    subjectLock: zoologySection.subject,
  });
  assert.equal(zoology.destination.subject, 'Zoology');
  assert.equal((zoology.questions[0] as Record<string, unknown>).subject_area, 'Zoology');

  const physicsSection = requireQuestionBankAdminSection('physics');
  const physicsSource = requireQuestionBankSource('physics');
  const physics = buildQuestionBankTemplate(physicsSource, {
    section: physicsSection,
    subjectLock: physicsSection.subject,
  });
  assert.equal(physics.destination.source, 'physics');
  assert.equal(physics.destination.table, 'physics_questions');
  assert.equal(physics.destination.subject_field, null);
  assert.equal('subject' in (physics.questions[0] as Record<string, unknown>), false);

  const generalSource = requireQuestionBankSource('general');
  const general = buildQuestionBankTemplate(generalSource);
  const generalSample = general.questions[0] as Record<string, unknown>;
  assert.equal(general.section, null);
  assert.equal(general.destination.subject, null);
  assert.equal(generalSample.subject, 'Physics');
  assert.match(general.documentation.subject_routing, /does not apply a fixed subject lock/i);
  const extracted = extractQuestionBankImport(general, {
    sectionId: null,
    sourceId: 'general',
    table: 'question_bank',
  });
  assert.equal(extracted.ok, true);
  if (extracted.ok) {
    assert.equal(extracted.value.format, 'admin-template');
    assert.equal(normalizeQuestionInput(extracted.value.questions[0], generalSource).ok, true);
  }
});

test('admin template destination and schema mismatches are rejected before preview', () => {
  const botanySection = requireQuestionBankAdminSection('botany');
  const zoologySection = requireQuestionBankAdminSection('zoology');
  const biologySource = requireQuestionBankSource('biology');
  const botanyTemplate = buildQuestionBankTemplate(biologySource, {
    section: botanySection,
    subjectLock: botanySection.subject,
  });

  assert.equal(extractQuestionBankImport(botanyTemplate).ok, true);

  const wrongSection = extractQuestionBankImport(botanyTemplate, {
    sectionId: zoologySection.id,
    sourceId: biologySource.id,
    table: biologySource.table,
  });
  assert.equal(wrongSection.ok, false);
  if (!wrongSection.ok) {
    assert.match(wrongSection.error, /botany section/i);
    assert.match(wrongSection.error, /No records were imported/);
  }

  const chemistrySource = requireQuestionBankSource('chemistry');
  const chemistrySection = requireQuestionBankAdminSection('chemistry');
  const chemistryTemplate = buildQuestionBankTemplate(chemistrySource, {
    section: chemistrySection,
    subjectLock: chemistrySection.subject,
  });
  const wrongSource = extractQuestionBankImport(chemistryTemplate, {
    sectionId: 'physics',
    sourceId: 'physics',
    table: 'physics_questions',
  });
  assert.equal(wrongSource.ok, false);
  if (!wrongSource.ok) assert.match(wrongSource.error, /targets chemistry/i);

  const wrongVersion = extractQuestionBankImport({
    ...botanyTemplate,
    schema_version: '2.0',
  });
  assert.equal(wrongVersion.ok, false);
  if (!wrongVersion.ok) assert.match(wrongVersion.error, /Unsupported OINKIE template schema_version/);
});
