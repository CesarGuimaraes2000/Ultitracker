import type { CombatSide, SpriteOption } from '../types/tracker';

export interface UiSpriteAsset {
  src: string;
  width: number;
  height: number;
}

export const UI_SPRITES = {
  pointer: {
    src: '/assets/sprites/point.png',
    width: 320,
    height: 208,
  },
  pointerDown: {
    src: '/assets/sprites/point-down.png',
    width: 208,
    height: 320,
  },
  arrowLeft: {
    src: '/assets/sprites/arrow-left.png',
    width: 224,
    height: 176,
  },
  arrowRight: {
    src: '/assets/sprites/arrow-green.png',
    width: 224,
    height: 176,
  },
  removeX: {
    src: '/assets/sprites/x.png',
    width: 208,
    height: 208,
  },
} as const satisfies Record<string, UiSpriteAsset>;

export function getBarSpriteForSlots(slotCount: number): UiSpriteAsset {
  const n = Math.max(1, Math.min(40, Math.floor(slotCount)));
  const middleRawWidth = Math.max(8, Math.round((n - 1) * 33.6));
  return {
    src: `/assets/sprites/bars/bar-${n}.png`,
    width: (56 + middleRawWidth) * 4,
    height: 196,
  };
}

/**
 * Extensible catalog of hero sprites.
 * Add new entries here (with assets placed in /public/assets/sprites/) to
 * automatically surface new hero image options in the UI and on the map.
 */
export const HERO_SPRITES: SpriteOption[] = [
  {
    id: 'hero-default',
    label: 'Classic Hero',
    src: '/assets/sprites/hero.png',
    side: 'hero',
    width: 288,
    height: 416,
  },
];

/**
 * Extensible catalog of villain / enemy sprites.
 * Add new entries here (with assets placed in /public/assets/sprites/) to
 * automatically surface new enemy image options in the UI and on the map.
 */
export const VILLAIN_SPRITES: SpriteOption[] = [
  {
    id: 'villain-default',
    label: 'Classic Villain',
    src: '/assets/sprites/villain.png',
    side: 'villain',
    width: 256,
    height: 384,
  },
];

export function getSpritesBySide(side: CombatSide): SpriteOption[] {
  return side === 'hero' ? HERO_SPRITES : VILLAIN_SPRITES;
}

export function getDefaultSpriteId(side: CombatSide): string {
  return getSpritesBySide(side)[0].id;
}

export function getSpriteById(side: CombatSide, spriteId?: string): SpriteOption {
  const options = getSpritesBySide(side);
  if (spriteId) {
    const match = options.find((item) => item.id === spriteId);
    if (match) return match;
  }
  return options[0];
}

export function resolveAssetUrl(path: string): string {
  return new URL(path, window.location.origin).href;
}
