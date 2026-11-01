#!/usr/bin/env python3
"""
Migration one-shot : legacy/Tononkira_Zovy.html -> data/songs/*.cho + data/setlists/*.json
+ docs/MIGRATION_REPORT.md

Usage : python3 -I scripts/migrate/legacy_html.py legacy/Tononkira_Zovy.html .
"""
from __future__ import annotations

import json
import re
import sys
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

from bs4 import BeautifulSoup, Tag

MEMBERS = {"HASINA", "MISA", "KE", "KETAKA", "HAJA", "TOKY"}
PART_ALIASES = {
    "LEAD": "lead", "HAUT": "haut", "BAS": "bas", "TENOR": "tenor", "TÉNOR": "tenor",
    "ALTO": "alto", "CHOEUR": "choeur", "CHŒUR": "choeur", "SOPRA": "soprano",
    "SOPRANO": "soprano",
}
NOTE_RE = re.compile(r"^(DO|R[EÉ]|MI|FA|SOL|LA|SI)\s*(B|B[EÉ]MOL|#|D|DI[EÈ]SE)?$", re.I)
CUE_RE = re.compile(r"^\s*(INTRO|INTERLUDE|OUTRO|FIN INTRO)\b", re.I)
NAMED_SECTION_RE = re.compile(r"^\s*--\s*(.+?)\s*--\s*$")
PAREN_LINE_RE = re.compile(r"^\s*\((.*)\)\s*$")


def slugify(s: str) -> str:
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.lower().replace("'", "").replace("’", "")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "sans-titre"


def norm_key(raw: str) -> str | None:
    m = NOTE_RE.match(raw.strip())
    if not m:
        return None
    root = m.group(1).upper().replace("É", "E")
    acc = m.group(2)
    if acc:
        acc = "b" if acc.upper().startswith("B") else "#"
        return f"{root}{acc}"
    return root


def split_title_key(text: str) -> tuple[str, str | None, str | None]:
    """'RAMALOYA (re)' -> ('RAMALOYA', 'RE', 're')"""
    text = " ".join(text.split())
    m = re.match(r"^(.*?)\s*\(([^()]*)\)\s*$", text)
    if m:
        key = norm_key(m.group(2))
        if key:
            return m.group(1).strip(), key, m.group(2)
    return text, None, None


INSTRUMENTS = ("GUITARE", "BASSE", "BATTERIE", "CLAVIER", "SAX", "KORINTSANA", "PERCUSSION")
SINGER_WORDS = MEMBERS | {"KETA", "VOIX", "LEAD", "CHOEUR", "IMPRO"}
# Validé par Hasina (2026-11-01) : morceaux absents de l'index legacy
ARTIST_OVERRIDES = {"tiana-ve": "MAHALEO", "iantrao": "MAHALEO", "sahondra": "JOHARY"}
TITLES_CONFIRMED = {"T"}
MANUAL_LINKS = {"TAO-ANATIN'NY-TOLOLA": "TAO-ANATIN'NY-TOLONA"}  # coquille dans l'index


def parse_header(text: str) -> dict:
    """'MILA TSIKY (do) - Misa & Hasina - Guitare Haja et Toky (capot 5)' -> champs structurés."""
    text = " ".join(text.split())
    segs = [x.strip() for x in text.split(" - ") if x.strip()]
    first = segs.pop(0) if segs else text
    out = {"title": first, "key": None, "key_raw": None, "singers": [], "musicians": [],
           "capo": None, "medley": [], "notes": [], "unknown": []}
    m = re.match(r"^(.*?)\s*\(([^()]*)\)\s*(.*)$", first)
    if m:
        k = norm_key(m.group(2))
        if k or not m.group(2).strip():
            out["title"], out["key"], out["key_raw"] = m.group(1).strip(), k, m.group(2)
            if m.group(3):
                segs.insert(0, m.group(3))
        elif m.group(2).strip():
            out["key_raw"] = m.group(2)
    is_medley = bool(re.search(r"\b(MEDLEY|MASHUP)\b", out["title"], re.I))
    for seg in segs:
        up = seg.upper()
        words = set(re.findall(r"[A-ZÀ-Ÿ]+", up))
        if any(i in up for i in INSTRUMENTS):
            cm = re.search(r"\(\s*capot\s*(\d+)\s*\)", seg, re.I)
            if cm:
                out["capo"] = int(cm.group(1))
                seg = (seg[:cm.start()] + seg[cm.end():]).strip()
            out["musicians"] += [x.strip() for x in seg.split("/") if x.strip()]
        elif words & SINGER_WORDS:
            out["singers"] += [x.strip() for x in seg.split("/") if x.strip()]
        elif is_medley:
            t, k, _ = split_title_key(seg)
            out["medley"].append(f"{t.upper()} ({k})" if k else t.upper())
            if out["key"] is None and k:
                out["key"] = k
        else:
            out["notes"].append(seg)
    return out


