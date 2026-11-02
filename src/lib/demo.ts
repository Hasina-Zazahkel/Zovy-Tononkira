import { signal } from '@preact/signals';

/** Build de démonstration (artefact) : aucun envoi réel, dialogues natifs remplacés. */
export const DEMO = import.meta.env.VITE_DEMO === '1';
export const demoToast = signal<string | null>(null);

let timer: number | undefined;
export function showToast(msg: string) {
  demoToast.value = msg;
  clearTimeout(timer);
  timer = window.setTimeout(() => { demoToast.value = null; }, 3500);
}

if (DEMO) {
  // Les dialogues natifs sont bloqués dans l'artefact : on accepte et on affiche le message.
  window.confirm = (m?: string) => { showToast(`Confirmé automatiquement (démo) : ${String(m ?? '').split('\n')[0]}`); return true; };
  window.alert = (m?: string) => showToast(String(m ?? ''));
}
