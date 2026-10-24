import React from 'react';
import { AlertCircle, CheckCircle, Clock, X } from 'lucide-react';
import { QuestionStatus } from '../types/exam';

interface ConfirmSubmitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  totalQuestions: number;
  timeRemainingSeconds: number;
  statuses: Record<number, QuestionStatus>;
}

export const ConfirmSubmitModal: React.FC<ConfirmSubmitModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  totalQuestions,
  timeRemainingSeconds,
  statuses,
}) => {
  if (!isOpen) return null;

  let answered = 0;
  let notAnswered = 0;
  let marked = 0;
  let answeredAndMarked = 0;
  let notVisited = 0;

  for (let i = 1; i <= totalQuestions; i++) {
    const s = statuses[i] || 'not_visited';
    if (s === 'answered') answered++;
    else if (s === 'not_answered') notAnswered++;
    else if (s === 'marked_for_review') marked++;
    else if (s === 'answered_marked_for_review') answeredAndMarked++;
    else notVisited++;
  }

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${s}s`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-800 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-600" />
            <h3 className="text-sm font-bold text-slate-900">Confirm Exam Submission</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close submission confirmation"
            className="rounded p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content & Stats Table */}
        <div className="space-y-4 p-5 text-sm">
          <p className="text-slate-600">
            Please review your final response status summary below before final submission:
          </p>

          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex justify-between border-b border-slate-200 py-1.5">
              <span className="text-slate-600">Total Questions:</span>
              <strong className="text-slate-900">{totalQuestions}</strong>
            </div>

            <div className="flex justify-between border-b border-slate-200 py-1.5 text-emerald-700">
              <span>Answered:</span>
              <strong>{answered}</strong>
            </div>

            <div className="flex justify-between border-b border-slate-200 py-1.5 text-purple-700">
              <span>Answered &amp; Marked for Review:</span>
              <strong>{answeredAndMarked}</strong>
            </div>

            <div className="flex justify-between border-b border-slate-200 py-1.5 text-rose-700">
              <span>Visited but Unanswered:</span>
              <strong>{notAnswered}</strong>
            </div>

            <div className="flex justify-between border-b border-slate-200 py-1.5 text-slate-600">
              <span>Not Visited:</span>
              <strong>{notVisited}</strong>
            </div>

            <div className="flex justify-between py-1.5 font-mono text-blue-700">
              <span className="flex items-center gap-1 font-sans text-slate-600">
                <Clock className="h-3.5 w-3.5 text-blue-600" /> Time Remaining:
              </span>
              <strong>{formatTime(timeRemainingSeconds)}</strong>
            </div>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <strong>Warning:</strong> Once submitted, you cannot change any answers or resume this test session.
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2.5 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <button
            onClick={onClose}
            className="min-h-10 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            Cancel &amp; Continue Test
          </button>
          <button
            onClick={onConfirm}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-rose-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-rose-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700"
          >
            <CheckCircle className="w-4 h-4" />
            <span>Yes, Submit Exam</span>
          </button>
        </div>
      </div>
    </div>
  );
};
