import OBR from '@owlbear-rodeo/sdk';
import {
  CONTEXT_REMOVE_ID,
  ITEM_META_KEY,
  MAP_BTN_NEXT_ID,
  MAP_BTN_PREV_ID,
  MAP_BTN_REMOVE_ID,
  POPOVER_ID,
  TOOL_ID,
} from './constants/keys';
import {
  clearTrackerFromScene,
  removeActiveSlotOnScene,
  stepTrackerOnScene,
} from './obr/sceneTracker';

const BUTTON_COOLDOWN_MS = 180;

let actionQueue: Promise<void> = Promise.resolve();

function enqueueAction(task: () => Promise<void>): void {
  actionQueue = actionQueue
    .then(task)
    .catch((err) => console.error('[UltiTracker] Action error:', err));
}

function clearSelectionWithFollowUps(): void {
  void OBR.player.deselect();
  setTimeout(() => void OBR.player.deselect(), 40);
  setTimeout(() => void OBR.player.deselect(), 120);
}

OBR.onReady(async () => {
  // 1. Right-hand toolbar button opening the compact GM configuration popover.
  void OBR.tool.create({
    id: TOOL_ID,
    icons: [
      {
        icon: '/icon.svg',
        label: 'UltiTracker',
      },
    ],
    onClick(_context, elementId) {
      void OBR.popover.open({
        id: POPOVER_ID,
        url: '/',
        width: 260,
        height: 225,
        anchorElementId: elementId,
        anchorOrigin: {
          horizontal: 'LEFT',
          vertical: 'CENTER',
        },
        transformOrigin: {
          horizontal: 'RIGHT',
          vertical: 'CENTER',
        },
      });

      // Keep the user's currently active map tool (e.g. Move) selected.
      return false;
    },
  });

  // 2. Right-click context menu on the initiative bar itself to remove it from the map.
  void OBR.contextMenu.create({
    id: CONTEXT_REMOVE_ID,
    icons: [
      {
        icon: '/icon.svg',
        label: 'Remove Initiative',
        filter: {
          every: [
            {
              key: ['metadata', ITEM_META_KEY, 'kind'],
              value: 'bar',
              operator: '==',
            },
          ],
        },
      },
    ],
    onClick() {
      enqueueAction(() => clearTrackerFromScene());
    },
  });

  // 3. Direct on-map button click detection with unconditional deselection.
  const buttonLastTriggered = new Map<string, number>();

  OBR.player.onChange((player) => {
    const selection = player.selection ?? [];
    if (selection.length === 0) return;

    const hitButtons = [
      MAP_BTN_PREV_ID,
      MAP_BTN_REMOVE_ID,
      MAP_BTN_NEXT_ID,
    ].filter((id) => selection.includes(id));

    if (hitButtons.length === 0) return;

    // Immediately clear selection and catch pointerup re-selections so OBR
    // never keeps the floating item options menu visible over a button.
    clearSelectionWithFollowUps();

    const targetButton = hitButtons[0];
    const now = Date.now();
    const lastTriggered = buttonLastTriggered.get(targetButton) ?? 0;
    if (now - lastTriggered < BUTTON_COOLDOWN_MS) return;

    buttonLastTriggered.set(targetButton, now);

    enqueueAction(async () => {
      if (targetButton === MAP_BTN_PREV_ID) {
        await stepTrackerOnScene('prev');
      } else if (targetButton === MAP_BTN_REMOVE_ID) {
        await removeActiveSlotOnScene();
      } else if (targetButton === MAP_BTN_NEXT_ID) {
        await stepTrackerOnScene('next');
      }
      await OBR.player.deselect();
    });
  });
});
