import React from 'react';

export interface ImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src: any;
  alt: string;
}

export default function Image({ src, alt, ...props }: ImageProps) {
  const resolvedSrc = typeof src === 'object' && src !== null && 'src' in src ? src.src : (src as string);
  return <img src={resolvedSrc} alt={alt} {...props} />;
}
