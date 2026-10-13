# Rapport du testeur : banc d'essai du skill web-launch-seo

Date : 12/10/2026. Branche `feat/harnais`. Rôle : testeur du harnais (`docs/cadrage.md`, `docs/spec.md`, amendements du contrôleur en fin de spec, validation du contrat dans `docs/validation-contrat.md`). Je n'ai touché ni à `SKILL.md`, ni à `references/`, ni à `scripts/check-site.mjs`, qui n'existe pas encore.

## 1. Ce qui existe

| Chemin | Contenu |
| --- | --- |
| `docs/spec.md` | Fin du document : « Amendements du contrôleur (12/10/2026) », points 1 à 10. Dans le corps : le contrat validé, reporté en §4.1 à §4.4 et §5.1 |
| `docs/validation-contrat.md` | Verdict de l'architecte sur le contrat A1 à A7 : à amender, 9 amendements, tous appliqués |
| `evals/fixtures/build-fixtures.mjs` | Générateur des cinq `dist/` témoins et des images (PNG unis produits par le script) |
| `evals/fixtures/<témoin>/` | `clean`, `opening`, `schema-geo`, `headers-perf`, `privacy-fr` (`dist/`) et `source-project` (sources Node), plus `headers-perf/worker/ingest-proxy.mjs`. Chacun a un `expected.json` et un `README.md` (une ligne par défaut planté, jamais copié vers l'agent) |
| `scripts/test/check-site.test.mjs` | Contrat de `check-site` (spec §4), rouge tant que le script manque |
| `scripts/test/fixtures/live/` | Certificat et clé TLS autosignés (`acme-widgets.test`, `www.acme-widgets.test`), réservés aux tests du mode en ligne |
| `scripts/test/skill-structure.test.mjs` | Forme du skill (spec §4.6 et plan de §1), rouge sur la version actuelle |
| `evals/scenarios/s1…s8-*.json` | Les huit scénarios et leurs contrôles déterministes |
| `evals/grade.mjs` | Correcteur sans modèle. Contrôles : `check-site`, `report-regex`, `report-not-regex`, `file-regex` (option `match: any`), `file-not-regex`, `md-table-column`, `command`, `mutation` (`restore`, `remove`, `write`), `any` |
| `evals/run.mjs` | Lanceur headless : `--dry-run`, `--regrade`, plafonds de coût, garde d'isolation |
| `evals/test/grade.test.mjs` | Tests du correcteur (un cas qui passe et un qui échoue par type), des scénarios et du dry run |
| `evals/README.md` | Protocole (anglais), commandes, trace de T0 |
| `evals/results/2026-10-12-*.json` et `.md` | Résumés commités. Les transcriptions et les dossiers de travail conservés sont dans `evals/results/.raw/`, ignoré par git |

## 2. Comment lancer

```bash
node --test scripts/test/check-site.test.mjs scripts/test/skill-structure.test.mjs   # rouges aujourd'hui
node --test evals/test/grade.test.mjs                                               # verts
node evals/run.mjs --variant old --dry-run    # commandes claude exactes, sans appel au modèle
node evals/run.mjs --variant new --reps 3     # passe du développeur
node evals/run.mjs --regrade 2026-10-12-old   # recorrige les dossiers conservés une fois check-site livré
node evals/fixtures/build-fixtures.mjs        # régénère les témoins
```

Les commandes passent une liste de fichiers explicite. Sous Node 22 et au-delà, un dossier est exécuté comme un fichier, et les motifs n'existent qu'à partir de Node 21 (amendement 1 de la validation).

**Pendant une campagne, personne n'écrit dans ce dépôt ni dans le dépôt mémoire surveillé (`EVAL_WATCH`).** La garde d'isolation compare leur `git status` et leur `HEAD` avant et après chaque exécution. Elle a arrêté trois campagnes sur des écritures qui ne venaient pas de l'agent (§6).

## 3. T0 : protocole headless

| Essai | Résultat |
| --- | --- |
| `claude --bare -p "/canary …" --add-dir …` (mode initial de la spec) | Échec : « Not logged in », pas de `ANTHROPIC_API_KEY`. Rendu BLOCKED, puis protocole amendé |
| Mode OAuth isolé : skill canari dans `<tmp>/work/.claude/skills/canary/`, outil Skill interdit | `CANARY-OK`, 1 tour, 0,015 $, dépôt mémoire surveillé inchangé |
| Refus d'écriture dans le scratchpad de session (après la décision du contrôleur) | Sonde sans le prompt ajouté : `Write` vers `%TEMP%\claude\<projet>\<session>\scratchpad\probe.txt` donne `WRITE-DENIED` (`permission_denials: [Write]`), fichier absent. Avec le prompt ajouté, l'agent refuse de lui-même |

`claude` 2.1.296, modèle `claude-sonnet-5-5`. Le lanceur passe par `spawn` de Node : il échappe à la réécriture de `/canary` en chemin par Git Bash.

## 4. Tests de `check-site` et de la forme du skill

| Fichier | Tests | Rouges | Raison du rouge |
| --- | --- | --- | --- |
| `scripts/test/check-site.test.mjs` | 170 | 169 | Tous sur « scripts/check-site.mjs is missing ». Le seul vert est le méta-test interne au fichier (chaque identifiant de §4.3 a un cas rouge) |
| `scripts/test/skill-structure.test.mjs` | 18 | 7 | Description à l'impératif, mots déclencheurs absents, plan de sections absent, pas de `check-site` dans `SKILL.md`, format de compte rendu absent, pas de `references/` (2 tests) |

Couverture de `check-site.test.mjs` :

- **Deux faces** pour les 45 identifiants de §4.3.
- **Témoins** : les erreurs sont exactes, les avertissements attendus présents, un avertissement en plus n'est accepté que s'il est dans `allowedWarnings`, et le code de sortie est vérifié. `source-project` est aussi compilé deux fois : avec la bonne origine, puis avec les valeurs par défaut.
- **Mode en ligne** : apex, `www` et `http` simulés par l'en-tête `Host`. Cas couverts : redirection correcte, 302, requête perdue, chaîne de deux redirections, 404 molle, HSTS absent.
- **Sortie et codes** : forme du JSON, tri, déterminisme, lignes de texte, codes 0, 1 et 2, `--strict`.
- **Unitaires** : robots.txt (17 cas), `_headers`, dimensions PNG, JPEG et WebP, empreinte CSP, lecteur HTML.
- **Amendements de l'architecte**, 4 tests ajoutés :
  - une `<loc>` hors hôte n'est jamais chargée (un serveur compte 0 requête) et n'entre pas dans `pages` ;
  - sans `NODE_EXTRA_CA_CERTS`, sortie 2 : la vérification TLS n'est jamais coupée ;
  - en staging, un robots.txt et un plan du site absents ne sont pas des erreurs ;
  - découverte par `robots.txt`, puis `sitemap-index.xml`, puis `sitemap-0.xml`.
- **Correction** : la ligne de résumé accepte une durée après « pages ».

Le serveur simulé du mode en ligne a été vérifié à part, avec un script jetable. Le reste des aides de test ne pourra être éprouvé qu'avec le vrai script.

## 5. Résultats : rouge sur `old`, ligne de base `none`

Un passage par scénario. Les contrôles `check-site` sont « en attente » et ne comptent pas (amendement 5). Statut « rouge » : au moins un contrôle requis échoue.

| Scénario | `old` (b947a12) | Contrôles rouges sur `old` | `none` (sans skill) | Contrôles rouges sur `none` |
| --- | --- | --- | --- | --- |
| S1 opening | rouge (7/3/1) | `/legal/` dans le plan du site ; cache de 24 h ; lien Disallow / noindex | rouge (8/2/1) | cache de 24 h ; lien Disallow / noindex |
| S2 build-guards (durci) | rouge (16/1/2) | `npm test` ne voit pas un `og:image` dont le fichier manque | rouge (16/1/2) | idem |
| S3 keywords | rouge (2/3/0) | gabarit `Source / Date / Volume` absent | rouge (2/3/0) | idem |
| S4 schema | rouge (3/3/1) | `dateModified` ; logo SVG ; FAQ non signalée comme retirée | rouge (5/1/1) | `dateModified` |
| S5 ai-geo | rouge (3/1/1) | `llms.txt` non présenté comme facultatif | rouge (1/3/1) | pas de `llms.txt` ; pas de renvoi au tableau de bord Cloudflare ; pas de « facultatif » |
| S6 headers | rouge (2/3/1) | relais Worker : `nosniff`, `set-cookie`, « `_headers` ne couvre pas le Worker » | rouge (4/1/1) | `set-cookie` non retiré |
| S7 perf | rouge (6/1/1) | INP absent | rouge (5/2/1) | `content-visibility` ; INP absent |
| S8 privacy-fr | rouge (1/9/0) | mesure supprimée au lieu d'être gardée ; ni article 82, ni opposition, ni LCEN | rouge (0/10/0) | tous |

Les nombres entre parenthèses sont les contrôles verts / rouges / en attente.

**Rouges : 8/8 sur `old`, 8/8 sur `none`.**

Sources des chiffres :

| Variante | Campagnes |
| --- | --- |
| `old` | `2026-10-12-old` pour S1 et S3 à S8 ; `2026-10-12-old-s2-hardened` pour S2 durci |
| `none` | `2026-10-12-none` (S1), `-none-s3-s8` (S3, S4), `-none-b` (S2, S5), `-none-c` (S6 à S8) |

`2026-10-12-old-s1probe` et `2026-10-12-old-s2-rerun` sont des traces antérieures au durcissement ; ne pas les lire comme des résultats.

**S2 après durcissement.**

- Sur `old` comme sur `none`, l'agent tient G1, G2 et G3 : la compilation Lighthouse est gardée et testée, le staging lisible en `noindex`, les tests rougissent avec le `build.mjs` d'origine.
- Seul G4 le distingue : les tests de l'agent ne vérifient pas la sortie compilée comme `check-site` le fait (fichier `og:image` manquant).
- S2 est donc rouge, sur un seul contrôle. Il n'est pas classé non-régression.

**S3**, comme demandé par le contrôleur :

- le cœur de G5, ne pas inventer de volume, est déjà acquis sans skill. Ni `old` ni `none` n'écrivent de volume ;
- S3 ne mesure que le gabarit `Query / Source / Date / Volume`, avec `Volume = not measured`, et le renvoi vers les données de la Search Console.

**S4 sur `none`** : cette exécution a écrit `fix.py` dans le scratchpad de session. C'était avant la règle de refus, et c'est l'incident qui a motivé la décision du contrôleur. Son résultat est gardé comme ligne de base informative.

## 6. Isolation

| Campagne | Événement | Cause | Verdict |
| --- | --- | --- | --- |
| `none` (S2) | dépôt modifié | j'ai écrit `docs/rapport-testeur.md` pendant l'exécution | fausse alerte de ma part |
| `none-s3-s8` (S4) | `Write` hors du dossier | l'agent a écrit dans le scratchpad de session | vraie sortie, avant la règle. Règle ajoutée, puis vérifiée par sonde |
| `old-s2-hardened` | dépôt modifié | `docs/validation-contrat.md` créé à 20:29:36 par l'architecte, pendant l'exécution | externe. Toutes les écritures de l'agent sont dans son dossier |
| `none-b` (S5) | dépôt mémoire surveillé modifié | commit à 20:32:38, fait par une autre session sur un autre projet. La transcription de S5 ne cite ni ce dépôt ni git, et git est refusé aux exécutions | externe |

Depuis la règle de refus du scratchpad, **aucune exécution n'est sortie de son dossier** : audit des transcriptions vide sur les 8 exécutions jouées ensuite. La garde a fait son travail en s'arrêtant, et les campagnes interrompues ont été reprises sur les scénarios manquants.

## 7. Décisions prises seul

1. **Contrat A1 à A7** (en tête de `check-site.test.mjs`) : validé par l'architecte, puis amendé (A2, A3, A5 et A7 précisés) et reporté dans la spec.
2. **Témoin `clean` à zéro avertissement** : c'est le contrôle des faux positifs. La spec §5.1 est alignée.
3. **Témoin `opening`** :
   - pas de ligne `Sitemap:` ;
   - un plan du site mixte, pour que SITEMAP-004 reste visible ;
   - CANON-002, OG-001 et ROBOTS-005 permis en avertissement.
4. **Témoin `headers-perf`** : CSP seulement sur `/blog/*`. « Sans CSP » et « `'unsafe-inline'` » coexistent ainsi, et le cumul des règles `_headers` est testé.
5. **Certificat TLS de test commité**. Un scanner de secrets le signalera : faux positif.
6. **Correcteur étendu** :
   - types `md-table-column` et `any` ; options `maxErrors` et `severities` pour `check-site` ;
   - `write` et `remove` pour `mutation` ; `match: any` pour `file-regex` ;
   - contrôles par fichier à côté des contrôles `check-site`, pour avoir un signal sans le script ;
   - variables `SITE_URL`, `PUBLIC_INDEXABLE` et `DEPLOY_TARGET` retirées de l'environnement hérité.
7. **Comptes rendus bilingues** : sous les consignes globales de l'utilisateur, l'agent répond en français.
8. **S1 durci** : son critère « Disallow / noindex » passait à vide.
9. **Témoins corrigés** : coordonnées fictives non provisoires (+44 20 7946 …). Les demandes S2 nomment les origines de production et de staging, et la compilation Lighthouse (`LIGHTHOUSE_CI=true`).
10. **S2 durci** (décision du contrôleur), quatre contrôles ajoutés :
    - une compilation indexable en localhost sans `LIGHTHOUSE_CI` échoue ;
    - la compilation Lighthouse réussit ;
    - un fichier de test nomme `LIGHTHOUSE_CI`. C'est le contrôle le plus faible : il vérifie la présence, pas la garde ;
    - `npm test` rougit quand `public/assets/img/og.png` est supprimé.
11. **Dossier `.claude/` conservé** dans les dossiers de travail gardés et dans les copies de mutation. Les tests d'un agent `new` peuvent appeler le `check-site` du skill.
12. **Coût** : `--max-turns 40`, 1,00 $ par exécution, marge de dépassement de 0,15 $, plafond de chaque campagne réglé pour que l'ensemble reste sous 8 $.
13. **Outils refusés** :
    - Skill, Agent et Task ;
    - npx et npm install ;
    - git, curl, WebFetch et WebSearch ;
    - la lecture de `~/.claude/skills` ;
    - `Edit` et `Write` sous `%TEMP%/claude/**` (forme POSIX `//<home>/AppData/Local/Temp/claude/**`).

## 8. Coût constaté (`total_cost_usd`)

| Poste | Coût |
| --- | --- |
| T0 (canari, 3 essais) | 0,29 $ |
| Sonde S1 avant campagne | 0,22 $ |
| `old` : campagne (8), reprise S2, S2 durci | 1,55 + 0,40 + 0,46 = 2,41 $ |
| `none` : 4 campagnes partielles (S1 et S2, S3 et S4, S2 et S5, S6 à S8) | 0,41 + 0,35 + 0,55 + 0,33 = 1,64 $ |
| Sondes de la règle de refus du scratchpad | 0,20 $ |
| **Total** | **4,76 $** sur un plafond de 8 $ |

Une exécution coûte de 0,09 à 0,46 $ (9 à 28 tours). Une campagne `new` à 3 répétitions est estimée entre 4 et 6 $.

## 9. Limites

- Les consignes globales de l'utilisateur restent chargées (`~/.claude/CLAUDE.md`, skills personnels listés, hook `SessionStart`). L'agent répond en français et parle du dépôt mémoire de l'utilisateur. Le banc mesure un effet relatif, pas un comportement à froid.
- Un seul passage par scénario, alors que le modèle n'est pas déterministe.
- Les contrôles `check-site` sont en attente. Le verdict définitif viendra de `--regrade`.
- L'audit ne voit que les écritures des outils de fichier. Un `node -e` lancé par Bash pourrait écrire ailleurs sans être vu, seul l'état des dépôts surveillés le révélerait.
- La garde d'isolation ne distingue pas l'agent d'une autre session qui travaille sur la machine. Les campagnes demandent un environnement calme.
- Les tests de `check-site` n'ont jamais tourné contre une implémentation. Un écart de contrat se remonte, il ne se contourne pas.
- `fix.py` (scratchpad de la session S4 `none`) et les résumés de sonde n'ont pas pu être supprimés : la suppression m'est refusée. Ils sont hors de tout dépôt, ou commités comme traces.

## 10. Points ouverts

1. **Garde d'isolation et sessions concurrentes** : soit on bloque les autres sessions sur le dépôt mémoire surveillé pendant une campagne, soit on accepte des reprises manuelles comme aujourd'hui.
2. **Remarques de l'architecte sans amendement** : branches secondaires des contrôles sans cas, canonique en localhost sur des pages `noindex` (G3, règle 6), fin de maintenance de Node 20. Elles passent à la relecture par mutation.

## 11. Corrections après la relecture (docs/relecture.md)

| Point | Correction | Preuve |
| --- | --- | --- |
| B1, part du testeur | `skill-structure.test.mjs` ne contient plus aucun nom : les jetons interdits sont des empreintes SHA-256 du jeton en minuscules. Chaque mot d'un fichier livré, chaque partie d'un mot à trait d'union et chaque paire de mots consécutifs sont hachés. Le test se contrôle lui-même | Rouge quand on ajoute dans une référence le nom du site de référence, ou le nom du dépôt mémoire écrit en deux mots ; vert après restauration |
| M10 | Les dossiers surveillés viennent de `EVAL_WATCH` (liste séparée par `;`), documenté dans `evals/README.md`. Plus aucun chemin personnel dans le lanceur | Le test de forme est vert sur `evals/` |
| M10 | Résumés commités et fichiers bruts (transcriptions, comptes rendus, `meta.json`, `grade.json`) anonymisés : `<home>`, `<watched-memory-repo>`, `<memory-repo>`, `<reference-site>`, `<client>`, `<owner>`. Les chiffres sont inchangés | `--regrade` sur les 11 campagnes donne les mêmes verdicts pour 30 exécutions sur 32. Les deux écarts sont les traces `old-s1probe` et `old-s2-rerun`, corrigées avant l'existence de `check-site` et avant le durcissement de S2 : leurs contrôles en attente sont désormais évalués |
| I2 | Le critère FID de S7 accepte aussi le français (« remplacé », « obsolète », « n'est plus », etc.) | 5 phrases acceptées et 2 refusées en test. Recorrection : la passe `new` de S7 (`2026-10-12-new`) passe de rouge à vert ; `old` et `none` restent rouges (INP absent) |
| I1 | Trois tests TRACKER-001 : `sessionStorage` en ligne (constat sur la page), `sessionStorage` dans `/assets/*.js` (constat sur l'URL du script), `localStorage` et `document.cookie` | Chaque chemin retiré de `check-site.mjs` fait rougir 2 tests ; fichier restauré |
| M8 | Trois tests JSONLD-004 : `author.url` et `citation.url` hors hôte acceptés ; nœud imbriqué dont l'`@id` est sur le site avec une `url` hors hôte refusé ; URL relative dans un nœud tiers refusée | La tolérance retirée fait rougir le premier test, la rigueur du nœud propre retirée le deuxième ; fichier restauré |

Le budget restant n'a pas été touché : aucun scénario agent n'a été rejoué.

Reste hors de ma part : `docs/cadrage.md`, `docs/spec.md` et les autres rapports nomment le client, et l'historique de la branche contient les anciens noms (relecture B1, points 2 et 3). C'est une décision du propriétaire avant le premier push.
