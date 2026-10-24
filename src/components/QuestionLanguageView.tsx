import React, { useState } from 'react';
import { ExamQuestion, OptionLetter } from '../types/exam';
import { getOptionDisplayLabel, getQuestionLanguageView, QuestionLanguage } from '../utils/questionLanguage';
import { MathText } from './MathText';
import { QuestionImages } from './QuestionImages';

export function QuestionLanguageView({ question, className = '', selectedOption = null, onSelectOption, afterOptions }: {
  question: ExamQuestion;
  className?: string;
  selectedOption?: OptionLetter | null;
  onSelectOption?: (option: OptionLetter) => void;
  afterOptions?: React.ReactNode;
}) {
  const [language, setLanguage] = useState<QuestionLanguage>('en');
  const view = getQuestionLanguageView(question, language);
  const optionLetters: OptionLetter[] = ['A', 'B', 'C', 'D'];
  const languageName = language === 'en' ? 'English' : 'Hindi';

  return (
    <div className={className}>
      <div className="mb-3 flex gap-2" role="group" aria-label="Question language">
        {(['en', 'hi'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setLanguage(option)}
            aria-pressed={language === option}
            className={`min-h-10 rounded-lg border px-3 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
              language === option
                ? 'border-blue-600 bg-blue-50 text-blue-800'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-50'
            }`}
          >
            {option === 'en' ? 'English' : 'हिन्दी'}
          </button>
        ))}
      </div>
      {!view.available && (
        <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Question text and answer choices are unavailable in English and Hindi.
        </p>
      )}
      {view.question || view.available ? (
        <>
          {view.question ? (
            <article className="whitespace-pre-wrap text-base leading-relaxed text-slate-800">
              <MathText text={view.question} />
              {view.questionFallback && <FallbackNotice />}
            </article>
          ) : (
            <p role="status" className="text-sm text-amber-700">
              {view.questionUnavailableInBothLanguages
                ? 'Question text is unavailable in English and Hindi.'
                : `${languageName} question text is unavailable.`}
            </p>
          )}
          <QuestionImages images={question.images} type="question" />
          {view.optionsFallback && <p className="mt-3"><FallbackNotice /></p>}
          <div className="mt-5 grid gap-3 sm:grid-cols-2" role={onSelectOption ? 'radiogroup' : undefined} aria-label={onSelectOption ? 'Select your response' : undefined}>
            {optionLetters.map((letter) => {
              const isSelected = selectedOption === letter;
              const optionContent = (
                <>
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-sm font-semibold ${
                    isSelected ? 'border-blue-300 bg-blue-100 text-blue-800' : 'border-slate-200 bg-slate-50 text-slate-500'
                  }`}>{getOptionDisplayLabel(letter, language)}</span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className={`block whitespace-pre-wrap text-sm leading-6 ${isSelected ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>
                      {view.options[letter]
                        ? <MathText text={view.options[letter]!} />
                        : <span className="text-amber-700">{view.optionsUnavailableInBothLanguages[letter]
                          ? 'Option text is unavailable in English and Hindi.'
                          : `${languageName} option text is unavailable.`}</span>}
                    </span>
                    <QuestionImages images={question.images} type="option" option={letter} />
                  </span>
                  {onSelectOption && <span aria-hidden="true" className={`h-4 w-4 shrink-0 rounded-full border ${isSelected ? 'border-blue-600 bg-blue-600 ring-2 ring-blue-100' : 'border-slate-300'}`} />}
                </>
              );
              const className = `flex min-h-16 w-full items-start gap-3 rounded-xl border bg-white p-4 text-sm shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                onSelectOption ? 'cursor-pointer' : ''
              } ${isSelected ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-100' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`;
              return onSelectOption ? (
                <button
                  key={letter}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => onSelectOption(letter)}
                  className={className}
                >
                  {optionContent}
                </button>
              ) : (
                <div key={letter} className={className}>{optionContent}</div>
              );
            })}
          </div>
          {afterOptions}
          {view.explanation && (
            <section className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-700">
              {view.explanationFallback && <FallbackNotice />}
              <div className="whitespace-pre-wrap text-sm leading-relaxed">
                <MathText text={view.explanation} />
              </div>
            </section>
          )}
          {view.solution && (
            <section className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-700">
              {view.solutionFallback && <FallbackNotice />}
              <div className="whitespace-pre-wrap text-sm leading-relaxed">
                <MathText text={view.solution} />
              </div>
            </section>
          )}
          <QuestionImages images={question.images} type="explanation" />
        </>
      ) : null}
      {view.explanationUnavailable && (
        <p role="status" className="mt-4 text-sm text-amber-700">
          Explanation is unavailable in {languageName}.
        </p>
      )}
      {view.solutionUnavailable && (
        <p role="status" className="mt-3 text-sm text-amber-700">
          Solution is unavailable in {languageName}.
        </p>
      )}
    </div>
  );
}

function FallbackNotice() {
  return (
    <span className="ml-2 inline-block rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
      English fallback
    </span>
  );
}
