import { HERO_SPRITES as DISCOVERED_HEROES, VILLAIN_SPRITES as DISCOVERED_VILLAINS } from 'virtual:sprites';
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
 * Automatically discovered from `public/assets/sprites/heroes/`.
 * Drop any new sprite image into that folder and it appears here automatically.
 * Files are sorted naturally, so `1_Terra.png` is the default first option.
 */
export const HERO_SPRITES: SpriteOption[] = DISCOVERED_HEROES;

/**
 * Automatically discovered from `public/assets/sprites/villains/`.
 * Drop any new sprite image into that folder and it appears here automatically.
 * Files are sorted naturally, so `1_Kefka.png` is the default first option.
 */
export const VILLAIN_SPRITES: SpriteOption[] = DISCOVERED_VILLAINS;

export function getSpritesBySide(side: CombatSide): SpriteOption[] {
  return side === 'hero' ? HERO_SPRITES : VILLAIN_SPRITES;
}

export function getDefaultSpriteId(side: CombatSide): string {
  return getSpritesBySide(side)[0]?.id ?? '';
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
