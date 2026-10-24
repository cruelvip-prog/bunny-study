import { AlertCircle, Database, Loader2, Save, X } from 'lucide-react';
import { useMemo } from 'react';
import type { FormEvent } from 'react';
import { QuestionImages } from '../components/QuestionImages';
import {
  parseRemoteQuestionImagePreview,
} from '../questionBanks/questionInput';
import type {
  QuestionBankAdminSectionDefinition,
  QuestionBankSourceDefinition,
  QuestionBankSubject,
} from '../questionBanks/sourceRegistry';
import type {
  QuestionBankOptionDraft,
  QuestionBankOptionLetter,
  QuestionBankQuestionDraft,
} from '../questionBanks/questionInput';

const inputClass =
  'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100';
const textareaClass = `${inputClass} min-h-24 resize-y`;
const labelClass = 'block text-xs font-bold text-slate-600';
const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-blue-800 disabled:opacity-60';
const secondaryButtonClass =
  'inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-60';

interface QuestionBankQuestionFormProps {
  source: QuestionBankSourceDefinition;
  section: QuestionBankAdminSectionDefinition | null;
  lockedSubject: QuestionBankSubject | null;
  draft: QuestionBankQuestionDraft;
  editingId: string | null;
  isSaving: boolean;
  issues: string[];
  onChange: (draft: QuestionBankQuestionDraft) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export function QuestionBankQuestionForm({
  source,
  section,
  lockedSubject,
  draft,
  editingId,
  isSaving,
  issues,
  onChange,
  onSubmit,
  onCancel,
}: QuestionBankQuestionFormProps) {
  const supports = (field: string) => source.fields.includes(field as never);
  const imagePreview = useMemo(() => parseRemoteQuestionImagePreview(draft.images), [draft.images]);
  const fixedSubject = lockedSubject ?? source.fixedSubject;
  const subjectLabel = source.subjectField === 'subject_area' ? 'Subject area' : 'Subject';

  const setField = <Key extends keyof QuestionBankQuestionDraft>(
    field: Key,
    value: QuestionBankQuestionDraft[Key],
  ) => {
    onChange({ ...draft, [field]: value });
  };

  const setOption = (
    letter: QuestionBankOptionLetter,
    language: keyof QuestionBankOptionDraft,
    value: string,
  ) => {
    onChange({
      ...draft,
      options: {
        ...draft.options,
        [letter]: {
          ...draft.options[letter],
          [language]: value,
        },
      },
    });
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <section className="rounded-2xl border border-blue-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-blue-700" />
            <h2 className="text-sm font-extrabold text-slate-900">
              {editingId ? 'Edit question' : 'Add question'}
            </h2>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Destination: <strong className="text-slate-700">{section?.label ?? source.label}</strong>{' '}
            <span className="font-mono text-[10px] text-slate-500">{source.table}</span>
            {section && section.subject && source.subjectField
              ? ` · ${source.subjectField} = ${section.subject}`
              : ''}.
            The selected section determines the project and table; the subject field cannot redirect the write.
          </p>
        </div>
        <button type="button" onClick={onCancel} disabled={isSaving} className={secondaryButtonClass}>
          <X className="h-3.5 w-3.5" /> Close form
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {supports('question_code') && (
            <label className={labelClass}>
              Question code
              <input
                value={draft.question_code}
                onChange={(event) => setField('question_code', event.target.value)}
                maxLength={160}
                className={inputClass}
                placeholder="e.g. PHY-2024-014"
              />
            </label>
          )}

          {source.subjectField ? (
            <label className={labelClass}>
              {subjectLabel}
              {fixedSubject ? (
                <>
                  <input
                    value={fixedSubject}
                    readOnly
                    disabled
                    className={`${inputClass} bg-slate-50 text-slate-500`}
                  />
                  <span className="mt-1 block text-[10px] font-medium text-slate-400">
                    Locked to <span className="font-mono">{source.subjectField} = {fixedSubject}</span> by
                    the {section?.label ?? source.label} destination.
                  </span>
                </>
              ) : (
                <>
                  <select
                    value={draft.subject}
                    onChange={(event) => setField('subject', event.target.value)}
                    className={inputClass}
                  >
                    <option value="">Choose a subject</option>
                    {source.subjects.map((subject) => (
                      <option key={subject} value={subject}>{subject}</option>
                    ))}
                  </select>
                  <span className="mt-1 block text-[10px] font-medium text-slate-400">
                    Stored in <span className="font-mono">{source.subjectField}</span>.
                  </span>
                </>
              )}
            </label>
          ) : (
            <div>
              <span className={labelClass}>Subject routing</span>
              <p className="mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
                The {source.label} table has no subject column. Questions are identified as{' '}
                {source.label} by the <span className="font-mono">{source.table}</span> destination, so no
                subject field is shown or submitted.
              </p>
            </div>
          )}

          <label className={labelClass}>
            Chapter <span className="text-rose-600">*</span>
            <input
              value={draft.chapter}
              onChange={(event) => setField('chapter', event.target.value)}
              maxLength={200}
              className={inputClass}
              placeholder="e.g. Laws of Motion"
            />
          </label>

          <label className={labelClass}>
            Topic
            <input
              value={draft.topic}
              onChange={(event) => setField('topic', event.target.value)}
              maxLength={200}
              className={inputClass}
              placeholder="e.g. Friction"
            />
          </label>

          <label className={labelClass}>
            Section
            <input
              value={draft.section}
              onChange={(event) => setField('section', event.target.value)}
              maxLength={200}
              className={inputClass}
              placeholder="e.g. Numerical"
            />
          </label>

          <label className={labelClass}>
            Exercise
            <input
              value={draft.exercise}
              onChange={(event) => setField('exercise', event.target.value)}
              maxLength={200}
              className={inputClass}
              placeholder="e.g. Practice sheet 2"
            />
          </label>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <label className={labelClass}>
            Question text — English
            <textarea
              value={draft.question_en}
              onChange={(event) => setField('question_en', event.target.value)}
              maxLength={100_000}
              className={`${textareaClass} min-h-32`}
              placeholder="English question text (optional when Hindi text is present)"
            />
          </label>
          <label className={labelClass}>
            Question text — Hindi
            <textarea
              value={draft.question_hi}
              onChange={(event) => setField('question_hi', event.target.value)}
              maxLength={100_000}
              className={`${textareaClass} min-h-32`}
              placeholder="हिन्दी प्रश्न (English or Hindi is required)"
            />
          </label>
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
              Answer options
            </h3>
            <p className="text-[10px] text-slate-400">
              Each option needs English or Hindi text. Empty Hindi is stored as null.
            </p>
          </div>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            {(['A', 'B', 'C', 'D'] as const).map((letter) => (
              <fieldset key={letter} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <legend className="px-1 text-xs font-extrabold text-slate-700">Option {letter}</legend>
                <label className={labelClass}>
                  English
                  <input
                    value={draft.options[letter].text_en}
                    onChange={(event) => setOption(letter, 'text_en', event.target.value)}
                    className={inputClass}
                    placeholder={`Option ${letter} in English`}
                  />
                </label>
                <label className={`${labelClass} mt-2`}>
                  Hindi
                  <input
                    value={draft.options[letter].text_hi}
                    onChange={(event) => setOption(letter, 'text_hi', event.target.value)}
                    className={inputClass}
                    placeholder={`विकल्प ${letter} हिन्दी में`}
                  />
                </label>
              </fieldset>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className={labelClass}>
            Answer key
            <select
              value={draft.answer_key}
              onChange={(event) => setField('answer_key', event.target.value)}
              className={inputClass}
            >
              <option value="">No answer key</option>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
              <option value="D">D</option>
            </select>
          </label>

          <label className={labelClass}>
            Answer-key source
            <input
              value={draft.answer_key_source}
              onChange={(event) => setField('answer_key_source', event.target.value)}
              maxLength={300}
              className={inputClass}
              placeholder="e.g. Official answer key, page 42"
            />
          </label>

          <label className={labelClass}>
            Difficulty
            <input
              value={draft.difficulty}
              onChange={(event) => setField('difficulty', event.target.value)}
              maxLength={60}
              className={inputClass}
              placeholder="e.g. easy, medium, hard"
              list="question-bank-difficulty-options"
            />
            <datalist id="question-bank-difficulty-options">
              <option value="easy" />
              <option value="medium" />
              <option value="hard" />
            </datalist>
          </label>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <label className={labelClass}>
            Explanation — English
            <textarea
              value={draft.explanation_en}
              onChange={(event) => setField('explanation_en', event.target.value)}
              maxLength={100_000}
              className={textareaClass}
              placeholder="English explanation (optional)"
            />
          </label>
          <label className={labelClass}>
            Explanation — Hindi
            <textarea
              value={draft.explanation_hi}
              onChange={(event) => setField('explanation_hi', event.target.value)}
              maxLength={100_000}
              className={textareaClass}
              placeholder="हिन्दी व्याख्या (optional)"
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className={`${labelClass} lg:col-span-2`}>
            Source PDF
            <input
              value={draft.source_pdf}
              onChange={(event) => setField('source_pdf', event.target.value)}
              maxLength={400}
              className={inputClass}
              placeholder="e.g. NEET-2024-Paper.pdf"
            />
          </label>

          <label className={labelClass}>
            Source page
            <input
              type="number"
              min="1"
              step="1"
              value={draft.source_page}
              onChange={(event) => setField('source_page', event.target.value)}
              className={inputClass}
              placeholder="e.g. 12"
            />
          </label>

          <label className={labelClass}>
            Tags
            <input
              value={draft.tags}
              onChange={(event) => setField('tags', event.target.value)}
              maxLength={720}
              className={inputClass}
              placeholder="comma-separated"
            />
          </label>
        </div>

        {supports('exam_name') && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className={labelClass}>
              Exam name
              <input value={draft.exam_name} onChange={(event) => setField('exam_name', event.target.value)} maxLength={120} className={inputClass} placeholder="e.g. NEET UG" />
            </label>
            <label className={labelClass}>
              Exam year
              <input type="number" min="1900" max="9999" value={draft.exam_year} onChange={(event) => setField('exam_year', event.target.value)} className={inputClass} placeholder="e.g. 2024" />
            </label>
            <label className={labelClass}>
              Paper session
              <input value={draft.paper_session} onChange={(event) => setField('paper_session', event.target.value)} maxLength={120} className={inputClass} placeholder="e.g. Phase 1" />
            </label>
            <label className={labelClass}>
              Paper title
              <input value={draft.paper_title} onChange={(event) => setField('paper_title', event.target.value)} maxLength={200} className={inputClass} placeholder="e.g. NEET UG 2024" />
            </label>
            <label className={labelClass}>
              Verification status
              <input value={draft.verification_status} onChange={(event) => setField('verification_status', event.target.value)} maxLength={40} className={inputClass} placeholder="unverified" />
            </label>
          </div>
        )}

        {issues.length > 0 && (
          <div
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800"
          >
            <p className="flex items-center gap-2 font-bold">
              <AlertCircle className="h-4 w-4" /> Fix {issues.length} item{issues.length === 1 ? '' : 's'} before saving
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {issues.map((issue, index) => <li key={`${issue}-${index}`}>{issue}</li>)}
            </ul>
          </div>
        )}

        {supports('images') && (
          <>
            <label className={labelClass}>
            Images (JSON array)
            <textarea
              value={draft.images}
              onChange={(event) => setField('images', event.target.value)}
              className={`${textareaClass} min-h-24 font-mono text-xs`}
              placeholder='[{"id":"figure","type":"question","mimeType":"image/png","dataUri":"data:image/png;base64,...","alt":"Figure","caption":null}]'
            />
            <span className="mt-1 block text-[10px] font-medium text-slate-400">
              Store image metadata as JSON. Embedded data URIs are uploaded to the configured image bucket by the trusted server API.
            </span>
          </label>
          {imagePreview.error && (
            <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {imagePreview.error}
            </p>
          )}
          {imagePreview.images.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Image preview</p>
              {imagePreview.images.some((image) => image.type === 'question') && (
                <div className="mt-2">
                  <p className="text-[10px] font-semibold text-slate-600">Question images</p>
                  <QuestionImages images={imagePreview.images} type="question" />
                </div>
              )}
              {imagePreview.images.some((image) => image.type === 'option') && (
                <div className="mt-2 space-y-2">
                  <p className="text-[10px] font-semibold text-slate-600">Option images</p>
                  {(['A', 'B', 'C', 'D'] as const).map((letter) =>
                    imagePreview.images.some((image) => image.type === 'option' && image.option === letter) ? (
                      <div key={letter}>
                        <p className="text-[10px] font-medium text-slate-500">Option {letter}</p>
                        <QuestionImages images={imagePreview.images} type="option" option={letter} />
                      </div>
                    ) : null,
                  )}
                </div>
              )}
              {imagePreview.images.some((image) => image.type === 'explanation') && (
                <div className="mt-2">
                  <p className="text-[10px] font-semibold text-slate-600">Explanation images</p>
                  <QuestionImages images={imagePreview.images} type="explanation" />
                </div>
              )}
            </div>
          )}
          </>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
          <button type="submit" disabled={isSaving} className={primaryButtonClass}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isSaving ? 'Saving...' : editingId ? 'Save question' : 'Create question'}
          </button>
          <button type="button" onClick={onCancel} disabled={isSaving} className={secondaryButtonClass}>
            Cancel
          </button>
          <span className="text-[11px] text-slate-400">
            Saving sends the payload only through the trusted server API.
          </span>
        </div>
      </form>
    </section>
  );
}
