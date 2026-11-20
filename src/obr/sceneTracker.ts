import OBR, { buildImage, type Image, type Item } from '@owlbear-rodeo/sdk';
import {
  INITIATIVE_META_KEY,
  ITEM_META_KEY,
  MAP_BAR_MIDDLE_ID,
  MAP_BTN_NEXT_ID,
  MAP_BTN_PREV_ID,
  MAP_BTN_REMOVE_ID,
  MAP_POINTER_ID,
  MAP_SLOT_ID_PREFIX,
} from '../constants/keys';
import {
  UI_SPRITES,
  getBarSpriteForSlots,
  getSpriteById,
  resolveAssetUrl,
} from '../constants/sprites';
import type {
  InitiativeState,
  MapPoint,
  TrackerItemMeta,
} from '../types/tracker';
import {
  normalizeInitiativeState,
  removeActiveSlot,
  stepInitiative,
} from '../utils/initiative';

const SLOT_GAP_CELLS = 0.72;
const CHARACTER_CELLS_TALL = 0.82;
const BAR_CELLS_TALL = 1.05;
const POINTER_CELLS_TALL = 0.42;
const POINTER_OFFSET_Y_CELLS = 0.82;
const CONTROLS_OFFSET_Y_CELLS = 0.88;
const ARROW_CELLS_TALL = 0.36;
const X_CELLS_TALL = 0.38;
const CONTROLS_GAP_X_CELLS = 0.75;

function isLegacyBarCap(item: Item): boolean {
  const raw = item.metadata?.[ITEM_META_KEY];
  if (typeof raw !== 'object' || raw === null) return false;
  return (raw as Record<string, unknown>).kind === 'bar-cap';
}

export function getTrackerItemMeta(item: Item): TrackerItemMeta | null {
  const raw = item.metadata?.[ITEM_META_KEY];
  if (typeof raw !== 'object' || raw === null) return null;
  const rec = raw as Record<string, unknown>;
  if (
    rec.kind !== 'bar' &&
    rec.kind !== 'pointer' &&
    rec.kind !== 'slot' &&
    rec.kind !== 'btn-prev' &&
    rec.kind !== 'btn-remove' &&
    rec.kind !== 'btn-next'
  ) {
    return null;
  }
  return rec as unknown as TrackerItemMeta;
}

function buildProportionalImage(params: {
  id: string;
  name: string;
  src: string;
  width: number;
  height: number;
  targetCellsTall: number;
  position: MapPoint;
  zIndex: number;
  meta: TrackerItemMeta;
  attachedTo?: string;
  disableHit?: boolean;
}): Image {
  const imageDpi = Math.max(1, Math.round(params.height / params.targetCellsTall));
  const builder = buildImage(
    {
      width: params.width,
      height: params.height,
      mime: 'image/png',
      url: resolveAssetUrl(params.src),
    },
    {
      dpi: imageDpi,
      offset: {
        x: Math.round(params.width / 2),
        y: Math.round(params.height / 2),
      },
    },
  )
    .id(params.id)
    .name(params.name)
    .layer('PROP')
    .position(params.position)
    .scale({ x: 1, y: 1 })
    .zIndex(params.zIndex)
    .disableAutoZIndex(true)
    .disableHit(Boolean(params.disableHit))
    .metadata({ [ITEM_META_KEY]: params.meta });

  if (params.attachedTo) {
    builder
      .attachedTo(params.attachedTo)
      .disableAttachmentBehavior(['SCALE', 'ROTATION']);
  }

  return builder.build();
}

function computeLayout(
  anchor: MapPoint,
  slotCount: number,
  activeIndex: number,
  sceneDpi: number,
) {
  const slotGap = SLOT_GAP_CELLS * sceneDpi;
  const clampedActive =
    slotCount <= 0 ? 0 : Math.max(0, Math.min(activeIndex, slotCount - 1));

  const slotPositions: MapPoint[] = [];
  for (let i = 0; i < slotCount; i += 1) {
    slotPositions.push({
      x: anchor.x + (i - (slotCount - 1) / 2) * slotGap,
      y: anchor.y,
    });
  }

  const barSprite = getBarSpriteForSlots(slotCount);
  const barMiddlePos: MapPoint = { x: anchor.x, y: anchor.y };

  const activeSlotPos = slotPositions[clampedActive] ?? anchor;
  const pointerPos: MapPoint = {
    x: activeSlotPos.x,
    y: anchor.y - POINTER_OFFSET_Y_CELLS * sceneDpi,
  };

  const controlsY = anchor.y + CONTROLS_OFFSET_Y_CELLS * sceneDpi;
  const controlsGapX = CONTROLS_GAP_X_CELLS * sceneDpi;

  return {
    slotGap,
    barSprite,
    barMiddlePos,
    slotPositions,
    pointerPos,
    prevPos: { x: anchor.x - controlsGapX, y: controlsY },
    removePos: { x: anchor.x, y: controlsY },
    nextPos: { x: anchor.x + controlsGapX, y: controlsY },
  };
}

