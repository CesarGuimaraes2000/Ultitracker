import { useEffect, useRef, useState } from 'react';
import OBR from '@owlbear-rodeo/sdk';
import { ChevronDown, Minus, Plus } from 'lucide-react';
import { POPOVER_ID } from '../constants/keys';
import {
  HERO_SPRITES,
  UI_SPRITES,
  VILLAIN_SPRITES,
  getSpriteById,
  getSpritesBySide,
} from '../constants/sprites';
import { useInitiativeTracker } from '../obr/useInitiativeTracker';
import type { CombatSide, SpriteOption } from '../types/tracker';
import { MAX_TURNS, MIN_TURNS, clampTurnCount } from '../utils/initiative';
import { PixelSprite } from './PixelSprite';

interface TurnFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
}

function TurnField({ label, value, onChange }: TurnFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-normal text-[var(--obr-text-secondary)]">
        {label}
      </label>
      <div className="flex h-11 items-center justify-between rounded-xl border border-[var(--obr-border)] px-2 transition-colors focus-within:border-[var(--obr-primary)]">
        <button
          type="button"
          onClick={() => onChange(clampTurnCount(value - 1))}
          disabled={value <= MIN_TURNS}
          aria-label={`Decrease ${label}`}
          className="flex h-7 w-6 items-center justify-center rounded-lg text-[var(--obr-text-secondary)] transition hover:bg-[var(--obr-surface)] hover:text-[var(--obr-text-primary)] disabled:cursor-not-allowed disabled:opacity-35"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <input
          type="number"
          min={MIN_TURNS}
          max={MAX_TURNS}
          value={value}
          onChange={(e) => {
            const next = e.target.value === '' ? 0 : Number(e.target.value);
            onChange(clampTurnCount(next));
          }}
          aria-label={label}
          className="w-8 bg-transparent text-center text-sm font-medium text-[var(--obr-text-primary)] outline-none"
        />
        <button
          type="button"
          onClick={() => onChange(clampTurnCount(value + 1))}
          disabled={value >= MAX_TURNS}
          aria-label={`Increase ${label}`}
          className="flex h-7 w-6 items-center justify-center rounded-lg text-[var(--obr-text-secondary)] transition hover:bg-[var(--obr-surface)] hover:text-[var(--obr-text-primary)] disabled:cursor-not-allowed disabled:opacity-35"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

interface SpriteTriggerProps {
  label: string;
  selected: SpriteOption;
  isOpen: boolean;
  onToggle: () => void;
}

function SpriteTrigger({ label, selected, isOpen, onToggle }: SpriteTriggerProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-normal text-[var(--obr-text-secondary)]">
        {label}
      </span>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-label={`Choose ${label}`}
        title={selected.label}
        className={`flex h-11 w-full items-center justify-between rounded-xl border px-3 transition ${
          isOpen
            ? 'border-[var(--obr-primary)] bg-[color-mix(in_srgb,var(--obr-primary)_14%,transparent)]'
            : 'border-[var(--obr-border)] bg-[var(--obr-surface)] hover:bg-[var(--obr-surface-hover)]'
        }`}
      >
        <PixelSprite
          src={selected.src}
          alt={selected.label}
          boxClassName="w-6 h-8"
          imgClassName="object-bottom"
        />
        <ChevronDown
          className={`h-4 w-4 text-[var(--obr-text-secondary)] transition-transform ${
            isOpen ? 'rotate-180 text-[var(--obr-primary)]' : ''
          }`}
        />
      </button>
    </div>
  );
}

interface SpriteGridProps {
  options: SpriteOption[];
  selectedId: string;
  onSelect: (id: string) => void;
}

function SpriteGrid({ options, selectedId, onSelect }: SpriteGridProps) {
  return (
    <div className="grid max-h-36 grid-cols-4 gap-1.5 overflow-y-auto rounded-xl border border-[var(--obr-border)] bg-[var(--obr-surface)] p-2">
      {options.map((opt) => {
        const active = opt.id === selectedId;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onSelect(opt.id)}
            title={opt.label}
            aria-label={opt.label}
            aria-pressed={active}
            className={`flex h-12 items-center justify-center rounded-lg border transition ${
              active
                ? 'border-[var(--obr-primary)] bg-[color-mix(in_srgb,var(--obr-primary)_20%,transparent)]'
                : 'border-transparent hover:bg-[var(--obr-surface-hover)]'
            }`}
          >
            <PixelSprite
              src={opt.src}
              alt={opt.label}
              boxClassName="w-7 h-10"
              imgClassName="object-bottom"
            />
          </button>
        );
      })}
    </div>
  );
}

