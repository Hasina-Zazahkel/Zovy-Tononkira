import { effect, signal } from '@preact/signals';
import { settings } from './settings';

export type WakeState = 'unsupported' | 'off' | 'on' | 'error';
export const wakeState = signal<WakeState>('wakeLock' in navigator ? 'off' : 'unsupported');

let sentinel: WakeLockSentinel | null = null;

async function acquire() {
  if (!('wakeLock' in navigator) || sentinel || document.visibilityState !== 'visible') return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    wakeState.value = 'on';
    sentinel.addEventListener('release', () => {
      sentinel = null;
      if (wakeState.value === 'on') wakeState.value = 'off';
    });
  } catch {
    wakeState.value = 'error';
  }
}

async function release() {
  const s = sentinel;
  sentinel = null;
  await s?.release().catch(() => undefined);
  if (wakeState.value !== 'unsupported') wakeState.value = 'off';
}

/**
 * Le navigateur libère le verrou dès que l'onglet passe en arrière-plan :
 * on le reprend au retour au premier plan, et au premier geste (certains navigateurs l'exigent).
 */
/** Nouvelle tentative manuelle (bouton « Réessayer » des Réglages). */
export function retryWakeLock() {
  if (wakeState.value === 'error') wakeState.value = 'off';
  void acquire();
}

export function initWakeLock() {
  if (!('wakeLock' in navigator)) return;
  effect(() => { if (settings.value.keepAwake) void acquire(); else void release(); });
  const retry = () => { if (settings.value.keepAwake) void acquire(); };
  document.addEventListener('visibilitychange', retry);
  window.addEventListener('pointerdown', retry, { passive: true });
}
