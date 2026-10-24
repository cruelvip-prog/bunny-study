import katex from 'katex';

export interface MathTextSegment {
  kind: 'text' | 'math';
  content: string;
  displayMode?: boolean;
}

const MATH_DELIMITER = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^$\n]+?)\$/g;

export function splitMathText(text: string): MathTextSegment[] {
  const segments: MathTextSegment[] = [];
  const appendText = (content: string) => {
    const lastSegment = segments[segments.length - 1];
    if (lastSegment?.kind === 'text') lastSegment.content += content;
    else segments.push({ kind: 'text', content });
  };
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = MATH_DELIMITER.exec(text)) !== null) {
    if (match.index > lastIndex) {
      appendText(text.slice(lastIndex, match.index));
    }

    const expression = match[1] ?? match[2] ?? match[3] ?? match[4] ?? '';
    const displayMode = match[1] !== undefined || match[2] !== undefined;
    try {
      segments.push({
        kind: 'math',
        content: katex.renderToString(expression, {
          displayMode,
          throwOnError: true,
          strict: 'ignore',
          trust: false,
        }),
        displayMode,
      });
    } catch {
      appendText(match[0]);
    }
    lastIndex = MATH_DELIMITER.lastIndex;
  }

  if (lastIndex < text.length) appendText(text.slice(lastIndex));
  return segments;
}