async function readTrackerState(): Promise<InitiativeState | null> {
  if (await OBR.scene.isReady()) {
    const sceneMeta = await OBR.scene.getMetadata();
    const fromScene = normalizeInitiativeState(sceneMeta[INITIATIVE_META_KEY]);
    if (fromScene) return fromScene;
  }
  const roomMeta = await OBR.room.getMetadata();
  return normalizeInitiativeState(roomMeta[INITIATIVE_META_KEY]);
}

async function saveTrackerState(state: InitiativeState | undefined): Promise<void> {
  const payload = { [INITIATIVE_META_KEY]: state };
  await Promise.all([
    OBR.room.setMetadata(payload),
    (async () => {
      if (await OBR.scene.isReady()) {
        await OBR.scene.setMetadata(payload);
      }
    })(),
  ]);
}

async function resolveTrackerAnchor(
  existingItems: Item[],
  state: InitiativeState,
  sceneDpi: number,
  forceNewPosition: boolean,
): Promise<MapPoint> {
  if (!forceNewPosition) {
    const barMiddle = existingItems.find((item) => item.id === MAP_BAR_MIDDLE_ID);
    if (barMiddle) {
      return { x: barMiddle.position.x, y: barMiddle.position.y };
    }

    const slotItems = existingItems
      .map((item) => ({ item, meta: getTrackerItemMeta(item) }))
      .filter(
        (entry): entry is { item: Item; meta: TrackerItemMeta } =>
          entry.meta?.kind === 'slot',
      )
      .sort((a, b) => (a.meta.slotIndex ?? 0) - (b.meta.slotIndex ?? 0));

    const slot0 = slotItems[0];
    if (slot0) {
      const existingCount = slot0.meta.slotCount ?? slotItems.length;
      const existingGap = slot0.meta.slotGap ?? SLOT_GAP_CELLS * sceneDpi;
      return {
        x: slot0.item.position.x + ((existingCount - 1) / 2) * existingGap,
        y: slot0.item.position.y,
      };
    }

    const btnRemove = existingItems.find(
      (item) => getTrackerItemMeta(item)?.kind === 'btn-remove',
    );
    if (btnRemove) {
      return {
        x: btnRemove.position.x,
        y: btnRemove.position.y - CONTROLS_OFFSET_Y_CELLS * sceneDpi,
      };
    }

    if (state.anchor) {
      return state.anchor;
    }
  }

  const [vw, vh] = await Promise.all([
    OBR.viewport.getWidth(),
    OBR.viewport.getHeight(),
  ]);
  return OBR.viewport.inverseTransformPoint({ x: vw / 2, y: vh / 2 });
}

export async function clearTrackerFromScene(): Promise<void> {
  if (!OBR.isAvailable || !(await OBR.scene.isReady())) {
    await saveTrackerState(undefined);
    return;
  }

  const existing = await OBR.scene.items.getItems(
    (item) => getTrackerItemMeta(item) !== null || isLegacyBarCap(item),
  );
  if (existing.length > 0) {
    await OBR.scene.items.deleteItems(existing.map((item) => item.id));
  }
  await saveTrackerState(undefined);
}

