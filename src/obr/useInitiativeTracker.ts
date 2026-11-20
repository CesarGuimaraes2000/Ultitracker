import { useCallback, useEffect, useRef, useState } from 'react';
import OBR from '@owlbear-rodeo/sdk';
import {
  BC_CHANNEL,
  INITIATIVE_META_KEY,
  LS_ROOM_KEY,
} from '../constants/keys';
import { getSpriteById } from '../constants/sprites';
import type { CombatSide, InitiativeState } from '../types/tracker';
import {
  appendCombatantSlot,
  buildFabulaInitiativeSlots,
  clampTurnCount,
  createDefaultInitiativeState,
  cycleSlotSprite,
  normalizeInitiativeState,
  removeActiveSlot,
  stepInitiative,
} from '../utils/initiative';
import { renderTrackerOnScene } from './sceneTracker';

export type SyncMode = 'loading' | 'obr' | 'local';

function readLocalState(): InitiativeState {
  try {
    const raw = localStorage.getItem(LS_ROOM_KEY);
    if (!raw) return createDefaultInitiativeState();
    const parsed: unknown = JSON.parse(raw);
    return normalizeInitiativeState(parsed) ?? createDefaultInitiativeState();
  } catch {
    return createDefaultInitiativeState();
  }
}

export function useInitiativeTracker() {
  const [syncMode, setSyncMode] = useState<SyncMode>(() =>
    OBR.isAvailable ? 'loading' : 'local',
  );
  const [state, setState] = useState<InitiativeState>(() =>
    OBR.isAvailable ? createDefaultInitiativeState() : readLocalState(),
  );

  const stateRef = useRef(state);
  stateRef.current = state;

  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (!OBR.isAvailable) {
      setSyncMode('local');
      setState(readLocalState());

      const channel =
        typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(BC_CHANNEL) : null;
      channelRef.current = channel;

      const handleStorage = (event: StorageEvent) => {
        if (event.key !== LS_ROOM_KEY) return;
        setState(readLocalState());
      };

      const handleMessage = (event: MessageEvent<unknown>) => {
        const next = normalizeInitiativeState(event.data);
        if (next) setState(next);
      };

      window.addEventListener('storage', handleStorage);
      channel?.addEventListener('message', handleMessage);

      return () => {
        window.removeEventListener('storage', handleStorage);
        channel?.removeEventListener('message', handleMessage);
        channel?.close();
        channelRef.current = null;
      };
    }

    let cancelled = false;
    let unsubscribeRoom: (() => void) | undefined;
    let unsubscribeScene: (() => void) | undefined;
    let unsubscribeSceneReady: (() => void) | undefined;

    const bindSceneMetadata = async (ready: boolean) => {
      unsubscribeScene?.();
      unsubscribeScene = undefined;
      if (!ready || cancelled) return;

      try {
        const meta = await OBR.scene.getMetadata();
        if (cancelled) return;
        const parsed = normalizeInitiativeState(meta[INITIATIVE_META_KEY]);
        if (parsed) setState(parsed);
      } catch (err) {
        console.error('[UltiTracker] Failed to read OBR scene metadata:', err);
      }

      unsubscribeScene = OBR.scene.onMetadataChange((meta) => {
        const parsed = normalizeInitiativeState(meta[INITIATIVE_META_KEY]);
        if (parsed) setState(parsed);
      });
    };

    OBR.onReady(async () => {
      if (cancelled) return;
      setSyncMode('obr');

      try {
        const roomMeta = await OBR.room.getMetadata();
        if (cancelled) return;
        const parsed = normalizeInitiativeState(roomMeta[INITIATIVE_META_KEY]);
        if (parsed) setState(parsed);
      } catch (err) {
        console.error('[UltiTracker] Failed to read OBR room metadata:', err);
      }

      unsubscribeRoom = OBR.room.onMetadataChange((meta) => {
        const parsed = normalizeInitiativeState(meta[INITIATIVE_META_KEY]);
        if (parsed) setState(parsed);
      });

      await bindSceneMetadata(await OBR.scene.isReady());
      unsubscribeSceneReady = OBR.scene.onReadyChange((ready) => {
        void bindSceneMetadata(ready);
      });
    });

    return () => {
      cancelled = true;
      unsubscribeRoom?.();
      unsubscribeScene?.();
      unsubscribeSceneReady?.();
    };
  }, []);

  const commitLocalState = useCallback(
    (updater: (prev: InitiativeState) => InitiativeState) => {
      const nextState = updater(stateRef.current);
      stateRef.current = nextState;
      setState(nextState);

      try {
        localStorage.setItem(LS_ROOM_KEY, JSON.stringify(nextState));
        channelRef.current?.postMessage(nextState);
      } catch (err) {
        console.error('[UltiTracker] Failed to persist local state:', err);
      }
      return nextState;
    },
    [],
  );

  const generateOrder = useCallback(
    async (
      playerTurns: number,
      enemyTurns: number,
      winner: CombatSide,
      heroSpriteId?: string,
      villainSpriteId?: string,
    ) => {
      const prev = stateRef.current;
      const clampedPlayers = clampTurnCount(playerTurns);
      const clampedEnemies = clampTurnCount(enemyTurns);
      const resolvedHeroSprite = getSpriteById(
        'hero',
        heroSpriteId ?? prev.heroSpriteId,
      ).id;
      const resolvedVillainSprite = getSpriteById(
        'villain',
        villainSpriteId ?? prev.villainSpriteId,
      ).id;

      const nextState: InitiativeState = {
        playerTurns: clampedPlayers,
        enemyTurns: clampedEnemies,
        winner,
        heroSpriteId: resolvedHeroSprite,
        villainSpriteId: resolvedVillainSprite,
        round: 1,
        activeIndex: 0,
        slots: buildFabulaInitiativeSlots({
          playerTurns: clampedPlayers,
          enemyTurns: clampedEnemies,
          winner,
          heroSpriteId: resolvedHeroSprite,
          villainSpriteId: resolvedVillainSprite,
        }),
        anchor: prev.anchor,
        updatedAt: Date.now(),
      };

      if (OBR.isAvailable) {
        if (OBR.isReady) {
          const synced = await renderTrackerOnScene(nextState);
          stateRef.current = synced;
          setState(synced);
        }
        return;
      }

      commitLocalState(() => nextState);
    },
    [commitLocalState],
  );

  const nextTurn = useCallback(() => {
    commitLocalState((prev) => stepInitiative(prev, 'next'));
  }, [commitLocalState]);

  const prevTurn = useCallback(() => {
    commitLocalState((prev) => stepInitiative(prev, 'prev'));
  }, [commitLocalState]);

  const removeCurrent = useCallback(() => {
    commitLocalState((prev) => removeActiveSlot(prev));
  }, [commitLocalState]);

  const selectSlot = useCallback(
    (index: number) => {
      commitLocalState((prev) => {
        if (prev.slots.length === 0) return prev;
        const clamped = Math.max(0, Math.min(index, prev.slots.length - 1));
        if (clamped === prev.activeIndex) return prev;
        return {
          ...prev,
          activeIndex: clamped,
          updatedAt: Date.now(),
        };
      });
    },
    [commitLocalState],
  );

  const addSlot = useCallback(
    (side: CombatSide) => {
      commitLocalState((prev) => appendCombatantSlot(prev, side));
    },
    [commitLocalState],
  );

  const cycleSprite = useCallback(
    (slotId: string) => {
      commitLocalState((prev) => cycleSlotSprite(prev, slotId));
    },
    [commitLocalState],
  );

  return {
    state,
    syncMode,
    generateOrder,
    nextTurn,
    prevTurn,
    removeCurrent,
    selectSlot,
    addSlot,
    cycleSprite,
  };
}
