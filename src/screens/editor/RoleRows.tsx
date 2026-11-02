import { liveCatalog } from '../../lib/overrides';
import { rolesFor, type RoleKind } from '../../model/roles';
import type { Assignment } from '../../model/types';
import { IconClose } from '../../ui/icons';
import { cleanAssignments } from '../../model/overrides';

export type Row = { member: string; role: string };
export const toRows = (l?: Assignment[]): Row[] => (l ?? []).map((a) => ({ member: a.member === '*' ? 'Tous' : a.member, role: a.role ?? '' }));
export const fromRows = (r: Row[]): Assignment[] => cleanAssignments(r.map((x) => ({ member: x.member, role: x.role || undefined })));

export function RoleRows({ rows, kind, onChange, addLabel }: { rows: Row[]; kind: RoleKind; onChange: (r: Row[]) => void; addLabel: string }) {
  const roles = rolesFor(kind);
  const set = (i: number, patch: Partial<Row>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div class="rows">
      {rows.map((r, i) => (
        <div class="row" key={i}>
          <input class="in" type="text" list="zovy-members" placeholder={kind === 'voice' ? 'Chanteur' : 'Musicien'}
            value={r.member} onInput={(e) => set(i, { member: (e.target as HTMLInputElement).value })}
            autoComplete="off" autoCapitalize="words" aria-label="Nom" />
          <select class={`in sel ${kind}`} value={r.role} onChange={(e) => set(i, { role: (e.target as HTMLSelectElement).value })}
            aria-label={kind === 'voice' ? 'Voix' : 'Instrument'}>
            <option value="">{kind === 'voice' ? '— voix —' : '— instrument —'}</option>
            {roles.map((x) => <option value={x} key={x}>{x}</option>)}
            {r.role && !roles.includes(r.role) && <option value={r.role}>{r.role} (hors liste)</option>}
          </select>
          <button class="icon-btn del" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label="Retirer">
            <IconClose size={26} />
          </button>
        </div>
      ))}
      <button class={`add ${kind}`} onClick={() => onChange([...rows, { member: '', role: '' }])}>+ {addLabel}</button>
    </div>
  );
}

import { useMemo } from 'preact/hooks';

/** Noms déjà utilisés dans le catalogue, proposés à la saisie (datalist #zovy-members). */
export function MembersDatalist() {
  const state = liveCatalog.value;
  const members = useMemo(() => {
    const set = new Set<string>();
    state?.songs.forEach((s) => {
      [...s.singers, ...s.musicians, ...s.sections.flatMap((x) => x.voices ?? [])].forEach((a) => a.member !== '*' && set.add(a.member));
    });
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [state]);
  return <datalist id="zovy-members">{members.map((m) => <option value={m} key={m} />)}<option value="Tous" /></datalist>;
}
