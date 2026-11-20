import { useEffect } from 'react';
import OBR, { type Theme } from '@owlbear-rodeo/sdk';
import { InitiativeTracker } from './components/InitiativeTracker';

function applyTheme(theme: Theme): void {
  const root = document.documentElement.style;
  const isLight = theme.mode === 'LIGHT';

  root.setProperty('--obr-primary', theme.primary.main);
  root.setProperty('--obr-bg-paper', theme.background.paper);
  root.setProperty('--obr-bg-default', theme.background.default);
  root.setProperty('--obr-text-primary', theme.text.primary);
  root.setProperty('--obr-text-secondary', theme.text.secondary);
  root.setProperty('--obr-text-disabled', theme.text.disabled);
  root.setProperty(
    '--obr-border',
    isLight ? 'rgba(0, 0, 0, 0.23)' : 'rgba(255, 255, 255, 0.23)',
  );
  root.setProperty(
    '--obr-surface',
    isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.06)',
  );
  root.setProperty(
    '--obr-surface-hover',
    isLight ? 'rgba(0, 0, 0, 0.09)' : 'rgba(255, 255, 255, 0.1)',
  );
}

export function App() {
  useEffect(() => {
    document.body.classList.toggle('in-obr', OBR.isAvailable);

    if (!OBR.isAvailable) return;

    let cancelled = false;
    let unsubscribeTheme: (() => void) | undefined;

    OBR.onReady(async () => {
      if (cancelled) return;
      try {
        const theme = await OBR.theme.getTheme();
        if (!cancelled) applyTheme(theme);
      } catch (err) {
        console.error('[UltiTracker] Failed to read OBR theme:', err);
      }
      unsubscribeTheme = OBR.theme.onChange(applyTheme);
    });

    return () => {
      cancelled = true;
      unsubscribeTheme?.();
    };
  }, []);

  if (OBR.isAvailable) {
    return (
      <main className="h-full w-full">
        <InitiativeTracker />
      </main>
    );
  }

  return (
    <main className="flex min-h-full w-full items-center justify-center p-4">
      <div className="w-full max-w-[280px] rounded-2xl bg-[var(--obr-bg-paper)] shadow-2xl">
        <InitiativeTracker />
      </div>
    </main>
  );
}
