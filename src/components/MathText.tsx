import React, { useMemo } from 'react';
import { splitMathText } from '../utils/mathText';

interface MathTextProps {
  text: string;
  className?: string;
}

export const MathText: React.FC<MathTextProps> = ({ text, className }) => {
  const segments = useMemo(() => splitMathText(text), [text]);
  return (
    <span className={className}>
      {segments.map((segment, index) => segment.kind === 'math' ? (
        <span
          key={index}
          className={segment.displayMode ? 'block overflow-x-auto py-1' : undefined}
          dangerouslySetInnerHTML={{ __html: segment.content }}
        />
      ) : (
        <React.Fragment key={index}>{segment.content}</React.Fragment>
      ))}
    </span>
  );
};
