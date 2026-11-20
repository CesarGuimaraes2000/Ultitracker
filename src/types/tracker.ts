export type CombatSide = 'hero' | 'villain';

export interface SpriteOption {
  id: string;
  label: string;
  src: string;
  side: CombatSide;
  width: number;
  height: number;
}

export interface InitiativeSlot {
  id: string;
  side: CombatSide;
  spriteId: string;
  label?: string;
}

export interface MapPoint {
  x: number;
  y: number;
}

export interface InitiativeState {
  playerTurns: number;
  enemyTurns: number;
  winner: CombatSide;
  heroSpriteId: string;
  villainSpriteId: string;
  round: number;
  activeIndex: number;
  slots: InitiativeSlot[];
  anchor?: MapPoint;
  updatedAt: number;
}

export interface TrackerItemMeta {
  kind:
    | 'bar'
    | 'pointer'
    | 'slot'
    | 'btn-prev'
    | 'btn-remove'
    | 'btn-next';
  slotId?: string;
  slotIndex?: number;
  side?: CombatSide;
  slotGap?: number;
  slotCount?: number;
}