export async function renderTrackerOnScene(
  state: InitiativeState,
  forceNewPosition = false,
): Promise<InitiativeState> {
  if (!OBR.isAvailable || !(await OBR.scene.isReady())) {
    await saveTrackerState(state);
    return state;
  }

  if (state.slots.length === 0) {
    await clearTrackerFromScene();
    return state;
  }

  const [sceneDpi, existingItems] = await Promise.all([
    OBR.scene.grid.getDpi(),
    OBR.scene.items.getItems(
      (item) => getTrackerItemMeta(item) !== null || isLegacyBarCap(item),
    ),
  ]);

  const anchor = await resolveTrackerAnchor(
    existingItems,
    state,
    sceneDpi,
    forceNewPosition,
  );

  const clampedActive = Math.max(
    0,
    Math.min(state.activeIndex, state.slots.length - 1),
  );
  const layout = computeLayout(
    anchor,
    state.slots.length,
    clampedActive,
    sceneDpi,
  );

  const existingById = new Map(existingItems.map((item) => [item.id, item]));
  const barMiddleItem = existingById.get(MAP_BAR_MIDDLE_ID);
  const pointerItem = existingById.get(MAP_POINTER_ID);
  const btnPrevItem = existingById.get(MAP_BTN_PREV_ID);
  const btnRemoveItem = existingById.get(MAP_BTN_REMOVE_ID);
  const btnNextItem = existingById.get(MAP_BTN_NEXT_ID);

  const hasAllStructural = Boolean(
    barMiddleItem && pointerItem && btnPrevItem && btnRemoveItem && btnNextItem,
  );
  const baseZ = barMiddleItem?.zIndex ?? Date.now();

  const slotItems: Item[] = [];
  for (let i = 0; i < state.slots.length; i += 1) {
    const slot = state.slots[i];
    const sprite = getSpriteById(slot.side, slot.spriteId);

    slotItems.push(
      buildProportionalImage({
        id: `${MAP_SLOT_ID_PREFIX}${i}`,
        name: `UltiTracker ${slot.side === 'hero' ? 'Hero' : 'Villain'} ${i + 1}`,
        src: sprite.src,
        width: sprite.width,
        height: sprite.height,
        targetCellsTall: CHARACTER_CELLS_TALL,
        position: layout.slotPositions[i],
        zIndex: baseZ + 10 + i,
        attachedTo: MAP_BAR_MIDDLE_ID,
        disableHit: true,
        meta: {
          kind: 'slot',
          slotId: slot.id,
          slotIndex: i,
          side: slot.side,
          slotGap: layout.slotGap,
          slotCount: state.slots.length,
        },
      }),
    );
  }

  if (hasAllStructural) {
    const legacyCapIds = existingItems
      .filter((item) => isLegacyBarCap(item))
      .map((item) => item.id);
    if (legacyCapIds.length > 0) {
      await OBR.scene.items.deleteItems(legacyCapIds);
    }

    const barDpi = Math.max(
      1,
      Math.round(layout.barSprite.height / BAR_CELLS_TALL),
    );
    await OBR.scene.items.updateItems([barMiddleItem as Image], (draft) => {
      for (const item of draft) {
        item.image = {
          width: layout.barSprite.width,
          height: layout.barSprite.height,
          mime: 'image/png',
          url: resolveAssetUrl(layout.barSprite.src),
        };
        item.grid = {
          dpi: barDpi,
          offset: {
            x: Math.round(layout.barSprite.width / 2),
            y: Math.round(layout.barSprite.height / 2),
          },
        };
        item.position = layout.barMiddlePos;
        item.scale = { x: 1, y: 1 };
      }
    });

    await OBR.scene.items.updateItems(
      [pointerItem!, btnPrevItem!, btnRemoveItem!, btnNextItem!],
      (draft) => {
        for (const item of draft) {
          item.scale = { x: 1, y: 1 };
          switch (item.id) {
            case MAP_POINTER_ID:
              item.position = layout.pointerPos;
              break;
            case MAP_BTN_PREV_ID:
              item.position = layout.prevPos;
              break;
            case MAP_BTN_REMOVE_ID:
              item.position = layout.removePos;
              break;
            case MAP_BTN_NEXT_ID:
              item.position = layout.nextPos;
              break;
          }
        }
      },
    );

    const oldSlotIds = existingItems
      .filter((item) => getTrackerItemMeta(item)?.kind === 'slot')
      .map((item) => item.id);
    if (oldSlotIds.length > 0) {
      await OBR.scene.items.deleteItems(oldSlotIds);
    }
    await OBR.scene.items.addItems(slotItems);
  } else {
    if (existingItems.length > 0) {
      await OBR.scene.items.deleteItems(existingItems.map((item) => item.id));
    }

    const frameItems: Item[] = [
      buildProportionalImage({
        id: MAP_BAR_MIDDLE_ID,
        name: 'UltiTracker Bar',
        src: layout.barSprite.src,
        width: layout.barSprite.width,
        height: layout.barSprite.height,
        targetCellsTall: BAR_CELLS_TALL,
        position: layout.barMiddlePos,
        zIndex: baseZ,
        disableHit: false,
        meta: { kind: 'bar' },
      }),
      ...slotItems,
      buildProportionalImage({
        id: MAP_POINTER_ID,
        name: 'UltiTracker Pointer',
        src: UI_SPRITES.pointerDown.src,
        width: UI_SPRITES.pointerDown.width,
        height: UI_SPRITES.pointerDown.height,
        targetCellsTall: POINTER_CELLS_TALL,
        position: layout.pointerPos,
        zIndex: baseZ + 50,
        attachedTo: MAP_BAR_MIDDLE_ID,
        disableHit: true,
        meta: { kind: 'pointer' },
      }),
      buildProportionalImage({
        id: MAP_BTN_PREV_ID,
        name: 'UltiTracker Prev',
        src: UI_SPRITES.arrowLeft.src,
        width: UI_SPRITES.arrowLeft.width,
        height: UI_SPRITES.arrowLeft.height,
        targetCellsTall: ARROW_CELLS_TALL,
        position: layout.prevPos,
        zIndex: baseZ + 60,
        attachedTo: MAP_BAR_MIDDLE_ID,
        disableHit: false,
        meta: { kind: 'btn-prev' },
      }),
      buildProportionalImage({
        id: MAP_BTN_REMOVE_ID,
        name: 'UltiTracker Remove',
        src: UI_SPRITES.removeX.src,
        width: UI_SPRITES.removeX.width,
        height: UI_SPRITES.removeX.height,
        targetCellsTall: X_CELLS_TALL,
        position: layout.removePos,
        zIndex: baseZ + 61,
        attachedTo: MAP_BAR_MIDDLE_ID,
        disableHit: false,
        meta: { kind: 'btn-remove' },
      }),
      buildProportionalImage({
        id: MAP_BTN_NEXT_ID,
        name: 'UltiTracker Next',
        src: UI_SPRITES.arrowRight.src,
        width: UI_SPRITES.arrowRight.width,
        height: UI_SPRITES.arrowRight.height,
        targetCellsTall: ARROW_CELLS_TALL,
        position: layout.nextPos,
        zIndex: baseZ + 62,
        attachedTo: MAP_BAR_MIDDLE_ID,
        disableHit: false,
        meta: { kind: 'btn-next' },
      }),
    ];

    await OBR.scene.items.addItems(frameItems);
  }

  const nextState: InitiativeState = {
    ...state,
    activeIndex: clampedActive,
    anchor,
  };
  await saveTrackerState(nextState);
  return nextState;
}

