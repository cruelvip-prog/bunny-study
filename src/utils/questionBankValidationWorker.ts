import { validateQuestionBankText } from './questionBank';

self.onmessage = async (event: MessageEvent<Blob>) => {
  try {
    self.postMessage({ type: 'progress', stage: 'Reading question-bank file' });
    const text = await event.data.text();
    self.postMessage({ type: 'progress', stage: 'Parsing and validating questions and images' });
    const result = validateQuestionBankText(text);
    self.postMessage({ type: 'result', result });
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
