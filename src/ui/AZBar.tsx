import { useRef, useState } from 'preact/hooks';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/**
 * Index alphabétique vertical. Tap sur une lettre, ou glisser le doigt le long de la barre.
 * Cible : élément #az-<lettre> (premier artiste de la lettre) dans le conteneur `scrollEl`.
 */
export function AZBar({ available, scrollEl }: { available: Set<string>; scrollEl: () => HTMLElement | null }) {
  const [active, setActive] = useState<string | null>(null);
  const last = useRef<string | null>(null);

  const jump = (l: string | null) => {
    if (!l || l === last.current) return;
    // lettre absente : on prend la suivante disponible
    const from = LETTERS.indexOf(l);
    const target = LETTERS.slice(from).find((x) => available.has(x)) ?? [...available].pop();
    if (!target) return;
    last.current = l;
    setActive(l);
    const el = document.getElementById(`az-${target}`);
    const sc = scrollEl();
    if (el && sc) sc.scrollTo({ top: el.offsetTop - (sc.querySelector<HTMLElement>('.search')?.offsetHeight ?? 0) - 12 });
  };

  const letterAt = (x: number, y: number) => (document.elementFromPoint(x, y) as HTMLElement | null)?.dataset?.l ?? null;

  return (
    <nav class="az" aria-label="Index alphabétique"
      onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); last.current = null; jump(letterAt(e.clientX, e.clientY)); }}
      onPointerMove={(e) => { if (e.buttons) jump(letterAt(e.clientX, e.clientY)); }}
      onPointerUp={() => { setActive(null); }}
      onPointerCancel={() => { setActive(null); }}>
      {LETTERS.map((l) => (
        <span key={l} data-l={l} class={`${available.has(l) ? '' : 'off'}${active === l ? ' on' : ''}`}>{l}</span>
      ))}
      {active && <div class="az-bubble" aria-hidden="true">{active}</div>}
    </nav>
  );
}
