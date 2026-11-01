import { useMemo, useState } from 'preact/hooks';
import { catalog } from '../lib/catalog';
import { dropOverride, effectiveSong, overrides, saveOverride } from '../lib/overrides';
import { cleanAssignments, cueKey, type SongOverride } from '../model/overrides';
import { CUE_LABEL, CUE_TYPES, cleanNote } from '../model/cues';
import { displayKey } from '../model/chordpro';
import { rolesFor, type RoleKind } from '../model/roles';
import type { Assignment, CueType, Song } from '../model/types';
import { IconClose } from '../ui/icons';

type Row = { member: string; role: string };
const toRows = (l?: Assignment[]): Row[] => (l ?? []).map((a) => ({ member: a.member === '*' ? 'Tous' : a.member, role: a.role ?? '' }));
const fromRows = (r: Row[]): Assignment[] => cleanAssignments(r.map((x) => ({ member: x.member, role: x.role || undefined })));
const same = (a: Assignment[] = [], b: Assignment[] = []) => JSON.stringify(a) === JSON.stringify(b);

/** Noms déjà utilisés dans le catalogue, proposés à la saisie. */
function useMembers(): string[] {
  const state = catalog.value;
  return useMemo(() => {
    const set = new Set<string>();
    state?.songs.forEach((s) => {
      [...s.singers, ...s.musicians, ...s.sections.flatMap((x) => x.voices ?? [])].forEach((a) => a.member !== '*' && set.add(a.member));
    });
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [state]);
}

export function EditPanel({ base, onClose }: { base: Song; onClose: () => void }) {
  const current = effectiveSong(base);
  const lyricSections = current.sections.filter((s) => s.kind === 'lyrics');
  const [singers, setSingers] = useState<Row[]>(toRows(current.singers));
  const [musicians, setMusicians] = useState<Row[]>(toRows(current.musicians));
  const [sections, setSections] = useState<Record<string, Row[]>>(
    Object.fromEntries(lyricSections.map((s) => [s.id, toRows(s.voices)])),
  );
  const [notes, setNotes] = useState(current.notes ?? '');
  const cueSections = current.sections.filter((s) => s.kind === 'instrumental');
  const [cues, setCues] = useState<Record<string, { cue: CueType; note: string }>>(
    Object.fromEntries(cueSections.map((s) => [s.id, { cue: s.cue ?? 'interlude', note: s.label ?? '' }])),
  );
  const [openSec, setOpenSec] = useState<string | null>(null);
  const members = useMembers();
  const hasLocal = !!overrides.value[base.id];

  const save = async () => {
    const ov: SongOverride = { songId: base.id, updatedAt: Date.now() };
    const s = fromRows(singers);
    const m = fromRows(musicians);
    if (!same(s, base.singers)) ov.singers = s;
    if (!same(m, base.musicians)) ov.musicians = m;
    const n = notes.trim().replace(/[{}]/g, '').replace(/\s+/g, ' ');
    if (n !== (base.notes ?? '')) ov.notes = n;
    for (const sec of base.sections) {
      if (sec.kind !== 'lyrics') continue;
      const v = fromRows(sections[sec.id] ?? []);
      if (!same(v, sec.voices)) {
        (ov.sectionVoices ??= {})[sec.id] = v;
        (ov.sectionLabels ??= {})[sec.id] = sec.label ?? null;
      }
    }
    for (const sec of base.sections) {
      if (sec.kind !== 'instrumental' || !cues[sec.id]) continue;
      const c = cues[sec.id];
      const note = c.note.trim() ? (cleanNote(c.note) ?? '') : '';
      if (cueKey(c.cue, note || undefined) !== cueKey(sec.cue, sec.label)) {
        (ov.cues ??= {})[sec.id] = { cue: c.cue, note };
        (ov.cueGuards ??= {})[sec.id] = cueKey(sec.cue, sec.label);
      }
    }
    await saveOverride(ov);
    onClose();
  };

  const revert = async () => {
    if (!confirm('Abandonner les modifications non publiées de ce morceau sur cet appareil ?')) return;
    await dropOverride(base.id);
    onClose();
  };

  return (
    <div class="sheet" role="dialog" aria-modal="true" aria-label="Modifier les infos du morceau">
      <header class="sheet-head">
        <div class="sheet-title">
          <div class="t">Infos du morceau</div>
          <div class="a">{base.title}</div>
        </div>
        <button class="icon-btn" onClick={onClose} aria-label="Fermer"><IconClose /></button>
      </header>

      <datalist id="zovy-members">{members.map((m) => <option value={m} key={m} />)}<option value="Tous" /></datalist>

      <div class="sheet-body">
        <h3 class="sheet-h">Tonalité & commentaire</h3>
        <div class="row note-row">
          <span class={`key${base.key ? '' : ' empty'}`}>{base.key ? displayKey(base.key) : '–'}</span>
          <input class="in" type="text" placeholder="Ex. Capo 5 · Intro sax · Tempo lent" autoFocus={!notes} value={notes} maxLength={80}
            onInput={(e) => setNotes((e.target as HTMLInputElement).value)} aria-label="Commentaire" />
          {notes ? (
            <button class="icon-btn del" onClick={() => setNotes('')} aria-label="Effacer le commentaire"><IconClose size={26} /></button>
          ) : <span />}
        </div>

        <h3 class="sheet-h voice">Chanteurs du morceau</h3>
        <RoleRows rows={singers} kind="voice" onChange={setSingers} addLabel="Ajouter un chanteur" />

        <h3 class="sheet-h inst">Musiciens</h3>
        <RoleRows rows={musicians} kind="inst" onChange={setMusicians} addLabel="Ajouter un musicien" />

        {lyricSections.length > 0 && <h3 class="sheet-h voice">Voix par section</h3>}
        {lyricSections.map((s, i) => {
          const rows = sections[s.id] ?? [];
          const open = openSec === s.id;
          const first = s.stanzas[0]?.[0] ?? '';
          return (
            <div class={`sec-card${open ? ' open' : ''}`} key={s.id}>
              <button class="sec-card-head" onClick={() => setOpenSec(open ? null : s.id)} aria-expanded={open}>
                <span class="sec-card-t">{s.label ?? `Section ${i + 1}`}</span>
                <span class="sec-card-x">{first}</span>
                <span class="sec-card-n">{rows.filter((r) => r.member.trim()).length || ''}</span>
              </button>
              {open && (
                <RoleRows rows={rows} kind="voice" addLabel="Ajouter une voix"
                  onChange={(r) => setSections((prev) => ({ ...prev, [s.id]: r }))} />
              )}
            </div>
          );
        })}

        {cueSections.length > 0 && (
        <div class="cues-block">
          <h3 class="sheet-h">Intro · Interludes · Outro</h3>
          {cueSections.map((s) => {
            const idx = current.sections.indexOf(s);
            const before = current.sections.slice(0, idx).reverse().find((x) => x.kind === 'lyrics')?.stanzas.at(-1)?.at(-1);
            const c = cues[s.id];
            return (
              <div class="cue-row" key={s.id}>
                <select class="in sel" value={c.cue} aria-label="Catégorie"
                  onChange={(e) => setCues((p) => ({ ...p, [s.id]: { ...c, cue: (e.target as HTMLSelectElement).value as CueType } }))}>
                  {CUE_TYPES.map((t) => <option value={t} key={t}>{CUE_LABEL[t]}</option>)}
                </select>
                <input class="in" type="text" placeholder="Commentaire (ex. guitare, ×4)" maxLength={60} value={c.note}
                  onInput={(e) => setCues((p) => ({ ...p, [s.id]: { ...c, note: (e.target as HTMLInputElement).value } }))} aria-label="Commentaire du repère" />
                <span class="cue-where">{before ? `après « ${before} »` : 'avant les paroles'}</span>
              </div>
            );
          })}
        </div>
        )}
      </div>

      <footer class="sheet-foot">
        {hasLocal ? <button class="btn ghost" onClick={revert}>Rétablir la version publiée</button> : <span />}
        <button class="btn" onClick={onClose}>Annuler</button>
        <button class="btn primary" onClick={save}>Enregistrer</button>
      </footer>
    </div>
  );
}

function RoleRows({ rows, kind, onChange, addLabel }: { rows: Row[]; kind: RoleKind; onChange: (r: Row[]) => void; addLabel: string }) {
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
