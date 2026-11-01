#!/usr/bin/env python3
"""
Vérifie public/data/songs.json contre le HTML legacy :
- chaque ligne de paroles d'origine est présente, dans l'ordre, sans perte
- chaque repère (--X--, INTERLUDE…, voix) est converti en structure
- index artistes et setlist correctement reliés
Usage : python3 -I scripts/migrate/verify_legacy.py legacy/Tononkira_Zovy.html .
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from legacy_html import (CUE_RE, MANUAL_LINKS, NAMED_SECTION_RE, PAREN_LINE_RE,  # noqa: E402
                         Report, parse_voices, slugify)
from bs4 import BeautifulSoup  # noqa: E402

src, root = sys.argv[1], Path(sys.argv[2])
soup = BeautifulSoup(Path(src).read_text(encoding="utf-8"), "html.parser")
catalog = {s["id"]: s for s in json.loads((root / "public/data/songs.json").read_text())["songs"]}
legacy_map = json.loads((root / "scripts/migrate/legacy_map.json").read_text())
setlist = json.loads((root / "data/setlists/concert-legacy.json").read_text())
fails: list[str] = []
seen: set[str] = set()
n_lines = n_cues = n_named = n_voices = 0

for sec in soup.select("div.lyrics-section"):
    legacy = sec["id"]
    if legacy in seen:
        continue
    seen.add(legacy)
    song = catalog.get(legacy_map[legacy])
    if not song:
        fails.append(f"{legacy} : absent du catalogue")
        continue
    exp_lines, exp_cues, exp_named, exp_voices = [], [], [], 0
    for line in sec.pre.get_text().split("\n"):
        line = line.rstrip()
        if not line.strip():
            continue
        if m := NAMED_SECTION_RE.match(line):
            exp_named.append(m.group(1))
        elif CUE_RE.match(line):
            exp_cues.append(line.strip())
        elif re.match(r"^\s*\.{2,}\s*MUSIQUE\s*\.{2,}\s*$", line, re.I):
            exp_cues.append("MUSIQUE")  # converti en repère instrumental
        elif (pm := PAREN_LINE_RE.match(line)) and parse_voices(pm.group(1), Report(), legacy) is not None:
            exp_voices += 1
        else:
            exp_lines.append(line)
    got_lines = [l for s in song["sections"] for st in s["stanzas"] for l in st]
    got_cues = [s for s in song["sections"] if s["kind"] == "instrumental"]
    got_named = [s["label"] for s in song["sections"] if s["kind"] == "lyrics" and s.get("label")]
    got_voices = sum(1 for s in song["sections"] if s.get("voices"))
    if got_lines != exp_lines:
        i = next((i for i, (a, b) in enumerate(zip(got_lines, exp_lines)) if a != b), min(len(got_lines), len(exp_lines)))
        fails.append(f"{legacy} : paroles divergentes à la ligne {i} ({len(got_lines)} vs {len(exp_lines)})")
    # Repères normalisés (catégorie + commentaire) et fusionnés quand consécutifs :
    # chaque repère d'origine doit avoir donné un repère, sans en inventer.
    if not (0 < len(got_cues) <= len(exp_cues)) and (got_cues or exp_cues):
        fails.append(f"{legacy} : {len(got_cues)} repères normalisés pour {len(exp_cues)} d'origine")
    if any(c.get("cue") not in ("intro", "interlude", "outro") for c in got_cues):
        fails.append(f"{legacy} : repère sans catégorie")
    if got_named != exp_named:
        fails.append(f"{legacy} : sections nommées {got_named} vs {exp_named}")
    if got_voices != exp_voices:
        fails.append(f"{legacy} : {got_voices} blocs de voix vs {exp_voices}")
    n_lines += len(exp_lines); n_cues += len(exp_cues); n_named += len(exp_named); n_voices += exp_voices

# Index artistes
n_index = 0
block = soup.find("h1", id="artistesHeader").find_next_sibling("div")
lower = {k.lower(): v for k, v in legacy_map.items()}
for h2 in block.find_all("h2", class_="collapsible"):
    artist = " ".join(h2.get_text(" ", strip=True).split()).upper()
    for a in h2.find_next_sibling("div").find_all("a"):
        anchor = a["href"].lstrip("#")
        anchor = MANUAL_LINKS.get(anchor, anchor)
        sid = legacy_map.get(anchor) or lower.get(anchor.lower())
        if not sid:
            sid = next((v for k, v in legacy_map.items() if slugify(k) == slugify(anchor)), None)
        n_index += 1
        if not sid:
            fails.append(f"index {artist} : #{anchor} non relié")
        elif catalog[sid]["artist"] != artist:
            fails.append(f"index {artist} : {sid} a l'artiste {catalog[sid]['artist']}")

# Setlist : ordre préservé
for ul_id, part in zip(["repertoire-part1", "repertoire-part2", "repertoire-part3"], setlist["parts"]):
    exp = []
    for a in soup.find("ul", id=ul_id).find_all("a"):
        anchor = a["href"].lstrip("#")
        exp.append(legacy_map.get(anchor) or lower.get(anchor.lower()))
    if exp != part["songIds"]:
        fails.append(f"setlist {part['name']} : ordre/contenu divergent")

print(f"Morceaux vérifiés : {len(seen)} | lignes de paroles : {n_lines} | repères instrumentaux : {n_cues} | "
      f"sections nommées : {n_named} | blocs de voix : {n_voices} | entrées d'index : {n_index}")
if fails:
    print(f"ÉCHECS ({len(fails)}) :")
    print("\n".join(f"  - {f}" for f in fails))
    sys.exit(1)
print("OK : aucune perte, aucune divergence.")
