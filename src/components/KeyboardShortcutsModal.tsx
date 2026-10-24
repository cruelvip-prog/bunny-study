import React from 'react';
import { Keyboard, X } from 'lucide-react';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  const shortcuts = [
    { key: 'A / B / C / D', alt: '1 / 2 / 3 / 4', desc: 'Select Option A, B, C, or D' },
    { key: 'Enter', alt: 'S', desc: 'Save & Next (Commit response and advance)' },
    { key: 'M', alt: 'R', desc: 'Mark for Review & Next' },
    { key: 'Backspace', alt: 'C', desc: 'Clear response for current question' },
    { key: '← ArrowLeft', alt: 'P', desc: 'Go to Previous question' },
    { key: '→ ArrowRight', alt: 'N', desc: 'Go to Next question' },
    { key: '+ / -', alt: 'Ctrl + Wheel', desc: 'Zoom PDF In / Out' },
    { key: 'F', alt: 'F11', desc: 'Toggle Fullscreen Mode' },
    { key: '?', alt: 'H', desc: 'Open / Close this Keyboard Help' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-800 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div className="flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-blue-700" />
            <h3 className="text-sm font-bold text-slate-900">
              Windows 10 NEET CBT Keyboard Shortcuts
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close keyboard shortcuts"
            className="rounded p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-2 overflow-y-auto p-5">
          {shortcuts.map((s, idx) => (
            <div
              key={idx}
              className="flex flex-col items-start justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm sm:flex-row sm:items-center"
            >
              <div className="flex items-center gap-1.5 font-mono">
                <kbd className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-bold text-blue-800">
                  {s.key}
                </kbd>
                {s.alt && (
                  <>
                    <span className="font-sans text-slate-500">or</span>
                    <kbd className="rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xs text-slate-700">
                      {s.alt}
                    </kbd>
                  </>
                )}
              </div>
              <span className="text-left text-slate-700 sm:text-right">{s.desc}</span>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-right">
          <button
            onClick={onClose}
            className="min-h-10 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
};
