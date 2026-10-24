import React from 'react';
import {
  CheckCircle2,
  Bookmark,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Info,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import { ExamQuestion, OptionLetter, QuestionStatus } from '../types/exam';
import { MathText } from './MathText';

interface QuestionControlProps {
  questionNumber: number;
  totalQuestions: number;
  sectionName: string;
  isDemoMode: boolean;
  examQuestion?: ExamQuestion;
  selectedOption: OptionLetter | null;
  status: QuestionStatus;
  onSelectOption: (opt: OptionLetter) => void;
  onSaveAndNext: () => void;
  onSaveAndMarkForReview: () => void;
  onMarkForReviewAndNext: () => void;
  onClearResponse: () => void;
  onPrevious: () => void;
  onNext: () => void;
  isPaletteVisible?: boolean;
  onTogglePalette?: () => void;
  showAnswerOptions?: boolean;
}

export const QuestionControl: React.FC<QuestionControlProps> = ({
  questionNumber,
  totalQuestions,
  sectionName,
  isDemoMode,
  examQuestion,
  selectedOption,
  status,
  onSelectOption,
  onSaveAndNext,
  onSaveAndMarkForReview,
  onMarkForReviewAndNext,
  onClearResponse,
  onPrevious,
  onNext,
  isPaletteVisible,
  onTogglePalette,
  showAnswerOptions = true,
}) => {
  const options: OptionLetter[] = ['A', 'B', 'C', 'D'];

  const getStatusBadge = () => {
    switch (status) {
      case 'answered':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            Answered
          </span>
        );
      case 'answered_marked_for_review':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-semibold bg-purple-50 text-purple-800 border border-purple-200">
            <span className="w-2 h-2 rounded-full bg-emerald-400 border border-purple-300" />
            Answered & Marked for Review
          </span>
        );
      case 'marked_for_review':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-semibold bg-purple-50 text-purple-800 border border-purple-200">
            <span className="w-2 h-2 rounded-full bg-purple-400" />
            Marked for Review
          </span>
        );
      case 'not_answered':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200">
            <span className="w-2 h-2 rounded-full bg-rose-400" />
            Not Answered
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            Not Visited
          </span>
        );
    }
  };

  return (
    <div className="flex min-h-0 flex-col h-full bg-white text-slate-800 select-none">
      {/* Top Question Header */}
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white shadow-sm text-sm">
            Q{questionNumber}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-900">
                Question {questionNumber} of {totalQuestions}
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-white text-slate-600 border border-slate-200 font-medium">
                {sectionName}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {isDemoMode ? (
                <span className="text-amber-700">Incomplete demo - not scored</span>
              ) : examQuestion ? (
                <span className="text-amber-700">Imported practice question - answer sources require your review</span>
              ) : (
                <>
                  Marking: <span className="text-emerald-700 font-semibold">+4</span> for correct,{' '}
                  <span className="text-rose-700 font-semibold">-1</span> for wrong when a key is provided
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {getStatusBadge()}
          {onTogglePalette && (
            <button
              type="button"
              onClick={onTogglePalette}
              aria-expanded={isPaletteVisible}
              aria-controls="pdf-question-palette"
              aria-label={isPaletteVisible ? 'Hide question palette' : 'Show question palette'}
              title={isPaletteVisible ? 'Hide question palette' : 'Show question palette'}
              className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 transition hover:bg-blue-50 hover:text-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              {isPaletteVisible
                ? <PanelRightClose className="h-4 w-4" aria-hidden="true" />
                : <PanelRightOpen className="h-4 w-4" aria-hidden="true" />}
              <span className="text-xs">{isPaletteVisible ? 'Hide palette' : 'Show palette'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Answer Workspace */}
      {showAnswerOptions ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 flex flex-col justify-start">
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-slate-700">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <span>{examQuestion
              ? 'Select the answer based on the imported question shown in the paper pane.'
              : <>Refer to Question <strong>#{questionNumber}</strong> in the question paper pane on the left. Select the correct option below.</>}</span>
          </div>

          {/* Options Radio List */}
          <div role="radiogroup" aria-label="Select your response" className="space-y-2.5 my-auto">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Select Your Response:
            </p>

            {options.map((opt, idx) => {
            const isSelected = selectedOption === opt;
            const numericKey = idx + 1;

            return (
              <button
                key={opt}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => onSelectOption(opt)}
                className={`group w-full text-left flex items-center gap-3.5 p-3.5 rounded-lg border cursor-pointer transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-400 ${
                  isSelected
                    ? 'bg-blue-50 border-blue-500 shadow-sm ring-1 ring-blue-200'
                    : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                }`}
              >
                {/* Radio Circle */}
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center border transition-all ${
                    isSelected
                      ? 'border-blue-400 bg-blue-500 text-white'
                      : 'border-slate-400 group-hover:border-slate-600'
                  }`}
                >
                  {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>

                {/* Option Letter Tag */}
                <strong className={`text-sm font-semibold ${isSelected ? 'text-blue-700' : 'text-slate-500'}`}>
                  {opt}.
                </strong>

                {/* Option Label & Shortcut */}
                <div className="flex-1 flex items-center justify-between text-sm">
                  <MathText
                    className={`font-medium ${
                      isSelected ? 'text-slate-900 font-semibold' : 'text-slate-700'
                    }`}
                    text={examQuestion
                      ? `${examQuestion.options[opt].textEn}${examQuestion.options[opt].textHi ? ` / ${examQuestion.options[opt].textHi}` : ''}`
                      : `Option (${opt})`}
                  />
                  <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-slate-50 text-slate-500 border border-slate-200">
                    Shortcut: {opt} or {numericKey}
                  </span>
                </div>
              </button>
            );
            })}
          </div>
        </div>
      ) : (
        <div className="flex-1 p-4 sm:p-5">
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-slate-600">
            <p className="flex items-start gap-2">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
              Choose your response from the options in the question paper pane.
            </p>
            <p className="mt-3 font-semibold text-slate-800" aria-live="polite">
              {selectedOption ? `Selected answer: ${selectedOption}` : 'No answer selected'}
            </p>
            <p className="mt-1 text-xs text-slate-500">Keyboard shortcuts: A-D or 1-4 select an answer.</p>
          </div>
        </div>
      )}

      {/* Action Buttons Bar (Exact NTA Style & Functions) */}
      <div className="p-3 bg-white border-t border-slate-200 space-y-2">
        {/* Row 1: Save & Next, Save & Mark for Review, Clear */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Save & Next */}
          <button
            onClick={onSaveAndNext}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-md text-xs font-bold transition shadow"
            title="Save your response and proceed to next question (Enter or S)"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Save & Next</span>
          </button>

          {/* Save & Mark for Review (if option selected) or Mark for Review & Next */}
          {selectedOption ? (
            <button
              onClick={onSaveAndMarkForReview}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 bg-purple-700 hover:bg-purple-600 active:bg-purple-800 text-white rounded-md text-xs font-bold transition shadow"
              title="Save current response and mark for review (M)"
            >
              <Bookmark className="w-4 h-4" />
              <span>Save & Mark Review</span>
            </button>
          ) : (
            <button
              onClick={onMarkForReviewAndNext}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 bg-purple-800 hover:bg-purple-700 active:bg-purple-900 text-white rounded-md text-xs font-bold transition shadow"
              title="Mark for review and jump to next question (M or R)"
            >
              <Bookmark className="w-4 h-4" />
              <span>Mark Review & Next</span>
            </button>
          )}

          {/* Clear Response */}
          <button
            onClick={onClearResponse}
            disabled={!selectedOption}
            className="flex items-center justify-center gap-1 py-2.5 px-3 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white text-slate-700 rounded-md text-xs font-semibold border border-slate-200 transition"
            title="Clear the selected response for this question (Backspace or C)"
          >
            <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
            <span>Clear</span>
          </button>
        </div>

        {/* Row 2: Previous & Next Navigation */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200">
          <button
            onClick={onPrevious}
            disabled={questionNumber <= 1}
            className="flex-1 flex items-center justify-center gap-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:hover:bg-slate-100 text-slate-700 rounded-md text-xs font-medium border border-slate-200 transition"
            title="Go to previous question (Left Arrow or P)"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Previous</span>
          </button>

          <button
            onClick={onNext}
            disabled={questionNumber >= totalQuestions}
            className="flex-1 flex items-center justify-center gap-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 disabled:hover:bg-slate-100 text-slate-700 rounded-md text-xs font-medium border border-slate-200 transition"
            title="Go to next question (Right Arrow or N)"
          >
            <span>Next</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