@dataclass
class Report:
    items: dict[str, list[str]] = field(default_factory=dict)

    def add(self, cat: str, msg: str) -> None:
        self.items.setdefault(cat, []).append(msg)


def parse_voices(inner: str, report: Report, song_id: str) -> str | None:
    """Retourne la valeur de la directive {voices: ...} ou None si ce n'est pas une ligne de voix."""
    tokens = re.findall(r"[\wÀ-ÿ]+", inner.upper())
    if not any(t in MEMBERS for t in tokens):
        return None
    if "/" not in inner and "&" not in inner and not any(t in PART_ALIASES for t in tokens):
        return None
    out = []
    for chunk in [c.strip() for c in inner.split("/") if c.strip()]:
        words = chunk.split()
        if words and words[0].upper() == "RESTE":
            words = ["*"] + words[1:]
        names = [w for w in words if w.upper().strip("&") in MEMBERS or w == "*"]
        rest = [w for w in words if w not in names and w != "&"]
        part_raw = " ".join(rest)
        part = PART_ALIASES.get(part_raw.upper(), part_raw.lower())
        if not names:
            # ex. "Reste Choeur", "Choeur 3 voix"
            out.append(f"*={part}")
            report.add("voix_non_standard", f"`{song_id}` : `{chunk}` → `*={part}`")
            continue
        if part_raw and part_raw.upper() not in PART_ALIASES and names != ["*"]:
            report.add("voix_non_standard", f"`{song_id}` : `{chunk}` → partie libre `{part}`")
        for n in names:
            n = n if n == "*" else n.capitalize()
            out.append(f"{n}={part}" if part else n)
    return ", ".join(out)


def lyrics_to_cho(lines: list[str], report: Report, song_id: str) -> list[str]:
    body: list[str] = []
    section_has_lines = False
    for raw in lines:
        line = raw.rstrip()
        if not line.strip():
            if body and body[-1] != "":
                body.append("")
            continue
        m = NAMED_SECTION_RE.match(line)
        if m:
            if body and body[-1] != "":
                body.append("")
            body.append(f"{{section: {m.group(1)}}}")
            section_has_lines = False
            continue
        if CUE_RE.match(line):
            body += [f"{{instrumental: {line.strip()}}}"]
            section_has_lines = False
            continue
        pm = PAREN_LINE_RE.match(line)
        if pm:
            v = parse_voices(pm.group(1), report, song_id)
            if v is not None:
                if section_has_lines:
                    if body[-1] != "":
                        body.append("")
                    body.append("{section}")
                body.append(f"{{voices: {v}}}")
                section_has_lines = False
                continue
        body.append(line)
        section_has_lines = True
    while body and body[0] == "":
        body.pop(0)
    while body and body[-1] == "":
        body.pop()
    return body