export function InitiativeTracker() {
  const {
    state,
    syncMode,
    generateOrder,
    nextTurn,
    prevTurn,
    removeCurrent,
    selectSlot,
    cycleSprite,
  } = useInitiativeTracker();

  const [draftPlayers, setDraftPlayers] = useState(state.playerTurns);
  const [draftEnemies, setDraftEnemies] = useState(state.enemyTurns);
  const [draftWinner, setDraftWinner] = useState<CombatSide>(state.winner);
  const [draftHeroSpriteId, setDraftHeroSpriteId] = useState(state.heroSpriteId);
  const [draftVillainSpriteId, setDraftVillainSpriteId] = useState(state.villainSpriteId);
  const [openPicker, setOpenPicker] = useState<CombatSide | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeSlotRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setDraftPlayers(state.playerTurns);
    setDraftEnemies(state.enemyTurns);
    setDraftWinner(state.winner);
    setDraftHeroSpriteId(state.heroSpriteId);
    setDraftVillainSpriteId(state.villainSpriteId);
  }, [
    state.playerTurns,
    state.enemyTurns,
    state.winner,
    state.heroSpriteId,
    state.villainSpriteId,
  ]);

  useEffect(() => {
    activeSlotRef.current?.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  }, [state.activeIndex, state.slots.length]);

  useEffect(() => {
    if (!OBR.isAvailable) return;
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    const syncHeight = () => {
      if (!OBR.isReady) return;
      const desired = Math.min(460, Math.max(260, Math.ceil(el.scrollHeight)));
      void OBR.popover.setHeight(POPOVER_ID, desired);
    };

    const observer = new ResizeObserver(syncHeight);
    observer.observe(el);
    OBR.onReady(syncHeight);

    return () => observer.disconnect();
  }, [openPicker]);

  const selectedHero = getSpriteById('hero', draftHeroSpriteId);
  const selectedVillain = getSpriteById('villain', draftVillainSpriteId);
  const isObr = OBR.isAvailable || syncMode === 'obr';

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await generateOrder(
        draftPlayers,
        draftEnemies,
        draftWinner,
        draftHeroSpriteId,
        draftVillainSpriteId,
      );
      if (OBR.isAvailable && OBR.isReady) {
        void OBR.popover.close(POPOVER_ID);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className="flex w-full flex-col gap-3 p-4 text-[var(--obr-text-primary)]"
    >
      <form onSubmit={handleApply} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <TurnField
            label="Players"
            value={draftPlayers}
            onChange={setDraftPlayers}
          />
          <TurnField
            label="Enemies"
            value={draftEnemies}
            onChange={setDraftEnemies}
          />
        </div>

        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-3">
            <SpriteTrigger
              label="Hero Sprite"
              selected={selectedHero}
              isOpen={openPicker === 'hero'}
              onToggle={() =>
                setOpenPicker((prev) => (prev === 'hero' ? null : 'hero'))
              }
            />
            <SpriteTrigger
              label="Enemy Sprite"
              selected={selectedVillain}
              isOpen={openPicker === 'villain'}
              onToggle={() =>
                setOpenPicker((prev) => (prev === 'villain' ? null : 'villain'))
              }
            />
          </div>

          {openPicker === 'hero' && (
            <SpriteGrid
              options={HERO_SPRITES}
              selectedId={selectedHero.id}
              onSelect={(id) => {
                setDraftHeroSpriteId(id);
                setOpenPicker(null);
              }}
            />
          )}

          {openPicker === 'villain' && (
            <SpriteGrid
              options={VILLAIN_SPRITES}
              selectedId={selectedVillain.id}
              onSelect={(id) => {
                setDraftVillainSpriteId(id);
                setOpenPicker(null);
              }}
            />
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-normal text-[var(--obr-text-secondary)]">
            Initiative Winner
          </span>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setDraftWinner('hero')}
              className={`flex h-10 items-center justify-center rounded-xl border text-sm font-medium transition ${
                draftWinner === 'hero'
                  ? 'border-[var(--obr-primary)] bg-[color-mix(in_srgb,var(--obr-primary)_18%,transparent)] text-[var(--obr-text-primary)]'
                  : 'border-transparent bg-[var(--obr-surface)] text-[var(--obr-text-secondary)] hover:bg-[var(--obr-surface-hover)]'
              }`}
            >
              Heroes
            </button>
            <button
              type="button"
              onClick={() => setDraftWinner('villain')}
              className={`flex h-10 items-center justify-center rounded-xl border text-sm font-medium transition ${
                draftWinner === 'villain'
                  ? 'border-[var(--obr-primary)] bg-[color-mix(in_srgb,var(--obr-primary)_18%,transparent)] text-[var(--obr-text-primary)]'
                  : 'border-transparent bg-[var(--obr-surface)] text-[var(--obr-text-secondary)] hover:bg-[var(--obr-surface-hover)]'
              }`}
            >
              Enemies
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting || (draftPlayers === 0 && draftEnemies === 0)}
          className="mt-0.5 flex h-9 w-full items-center justify-center rounded-xl border border-[color-mix(in_srgb,var(--obr-primary)_50%,transparent)] text-[13px] font-medium uppercase tracking-wider text-[var(--obr-primary)] transition hover:border-[var(--obr-primary)] hover:bg-[color-mix(in_srgb,var(--obr-primary)_10%,transparent)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? 'Rendering...' : 'Render on Map'}
        </button>
      </form>

      {/* Standalone Browser Preview (when outside Owlbear Rodeo) */}
      {!isObr && (
        <section className="flex flex-col items-center justify-center gap-2 rounded-xl border border-[var(--obr-border)] bg-[var(--obr-surface)] p-3">
          {state.slots.length === 0 ? (
            <button
              type="button"
              onClick={() =>
                void generateOrder(
                  draftPlayers,
                  draftEnemies,
                  draftWinner,
                  draftHeroSpriteId,
                  draftVillainSpriteId,
                )
              }
              className="rounded-xl border border-[var(--obr-border)] px-3 py-1.5 text-xs text-[var(--obr-text-secondary)] hover:border-[var(--obr-primary)] hover:text-[var(--obr-text-primary)]"
            >
              Reset
            </button>
          ) : (
            <>
              <div className="w-full overflow-x-auto py-1">
                <div className="mx-auto flex w-max items-end gap-2.5 px-2">
                  {state.slots.map((slot, index) => {
                    const isActive = index === state.activeIndex;
                    const sprite = getSpriteById(slot.side, slot.spriteId);
                    const canCycle = getSpritesBySide(slot.side).length > 1;

                    return (
                      <button
                        key={slot.id}
                        ref={isActive ? activeSlotRef : undefined}
                        type="button"
                        onClick={() => {
                          if (isActive && canCycle) cycleSprite(slot.id);
                          else selectSlot(index);
                        }}
                        className="flex flex-col items-center p-0.5"
                      >
                        <div className="flex h-7 w-7 items-center justify-center">
                          {isActive && (
                            <PixelSprite
                              src={UI_SPRITES.pointerDown.src}
                              alt="Current"
                              boxClassName="w-6 h-6"
                            />
                          )}
                        </div>
                        <PixelSprite
                          src={sprite.src}
                          alt={sprite.label}
                          boxClassName="w-10 h-14"
                          imgClassName="object-bottom"
                        />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-center gap-6 pt-1">
                <button
                  type="button"
                  onClick={prevTurn}
                  aria-label="Previous"
                  className="p-1 transition active:scale-95"
                >
                  <PixelSprite
                    src={UI_SPRITES.arrowLeft.src}
                    alt="Previous"
                    boxClassName="w-7 h-6"
                  />
                </button>
                <button
                  type="button"
                  onClick={removeCurrent}
                  aria-label="Remove"
                  className="p-1 transition active:scale-95"
                >
                  <PixelSprite
                    src={UI_SPRITES.removeX.src}
                    alt="Remove"
                    boxClassName="w-6 h-6"
                  />
                </button>
                <button
                  type="button"
                  onClick={nextTurn}
                  aria-label="Next"
                  className="p-1 transition active:scale-95"
                >
                  <PixelSprite
                    src={UI_SPRITES.arrowRight.src}
                    alt="Next"
                    boxClassName="w-7 h-6"
                  />
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
