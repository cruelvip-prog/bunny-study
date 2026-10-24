import React, { useState } from 'react';
import { ExamImage, ExamImageType, OptionLetter } from '../types/exam';

export function QuestionImages({
  images,
  type,
  option,
  className = '',
}: {
  images?: ExamImage[];
  type: ExamImageType;
  option?: OptionLetter;
  className?: string;
}) {
  const visibleImages = (images || []).filter((image) =>
    image.type === type && (type !== 'option' || image.option === option));
  if (!visibleImages.length) return null;

  return (
    <div className={`mt-2 flex flex-wrap gap-3 ${className}`}>
      {visibleImages.map((image) => <ImageFigure key={image.id} image={image} />)}
    </div>
  );
}

function ImageFigure({ image }: { image: ExamImage }) {
  const [failed, setFailed] = useState(false);
  return (
    <figure className="min-w-0 max-w-full">
      {failed ? (
        <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Image could not be loaded: {image.alt || image.id}
        </p>
      ) : (
        <img
          src={image.dataUri || image.src}
          alt={image.alt}
          loading="lazy"
          onError={() => setFailed(true)}
          className="max-h-72 max-w-full rounded-lg border border-current/15 object-contain"
        />
      )}
      {image.caption && <figcaption className="mt-1 text-xs opacity-75">{image.caption}</figcaption>}
    </figure>
  );
}
