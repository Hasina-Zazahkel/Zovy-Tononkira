# Zovy Tononkira

PWA offline-first d'affichage des paroles pour le groupe Zovy (tablettes Android, scène et répétition).

## Arborescence

```
data/songs/*.cho          Source de vérité : 1 fichier par morceau (ChordPro allégé)
data/setlists/*.json      Répertoires (parties ordonnées d'IDs)
src/model/                Types TypeScript + parser/serializer ChordPro
scripts/build-data.ts     Compile data/ -> public/data/songs.json + setlists.json
scripts/migrate/          Migration one-shot depuis legacy/Tononkira_Zovy.html + vérification
docs/MIGRATION_REPORT.md  Cas ambigus détectés à la migration
legacy/                   Ancien site (référence, ne plus éditer)
```

## Commandes

App en ligne : https://hasina-zazahkel.github.io/Zovy-Tononkira/ (déployée à chaque merge sur `main`).

| Commande | Effet |
|---|---|
| `npm run dev` | Serveur local (http://localhost:5173/Zovy-Tononkira/) |
| `npm run build` | Build de production dans `dist/` (PWA + données) |
| `npm run data:build` | Valide + compile le catalogue dans `public/data/` |
| `npm run data:format` | Réécrit les `.cho` au format canonique |
| `npm run data:check` | Validation seule (CI) |
| `npm test` | Tests parser + round-trip sur tout le catalogue |

## Format `.cho`

Nom de fichier = ID du morceau (`a-z0-9-`).

```
{title: MEDLEY CHACHACHA}
{artist: MEDLEY ISAN-KARAZANY}
{key: RE}                                  DO RE MI FA SOL LA SI + b ou # (ex. SIb)
{capo: 5}
{tags: medley}
{medley: RAVORONDREO (SOL) | O DARLING (RE)}
{singers: Hasina=lead, Misa=1ère voix, Ke=2ème voix, Toky=ténor}
{musicians: Haja=guitare basse, Toky=guitare classique}
{notes: Bien marquer le break avant Zoma}

{intro}                                    repère : {intro|interlude|outro[: commentaire]}

O PAPA                                     paroles ; ligne vide = fin de strophe
QUEL MALHEUR QUEL GRAND MALHEUR POUR MOI

{section: ZOMA}                            nouvelle section nommée
{voices: Hasina=lead, Misa=haut, Ke=bas}   voix de la section (priment sur {singers})
LA LA LA
```

Règles :
- `{voices}` placé après des paroles ouvre une nouvelle section.
- `{section}` sans label ouvre une section anonyme.
- Affectations `Nom=rôle` séparées par des virgules ; rôle libre, affiché tel quel ; `*` = tous ; un membre peut avoir plusieurs instruments (`Toky=basse, Toky=chœurs`).
- Les paroles sont stockées telles quelles ; l'affichage en majuscules se fait au rendu (réglable).
