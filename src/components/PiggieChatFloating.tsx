import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

const PIGBUNN_ORIGIN = 'https://pigbunn.pages.dev';
const PIGBUNN_ICON_URL = `${PIGBUNN_ORIGIN}/assets/piggie-ai-logo.svg`;

export function PiggieChatFloating() {
  const [isOpen, setIsOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const toggleOpen = () => {
    setHasOpened(true);
    setIsOpen((open) => !open);
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      {hasOpened && (
        <section
          id="pigbunn-ai-panel"
          role="dialog"
          aria-labelledby="pigbunn-ai-heading"
          aria-hidden={!isOpen}
          className={`flex h-[min(42rem,calc(100dvh-7rem))] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl ${
            isOpen ? '' : 'hidden'
          }`}
        >
          <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
            <h2 id="pigbunn-ai-heading" className="text-sm font-semibold text-slate-800">PigBunn AI</h2>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Close PigBunn AI"
              className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </header>
          <iframe
            title="PigBunn AI assistant"
            src={PIGBUNN_ORIGIN}
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            className="min-h-0 w-full flex-1 border-0 bg-white"
          />
        </section>
      )}
      <button
        type="button"
        onClick={toggleOpen}
        aria-label={isOpen ? 'Close PigBunn AI' : 'Open PigBunn AI'}
        aria-expanded={isOpen}
        aria-controls="pigbunn-ai-panel"
        className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-white shadow-lg transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
      >
        <img
          src={PIGBUNN_ICON_URL}
          alt=""
          className="h-full w-full object-contain"
        />
      </button>
    </div>
  );
}
