import React, { useState } from 'react';
import { ExamSection, QuestionStatus } from '../types/exam';

interface QuestionPaletteProps {
  totalQuestions: number;
  currentQuestion: number;
  sections: ExamSection[];
  statuses: Record<number, QuestionStatus>;
  onSelectQuestion: (questionNum: number) => void;
  onSubmitExam: () => void;
  showSubmit?: boolean;
  showTitle?: boolean;
}

export const QuestionPalette: React.FC<QuestionPaletteProps> = ({
  totalQuestions,
  currentQuestion,
  sections,
  statuses,
  onSelectQuestion,
  onSubmitExam,
  showSubmit = true,
  showTitle = true,
}) => {
  const [activeSectionId, setActiveSectionId] = useState<string>(
    sections.length > 0 ? sections[0].id : 'all'
  );

  // Calculate status counts
  let answeredCount = 0;
  let notAnsweredCount = 0;
  let notVisitedCount = 0;
  let markedForReviewCount = 0;
  let answeredAndMarkedCount = 0;

  for (let i = 1; i <= totalQuestions; i++) {
    const s = statuses[i] || 'not_visited';
    if (s === 'answered') answeredCount++;
    else if (s === 'not_answered') notAnsweredCount++;
    else if (s === 'marked_for_review') markedForReviewCount++;
    else if (s === 'answered_marked_for_review') answeredAndMarkedCount++;
    else notVisitedCount++;
  }

  // Current active section questions range
  const currentSection = sections.find((s) => s.id === activeSectionId);
  const startQ = currentSection ? currentSection.startQ : 1;
  const endQ = currentSection ? currentSection.endQ : totalQuestions;

  // Render question button style based on NTA guidelines
  const getButtonClass = (qNum: number) => {
    const isCurrent = qNum === currentQuestion;
    const s = statuses[qNum] || 'not_visited';

    let base =
      'relative flex h-9 w-9 cursor-pointer select-none items-center justify-center rounded-md text-xs font-bold transition ';

    if (isCurrent) {
      base += 'ring-2 ring-blue-600 ring-offset-2 ring-offset-white scale-105 z-10 ';
    }

    switch (s) {
      case 'answered':
        return base + 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm';
      case 'not_answered':
        return base + 'bg-rose-600 hover:bg-rose-500 text-white shadow-sm';
      case 'marked_for_review':
        return (
          base +
          'bg-purple-600 hover:bg-purple-500 text-white rounded-full border border-purple-400 shadow-sm'
        );
      case 'answered_marked_for_review':
        return (
          base +
          'bg-purple-600 hover:bg-purple-500 text-white rounded-full border border-purple-300 shadow-sm'
        );
      default:
        // not visited
        return (
          base +
          'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
        );
    }
  };

  return (
    <div className="flex h-full flex-col select-none border-l border-slate-200 bg-white text-slate-700">
      {/* Palette Title */}
      {showTitle && (
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-3.5 py-3">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">
            Question Palette
          </h3>
          <span className="font-mono text-xs text-slate-500">
            Total: {totalQuestions}
          </span>
        </div>
      )}

      {/* Answer and review status summary */}
      <div className="grid grid-cols-2 gap-2 border-b border-slate-200 bg-slate-50 p-3 text-xs">
        {/* Answered */}
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-emerald-600 text-xs font-bold text-white shadow-sm">
            {answeredCount}
          </div>
          <span className="text-slate-600">Answered</span>
        </div>

        {/* Not Answered */}
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-rose-600 text-xs font-bold text-white shadow-sm">
            {notAnsweredCount}
          </div>
          <span className="text-slate-600">Not Answered</span>
        </div>

        {/* Not Visited */}
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded border border-slate-300 bg-white text-xs font-bold text-slate-600">
            {notVisitedCount}
          </div>
          <span className="text-slate-600">Not Visited</span>
        </div>

        {/* Marked for Review */}
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-600 text-xs font-bold text-white shadow-sm">
            {markedForReviewCount}
          </div>
          <span className="text-slate-600">Marked for Review</span>
        </div>

        {/* Answered & Marked */}
        <div className="col-span-2 flex items-center gap-2 border-t border-slate-200 pt-1">
          <div className="relative flex h-5 w-5 items-center justify-center rounded-full bg-purple-600 text-xs font-bold text-white shadow-sm">
            {answeredAndMarkedCount}
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-1 ring-purple-900" />
          </div>
          <span className="text-slate-600">
            Answered &amp; Marked for Review
          </span>
        </div>
      </div>

      {/* Sections Tabs (if multiple sections exist e.g. Physics, Chemistry, Botany, Zoology) */}
      {sections.length > 1 && (
        <div className="flex flex-wrap gap-1 border-b border-slate-200 bg-white px-2 pt-2">
          {sections.map((sec) => {
            const isActive = sec.id === activeSectionId;
            return (
              <button
                key={sec.id}
                onClick={() => setActiveSectionId(sec.id)}
                className={`min-h-9 rounded-t px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${
                  isActive
                    ? 'border-x border-t border-slate-200 bg-blue-50 text-blue-800 shadow-sm'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                }`}
              >
                {sec.name} ({sec.startQ}-{sec.endQ})
              </button>
            );
          })}
        </div>
      )}

      {/* Question Number Buttons Matrix */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-5 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-5 gap-1.5 justify-items-center">
          {Array.from({ length: endQ - startQ + 1 }, (_, idx) => {
            const qNum = startQ + idx;
            const s = statuses[qNum];
            return (
              <button
                key={qNum}
                onClick={() => onSelectQuestion(qNum)}
                className={`${getButtonClass(qNum)} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700`}
                title={`Question ${qNum} (${s?.replace('_', ' ') || 'not visited'})`}
              >
                {qNum}
                {s === 'answered_marked_for_review' && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-1 ring-purple-900" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom Submit Action */}
      {showSubmit && (
        <div className="border-t border-slate-200 bg-white p-3">
          <button
            onClick={onSubmitExam}
            className="min-h-11 w-full rounded-lg bg-blue-700 px-3 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800 active:bg-blue-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          >
            Submit Test
          </button>
        </div>
      )}
    </div>
  );
};