export async function stepTrackerOnScene(direction: 'prev' | 'next'): Promise<void> {
  if (!OBR.isAvailable || !(await OBR.scene.isReady())) return;

  const state = await readTrackerState();
  if (!state || state.slots.length === 0) return;

  const nextState = stepInitiative(state, direction);

  const [sceneDpi, trackerItems] = await Promise.all([
    OBR.scene.grid.getDpi(),
    OBR.scene.items.getItems((item) => getTrackerItemMeta(item) !== null),
  ]);

  const targetSlot = trackerItems.find((item) => {
    const meta = getTrackerItemMeta(item);
    return meta?.kind === 'slot' && meta.slotIndex === nextState.activeIndex;
  });
  const pointerItem = trackerItems.find((item) => item.id === MAP_POINTER_ID);

  if (!targetSlot || !pointerItem) {
    await renderTrackerOnScene(nextState);
    return;
  }

  const nextPointerPos: MapPoint = {
    x: targetSlot.position.x,
    y: targetSlot.position.y - POINTER_OFFSET_Y_CELLS * sceneDpi,
  };

  await OBR.scene.items.updateItems([pointerItem], (draft) => {
    for (const item of draft) {
      item.position = nextPointerPos;
    }
  });

  await saveTrackerState(nextState);
}

export async function removeActiveSlotOnScene(): Promise<void> {
  if (!OBR.isAvailable || !(await OBR.scene.isReady())) return;

  const state = await readTrackerState();
  if (!state || state.slots.length === 0) return;

  const nextState = removeActiveSlot(state);
  if (nextState.slots.length === 0) {
    await clearTrackerFromScene();
    return;
  }

  await renderTrackerOnScene(nextState);
}