def main(src: str, root: str) -> None:
    root_p = Path(root)
    soup = BeautifulSoup(Path(src).read_text(encoding="utf-8"), "html.parser")
    report = Report()

    # 1. Paroles (source de vérité pour titre + tonalité)
    sections = soup.select("div.lyrics-section")
    songs: dict[str, dict] = {}
    legacy_to_id: dict[str, str] = {}
    for sec in sections:
        legacy = sec.get("id", "")
        h2 = sec.find("h2")
        pre = sec.find("pre")
        title_raw = h2.get_text(" ", strip=True) if h2 else legacy
        hd = parse_header(title_raw)
        title, key = hd["title"], hd["key"]
        if hd["key"] is None and hd["key_raw"] and hd["key_raw"].strip():
            report.add("tonalite_non_reconnue", f"`{legacy}` : `({hd['key_raw']})` dans `{title_raw}`")
        if hd["notes"]:
            report.add("notes_extraites", f"`{legacy}` : " + " | ".join(hd["notes"]))
        if len(title) <= 2 and title not in TITLES_CONFIRMED:
            report.add("titre_suspect", f"`{legacy}` : titre `{title}` (contenu : {(pre.get_text().strip().splitlines() or [''])[0][:40]}…)")
        text = pre.get_text() if pre else ""
        dup = next((x for x in songs.values() if x["legacy"] == legacy and "\n".join(x["lines"]) == text), None)
        if dup:
            report.add("doublon_supprime", f"`{legacy}` : section dupliquée à l'identique, une seule conservée")
            continue
        sid = slugify(legacy or title)
        base, n = sid, 2
        while sid in songs:
            sid = f"{base}-{n}"
            n += 1
        if sid != base:
            report.add("id_en_double", f"`{legacy}` → `{sid}`")
        lines = text.split("\n")
        songs[sid] = {"hd": hd, 
            "id": sid, "legacy": legacy, "title": title.upper(), "key": key,
            "artist": None, "lines": lines, "tags": ["medley"] if title.upper().startswith("MEDLEY") else [],
        }
        legacy_to_id[legacy] = sid

    lower_map = {k.lower(): v for k, v in legacy_to_id.items()}
    slug_map = {slugify(k): v for k, v in legacy_to_id.items()}

    def resolve(href: str, ctx: str) -> str | None:
        anchor = href.lstrip("#")
        if anchor in MANUAL_LINKS:
            report.add("lien_repare_manuel", f"{ctx} : `#{anchor}` → `#{MANUAL_LINKS[anchor]}`")
            anchor = MANUAL_LINKS[anchor]
        if anchor in legacy_to_id:
            return legacy_to_id[anchor]
        if anchor.lower() in lower_map:
            report.add("lien_resolu_par_casse", f"{ctx} : `#{anchor}`")
            return lower_map[anchor.lower()]
        if slugify(anchor) in slug_map:
            report.add("lien_resolu_par_slug", f"{ctx} : `#{anchor}`")
            return slug_map[slugify(anchor)]
        report.add("lien_casse", f"{ctx} : `#{anchor}` (aucune paroles trouvées)")
        return None

    # 2. Index artistes
    artists_header = soup.find("h1", id="artistesHeader")
    artists_block = artists_header.find_next_sibling("div") if artists_header else None
    for h2 in artists_block.find_all("h2", class_="collapsible") if artists_block else []:
        artist = " ".join(h2.get_text(" ", strip=True).split()).upper()
        content = h2.find_next_sibling("div")
        for a in content.find_all("a") if content else []:
            sid = resolve(a.get("href", ""), f"index `{artist}`")
            if not sid:
                continue
            s = songs[sid]
            _, idx_key, _ = split_title_key(a.get_text(" ", strip=True))
            if idx_key and s["key"] and idx_key != s["key"]:
                report.add("tonalite_conflit", f"`{sid}` : paroles `{s['key']}` vs index `{idx_key}` (paroles conservées)")
            if not s["key"] and idx_key:
                s["key"] = idx_key
            if s["artist"] and s["artist"] != artist:
                report.add("artistes_multiples", f"`{sid}` : `{s['artist']}` + `{artist}` (premier conservé)")
            else:
                s["artist"] = artist

    # 3. Setlist
    parts_def = [("repertoire-part1", "Première partie"), ("repertoire-part2", "Deuxième partie"),
                 ("repertoire-part3", "Réserve")]
    setlist = {"id": "concert-legacy", "name": "Répertoire (import legacy)", "parts": []}
    for ul_id, name in parts_def:
        ul = soup.find("ul", id=ul_id)
        ids = []
        for a in ul.find_all("a") if ul else []:
            sid = resolve(a.get("href", ""), f"répertoire `{name}`")
            if sid:
                ids.append(sid)
        setlist["parts"].append({"name": name, "songIds": ids})

    # 4. Écriture
    out_dir = root_p / "data" / "songs"
    out_dir.mkdir(parents=True, exist_ok=True)
    for f in out_dir.glob("*.cho"):
        f.unlink()
    for s in songs.values():
        if not s["artist"] and s["id"] in ARTIST_OVERRIDES:
            s["artist"] = ARTIST_OVERRIDES[s["id"]]
        if not s["artist"]:
            report.add("sans_artiste", f"`{s['id']}` ({s['title']}) → artiste `INCONNU`")
            s["artist"] = "INCONNU"
        if not s["key"]:
            report.add("sans_tonalite", f"`{s['id']}` ({s['title']})")
        head = [f"{{title: {s['title']}}}", f"{{artist: {s['artist']}}}"]
        if s["key"]:
            head.append(f"{{key: {s['key']}}}")
        hd = s["hd"]
        if hd["capo"]:
            head.append(f"{{capo: {hd['capo']}}}")
        if s["tags"]:
            head.append(f"{{tags: {', '.join(s['tags'])}}}")
        if hd["medley"]:
            head.append(f"{{medley: {' | '.join(hd['medley'])}}}")
        if hd["singers"]:
            head.append(f"{{singers: {' | '.join(hd['singers'])}}}")
        if hd["musicians"]:
            head.append(f"{{musicians: {' | '.join(hd['musicians'])}}}")
        if hd["notes"]:
            head.append(f"{{notes: {' | '.join(hd['notes'])}}}")
        body = lyrics_to_cho(s["lines"], report, s["id"])
        if not any(l and not l.startswith("{") for l in body):
            report.add("paroles_vides", f"`{s['id']}` ({s['title']})")
        (out_dir / f"{s['id']}.cho").write_text("\n".join(head + [""] + body) + "\n", encoding="utf-8")

    sl_dir = root_p / "data" / "setlists"
    sl_dir.mkdir(parents=True, exist_ok=True)
    (sl_dir / "concert-legacy.json").write_text(json.dumps(setlist, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # Mapping legacy pour la vérification
    (root_p / "scripts" / "migrate" / "legacy_map.json").write_text(
        json.dumps(legacy_to_id, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    titles = {
        "lien_casse": "Liens cassés (entrée d'index/répertoire sans paroles)",
        "sans_artiste": "Morceaux absents de l'index artistes",
        "sans_tonalite": "Morceaux sans tonalité (à compléter)",
        "tonalite_non_reconnue": "Parenthèse finale non reconnue comme tonalité",
        "tonalite_conflit": "Tonalité différente entre index et paroles",
        "artistes_multiples": "Morceau listé sous plusieurs artistes",
        "id_en_double": "IDs en double",
        "doublon_supprime": "Doublons supprimés",
        "titre_suspect": "Titres suspects",
        "notes_extraites": "Segments du titre déplacés en notes",
        "lien_repare_manuel": "Liens réparés manuellement",
        "paroles_vides": "Paroles vides",
        "voix_non_standard": "Voix non standard (à valider)",
        "lien_resolu_par_casse": "Liens réparés (casse différente)",
        "lien_resolu_par_slug": "Liens réparés (normalisation)",
    }
    md = ["# Rapport de migration legacy → ChordPro", "",
          f"- Morceaux : **{len(songs)}**",
          f"- Artistes : **{len({s['artist'] for s in songs.values()})}**",
          f"- Setlist : " + " / ".join(f"{p['name']} {len(p['songIds'])}" for p in setlist["parts"]), ""]
    for cat, label in titles.items():
        items = report.items.get(cat, [])
        if not items:
            continue
        md += [f"## {label} ({len(items)})", ""] + [f"- {i}" for i in items] + [""]
    (root_p / "docs" / "MIGRATION_REPORT.md").write_text("\n".join(md), encoding="utf-8")
    print("\n".join(md[:6]))
    for cat in titles:
        if report.items.get(cat):
            print(f"{cat}: {len(report.items[cat])}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
