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
AU ZOMA OUI [×4] // Misa seule             ligne répétée ×4 + commentaire discret de la ligne
{repeat: 2}                                le paragraphe suivant est répété ×2
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

## Nouveau morceau (import par copier-coller)

Mode éditeur → accueil → **+ Nouveau morceau**. Coller, **Analyser**, vérifier le compte rendu, **Ouvrir dans l'éditeur** (ou « Enregistrer tels quels » si plusieurs morceaux). Rien n'est envoyé au groupe avant **PUBLIER**.

```
Titre : …            (ou « 1 - … »)
Artiste : …          (ou « 2 - … »)
Voix : Misa - Soprano / Hasina - Lead      (ou « 3 - … »)
Musique : Haja - Guitare basse              (ou « 4 - … »)
Ton : Ré / Capo 5    (ou « 5 - … » ; après « / » = commentaire)

Intro - commentaire
ligne - commentaire x2        → ligne répétée
ligne<TAB>x2                  → paragraphe répété (ou « x2 » seul sous le paragraphe)
[x2 ligne A                   → groupe de lignes répété (commentaire : [x2 «chœur seul» ligne A)
ligne B]                        … refermé par « ] » en fin de dernière ligne
[vert «Misa seule» ligne A     → lignes surlignées (jaune, vert, bleu, rose, violet), commentaire facultatif
ligne B]
[REFRAIN]                     → section, suivie éventuellement de « Voix : Tous - Chœur »
Interlude - commentaire
Outro
---                           → morceau suivant
```

Suppression : éditeur → En-tête → **Supprimer le morceau** (retiré du répertoire, suppression publiée avec PUBLIER).

## Connexion des membres

- `data/members.json` : identifiants + empreintes PBKDF2-SHA256 salées (jamais de mot de passe en clair). Fichier absent ou vide = pas de page de connexion.
- Gestion : Réglages → **Membres** (mode éditeur) → identifiant, mot de passe, case admin, **Ajouter** ; changer le mot de passe, retirer ; envoi avec **PUBLIER**. Il reste toujours au moins un admin.
- Session : 30 jours par appareil, vérifiée au démarrage (expirée ou membre retiré → page de connexion). Fonctionne hors ligne.
- Mode éditeur = **compte admin connecté + jeton GitHub sur l'appareil**.
- Protection simple : le site et le dépôt restent publics.

## Mes notes (personnelles, locales)

Page de lecture → **Mes notes** : toucher la 1re puis la dernière ligne → couleur + commentaire facultatif. Pour tous les membres, jamais publié.
- Stockées sur l'appareil, par identifiant connecté. Réglages → Mes notes : afficher/masquer, **Exporter** / **Importer** (fichier JSON).
- Rattachées au texte des lignes : si le morceau publié change, la note suit ses lignes ; sinon elle passe dans « Notes à replacer ».
- Rendu distinct des surlignages du groupe (liseré pointillé, commentaire 👤 sur sa propre ligne) : les deux cohabitent sans se masquer.

## Vue musicien

Page de lecture → bouton **Chanteur / Musicien** (choix retenu sur l'appareil). Portrait ou paysage.
- Texte plus petit (taille propre, A− / A+), autant de colonnes que la largeur le permet, structure mise en avant ; défilement horizontal.
- **Structure seule** : 1re ligne de chaque paragraphe. **Masquer des lignes** : toucher une ligne, ou « Replier » un paragraphe.
- Mes notes : séparées entre vue chanteur et vue musicien (locales).
- Admin : « Par défaut pour tous les musiciens » (lignes masquées publiées dans `data/musician.json`) ; dans Mes notes, case « Pour tout le monde » = surlignage du groupe.

## Original (lecteur YouTube)

Éditeur → En-tête → **Original (lien YouTube)** : coller l'adresse d'une vidéo (`{youtube: <id>}` dans le .cho, aussi « YouTube : … » à l'import).
Page de lecture → bouton **▶ Original** : lecteur YouTube officiel au-dessus des paroles, lecture / pause, −10 s / +10 s. Réseau nécessaire ; rien n'est stocké dans le dépôt.
