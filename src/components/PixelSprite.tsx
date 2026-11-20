interface PixelSpriteProps {
  src: string;
  alt: string;
  boxClassName?: string;
  imgClassName?: string;
}

/**
 * Renders pixel-art sprites inside a fixed proportional bounding box so assets
 * of varying raw dimensions stay sharp (`pixelated`) and visually balanced.
 */
export function PixelSprite({
  src,
  alt,
  boxClassName = 'w-12 h-16',
  imgClassName = '',
}: PixelSpriteProps) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center ${boxClassName}`}>
      <img
        src={src}
        alt={alt}
        draggable={false}
        style={{ imageRendering: 'pixelated' }}
        className={`h-full w-full select-none object-contain pointer-events-none ${imgClassName}`}
      />
    </span>
  );
}
