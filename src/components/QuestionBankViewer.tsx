import React from 'react';
import { AlertTriangle, BookOpen } from 'lucide-react';
import { ExamQuestion, OptionLetter, QuestionStatus } from '../types/exam';
import { MathText } from './MathText';
import { QuestionLanguageView } from './QuestionLanguageView';
import { Bookmark, CheckCircle2, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';

interface QuestionBankViewerProps {
  question: ExamQuestion;
  questionNumber: number;
  totalQuestions: number;
  showManualReviewWarning?: boolean;
  selectedOption: OptionLetter | null;
  status: QuestionStatus;
  onSelectOption: (option: OptionLetter) => void;
  onSaveAndNext: () => void;
  onMarkForReviewAndNext: () => void;
  onClearResponse: () => void;
  onPrevious: () => void;
  onNext: () => void;
}

export const QuestionBankViewer: React.FC<QuestionBankViewerProps> = ({
  question,
  questionNumber,
  totalQuestions,
  showManualReviewWarning = true,
  selectedOption,
  status,
  onSelectOption,
  onSaveAndNext,
  onMarkForReviewAndNext,
  onClearResponse,
  onPrevious,
  onNext,
}) => (
  <section className="flex h-full min-h-0 flex-1 flex-col bg-slate-50 text-slate-800" aria-live="polite">
    <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-blue-700">
            <BookOpen className="h-4 w-4" aria-hidden="true" />
            Question {questionNumber} of {totalQuestions}
          </div>
          <p className="mt-2 text-sm font-semibold text-slate-800">
            {[question.subject, question.topic, question.section].filter(Boolean).join(' · ')}
          </p>
          {typeof question.schemaV2?.difficulty === 'string' && (
            <span className="mt-2 inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600">
              {question.schemaV2.difficulty}
            </span>
          )}
        </div>
        {question.sourcePage > 0 && (
          <span className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600">
            Source page {question.sourcePage}
          </span>
        )}
      </header>
      {showManualReviewWarning && question.reviewRequired && (
        <div role="status" className="flex gap-2 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <strong>Manual review required.</strong>
            {question.reviewFlags.length > 0 && <p className="mt-1">{question.reviewFlags.join('; ')}</p>}
            {question.missingContent.length > 0 && <p className="mt-1">Missing/uncertain: {question.missingContent.join('; ')}</p>}
          </div>
        </div>
      )}
      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <QuestionLanguageView
          question={question}
          selectedOption={selectedOption}
          onSelectOption={onSelectOption}
          afterOptions={
            <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-200 pt-4">
              <button type="button" onClick={onSaveAndNext} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-blue-700 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">
                <CheckCircle2 className="h-4 w-4" /> Save &amp; Next
              </button>
              <button
                type="button"
                onClick={onMarkForReviewAndNext}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2.5 text-sm font-semibold text-violet-800 transition hover:bg-violet-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700"
              >
                <Bookmark className="h-4 w-4" /> Mark for Review &amp; Next
              </button>
              <button
                type="button"
                onClick={onClearResponse}
                disabled={!selectedOption}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <RotateCcw className="h-4 w-4" /> Clear Response
              </button>
              <button type="button" onClick={onPrevious} disabled={questionNumber <= 1} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:opacity-45">
                <ChevronLeft className="h-4 w-4" /> Previous
              </button>
              <button type="button" onClick={onNext} disabled={questionNumber >= totalQuestions} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:opacity-45">
                Next <ChevronRight className="h-4 w-4" />
              </button>
              <span className="sr-only" aria-live="polite">Question status: {status.replaceAll('_', ' ')}</span>
            </div>
          }
        />
      </article>
      {question.formulas.length > 0 && (
        <div className="rounded border border-slate-200 bg-white p-3">
          <h3 className="text-[11px] font-semibold uppercase text-slate-500">Source formulas</h3>
          {question.formulas.map((formula, index) => <p key={index} className="mt-1 font-mono text-sm"><MathText text={formula} /></p>)}
        </div>
      )}
      <p className="text-[11px] text-slate-500">Imported question content is not independently authenticated by the simulator.</p>
      </div>
    </div>
  </section>
);
