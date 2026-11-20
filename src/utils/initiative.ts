import {
  getDefaultSpriteId,
  getSpriteById,
  getSpritesBySide,
} from '../constants/sprites';
import type {
  CombatSide,
  InitiativeSlot,
  InitiativeState,
  MapPoint,
} from '../types/tracker';

export const MIN_TURNS = 0;
export const MAX_TURNS = 20;

export function clampTurnCount(value: number): number {
  if (!Number.isFinite(value)) return MIN_TURNS;
  return Math.max(MIN_TURNS, Math.min(MAX_TURNS, Math.floor(value)));
}

function createSlotId(side: CombatSide, index: number): string {
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${side}-${index}-${suffix}`;
}

function isValidSide(value: unknown): value is CombatSide {
  return value === 'hero' || value === 'villain';
}

function normalizeAnchor(raw: unknown): MapPoint | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const rec = raw as Record<string, unknown>;
  if (
    typeof rec.x === 'number' &&
    Number.isFinite(rec.x) &&
    typeof rec.y === 'number' &&
    Number.isFinite(rec.y)
  ) {
    return { x: rec.x, y: rec.y };
  }
  return undefined;
}

export function normalizeInitiativeState(raw: unknown): InitiativeState | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;

  if (!Array.isArray(record.slots)) return null;

  const slots: InitiativeSlot[] = [];
  for (let i = 0; i < record.slots.length; i += 1) {
    const item = record.slots[i];
    if (typeof item !== 'object' || item === null) continue;
    const slotRec = item as Record<string, unknown>;
    if (!isValidSide(slotRec.side)) continue;

    const side = slotRec.side;
    const sprite = getSpriteById(
      side,
      typeof slotRec.spriteId === 'string' ? slotRec.spriteId : undefined,
    );

    slots.push({
      id: typeof slotRec.id === 'string' && slotRec.id ? slotRec.id : `${side}-${i}`,
      side,
      spriteId: sprite.id,
      label: typeof slotRec.label === 'string' ? slotRec.label : undefined,
    });
  }

  const winner: CombatSide = isValidSide(record.winner) ? record.winner : 'hero';
  const heroSpriteId =
    typeof record.heroSpriteId === 'string'
      ? getSpriteById('hero', record.heroSpriteId).id
      : getDefaultSpriteId('hero');
  const villainSpriteId =
    typeof record.villainSpriteId === 'string'
      ? getSpriteById('villain', record.villainSpriteId).id
      : getDefaultSpriteId('villain');

  const round =
    typeof record.round === 'number' && Number.isFinite(record.round) && record.round >= 1
      ? Math.floor(record.round)
      : 1;

  const rawActiveIndex =
    typeof record.activeIndex === 'number' && Number.isFinite(record.activeIndex)
      ? Math.floor(record.activeIndex)
      : 0;
  const activeIndex =
    slots.length === 0 ? 0 : Math.max(0, Math.min(rawActiveIndex, slots.length - 1));

  const playerTurns =
    typeof record.playerTurns === 'number'
      ? clampTurnCount(record.playerTurns)
      : slots.filter((s) => s.side === 'hero').length;

  const enemyTurns =
    typeof record.enemyTurns === 'number'
      ? clampTurnCount(record.enemyTurns)
      : slots.filter((s) => s.side === 'villain').length;

  const updatedAt =
    typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
      ? record.updatedAt
      : 0;

  return {
    playerTurns,
    enemyTurns,
    winner,
    heroSpriteId,
    villainSpriteId,
    round,
    activeIndex,
    slots,
    anchor: normalizeAnchor(record.anchor),
    updatedAt,
  };
}

/**
 * Builds an alternating turn order following Fabula Ultima's side initiative rules:
 * the winning side acts first, then sides alternate until one side runs out of turns,
 * after which any remaining turns from the other side occur consecutively.
 */
export function buildFabulaInitiativeSlots(params: {
  playerTurns: number;
  enemyTurns: number;
  winner: CombatSide;
  heroSpriteId?: string;
  villainSpriteId?: string;
}): InitiativeSlot[] {
  const clampedPlayers = clampTurnCount(params.playerTurns);
  const clampedEnemies = clampTurnCount(params.enemyTurns);
  const heroSpriteId = params.heroSpriteId ?? getDefaultSpriteId('hero');
  const villainSpriteId = params.villainSpriteId ?? getDefaultSpriteId('villain');

  const firstSide: CombatSide = params.winner;
  const secondSide: CombatSide = params.winner === 'hero' ? 'villain' : 'hero';

  let firstRemaining = firstSide === 'hero' ? clampedPlayers : clampedEnemies;
  let secondRemaining = secondSide === 'hero' ? clampedPlayers : clampedEnemies;

  const slots: InitiativeSlot[] = [];
  let orderCounter = 0;

  while (firstRemaining > 0 || secondRemaining > 0) {
    if (firstRemaining > 0) {
      orderCounter += 1;
      slots.push({
        id: createSlotId(firstSide, orderCounter),
        side: firstSide,
        spriteId: firstSide === 'hero' ? heroSpriteId : villainSpriteId,
      });
      firstRemaining -= 1;
    }

    if (secondRemaining > 0) {
      orderCounter += 1;
      slots.push({
        id: createSlotId(secondSide, orderCounter),
        side: secondSide,
        spriteId: secondSide === 'hero' ? heroSpriteId : villainSpriteId,
      });
      secondRemaining -= 1;
    }
  }

  return slots;
}

export function createDefaultInitiativeState(): InitiativeState {
  const playerTurns = 4;
  const enemyTurns = 4;
  const winner: CombatSide = 'hero';
  const heroSpriteId = getDefaultSpriteId('hero');
  const villainSpriteId = getDefaultSpriteId('villain');

  return {
    playerTurns,
    enemyTurns,
    winner,
    heroSpriteId,
    villainSpriteId,
    round: 1,
    activeIndex: 0,
    slots: buildFabulaInitiativeSlots({
      playerTurns,
      enemyTurns,
      winner,
      heroSpriteId,
      villainSpriteId,
    }),
    updatedAt: 0,
  };
}

export function stepInitiative(
  state: InitiativeState,
  direction: 'prev' | 'next',
): InitiativeState {
  const total = state.slots.length;
  if (total === 0) return state;

  if (direction === 'next') {
    if (state.activeIndex < total - 1) {
      return {
        ...state,
        activeIndex: state.activeIndex + 1,
        updatedAt: Date.now(),
      };
    }

    return {
      ...state,
      activeIndex: 0,
      round: state.round + 1,
      updatedAt: Date.now(),
    };
  }

  if (state.activeIndex > 0) {
    return {
      ...state,
      activeIndex: state.activeIndex - 1,
      updatedAt: Date.now(),
    };
  }

  if (state.round > 1) {
    return {
      ...state,
      activeIndex: total - 1,
      round: state.round - 1,
      updatedAt: Date.now(),
    };
  }

  // Wrap smoothly to the last slot even on round 1 when clicking previous on the map.
  return {
    ...state,
    activeIndex: total - 1,
    updatedAt: Date.now(),
  };
}

export function countSides(slots: InitiativeSlot[]): {
  playerTurns: number;
  enemyTurns: number;
} {
  let playerTurns = 0;
  let enemyTurns = 0;

  for (const slot of slots) {
    if (slot.side === 'hero') playerTurns += 1;
    else enemyTurns += 1;
  }

  return { playerTurns, enemyTurns };
}

/**
 * Removes the currently pointed slot and rebuilds the remaining slots in
 * alternating PC/NPC order starting with `state.winner` so no two turns from
 * the same side are left consecutive while the other side still has turns.
 */
export function removeActiveSlot(state: InitiativeState): InitiativeState {
  if (state.slots.length === 0) return state;

  const targetIndex = Math.max(0, Math.min(state.activeIndex, state.slots.length - 1));
  const remaining = state.slots.filter((_, index) => index !== targetIndex);

  const remainingHeroes = remaining.filter((slot) => slot.side === 'hero');
  const remainingVillains = remaining.filter((slot) => slot.side === 'villain');

  const firstQueue = state.winner === 'hero' ? remainingHeroes : remainingVillains;
  const secondQueue = state.winner === 'hero' ? remainingVillains : remainingHeroes;

  const rebuiltSlots: InitiativeSlot[] = [];
  let firstIdx = 0;
  let secondIdx = 0;

  while (firstIdx < firstQueue.length || secondIdx < secondQueue.length) {
    if (firstIdx < firstQueue.length) {
      rebuiltSlots.push(firstQueue[firstIdx]);
      firstIdx += 1;
    }
    if (secondIdx < secondQueue.length) {
      rebuiltSlots.push(secondQueue[secondIdx]);
      secondIdx += 1;
    }
  }

  const { playerTurns, enemyTurns } = countSides(rebuiltSlots);
  const nextActiveIndex =
    rebuiltSlots.length === 0
      ? 0
      : Math.max(0, Math.min(targetIndex - 1, rebuiltSlots.length - 1));

  return {
    ...state,
    slots: rebuiltSlots,
    playerTurns,
    enemyTurns,
    activeIndex: nextActiveIndex,
    updatedAt: Date.now(),
  };
}

export function appendCombatantSlot(
  state: InitiativeState,
  side: CombatSide,
): InitiativeState {
  if (state.slots.length >= MAX_TURNS * 2) return state;

  const spriteId = side === 'hero' ? state.heroSpriteId : state.villainSpriteId;
  const nextSlots: InitiativeSlot[] = [
    ...state.slots,
    {
      id: createSlotId(side, state.slots.length + 1),
      side,
      spriteId,
    },
  ];
  const { playerTurns, enemyTurns } = countSides(nextSlots);

  return {
    ...state,
    slots: nextSlots,
    playerTurns,
    enemyTurns,
    updatedAt: Date.now(),
  };
}

export function cycleSlotSprite(
  state: InitiativeState,
  slotId: string,
): InitiativeState {
  const target = state.slots.find((slot) => slot.id === slotId);
  if (!target) return state;

  const options = getSpritesBySide(target.side);
  if (options.length <= 1) return state;

  const currentIdx = options.findIndex((item) => item.id === target.spriteId);
  const nextOption = options[(currentIdx + 1) % options.length];

  return {
    ...state,
    slots: state.slots.map((slot) =>
      slot.id === slotId ? { ...slot, spriteId: nextOption.id } : slot,
    ),
    updatedAt: Date.now(),
  };
}
