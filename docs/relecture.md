# Relecture à froid : skill web-launch-seo, branche feat/harnais

Date : 12/10/2026. Relecteur du harnais (Claude). Objet : `feat/harnais` à 10f8d71 (commits du développeur b3b29ef..10f8d71), base `main` (b947a12).
Lu : `docs/cadrage.md`, `docs/spec.md` (amendements compris), `docs/rapport-developpeur.md`, `docs/rapport-testeur.md`, `SKILL.md`, `references/*.md`, `scripts/check-site.mjs`, `README.md`, `evals/scenarios/*.json`.
Je n'ai rien corrigé, rien commité, rien poussé. Je n'ai lancé aucun scénario agent : `node evals/run.mjs --variant new --dry-run` seulement, qui n'appelle pas le modèle.

## Verdict : A_CORRIGER

Le fond est solide. Sur 18 affirmations revérifiées, 16 sont exactes et 2 sont à reformuler (aucune n'est fausse sur le fond). `SKILL.md` est court (76 lignes) et P1 à P18 sont traités. Les tests passent : 188/188 pour `check-site` et la forme du skill, 41/41 pour le correcteur. Quatre points bloquent ou doivent être tranchés avant la PR :

- un nom client publié dans un dépôt **public** ;
- deux chemins du contrôle TRACKER-001 qu'aucun test ne garde ;
- deux consignes écrites pour le correcteur plutôt que pour l'utilisateur ;
- le vert sur une seule passe.

| Gravité | Nombre |
| --- | --- |
| Bloquant | 1 |
| Important | 5 |
| Mineur | 10 |

---

## Bloquant

### B1. Noms du client dans un dépôt public, y compris dans l'historique de la branche

- `scripts/test/skill-structure.test.mjs:27` : la liste de refus écrit en clair les noms du client, du site de référence et du propriétaire. C'est le test qui doit garantir « aucune donnée client » qui publie les noms. Or le fichier est livré avec le skill, puisque l'installation clone tout le dépôt dans `~/.claude/skills/`.
- `docs/cadrage.md:7`, `:20`, `:26`, `:33` (domaine du site de référence, noms du client) et `docs/spec.md:10` et `:498` nomment aussi le site et le client.
- `gh repo view` sur le dépôt répond `PUBLIC`. Pour l'instant, le remote ne porte que `main` : rien n'est encore exposé. En revanche, une PR rendrait visibles les commits de la branche (392fc55 et suivants), même après une fusion en squash.
- Critère 5 du cadrage : « Rien de propre à un client ». La spec (R4) exclut `docs/` du contrôle, mais elle ne règle pas le cas du test lui-même.

**Correction attendue :**

1. Le test compare des empreintes (sha256 des jetons en minuscules) au lieu de motifs en clair, ou il lit la liste dans un fichier non suivi par git ou dans une variable d'environnement, avec une liste générique par défaut.
2. Le propriétaire décide de ce qu'il fait de `docs/` : retirer les mentions ou les accepter, puisqu'il s'agit de son propre produit.
3. L'historique de `feat/harnais` est réécrit avant le premier push, ou la branche est recréée en un seul commit propre. Corriger dans un commit ultérieur ne suffit pas.

---

## Important

### I1. TRACKER-001 : la détection du stockage local n'est gardée par aucun test (mutation survivante)

`scripts/check-site.mjs:1012`, pour un script en ligne, et `:1044-1048`, pour un script du site, détectent `sessionStorage`, `localStorage` et `document.cookie`. C'est le cœur de G8.

J'ai neutralisé l'un puis l'autre de ces chemins : 188/188 et 170/170, les tests restent verts. Le seul cas rouge de TRACKER-001 (`scripts/test/check-site.test.mjs:323`) est le témoin `privacy-fr`, où la balise Clarity déclenche déjà l'avertissement. Elle masque donc le script `assets/visite.js`, qui écrit en `sessionStorage`.

**Correction attendue (testeur) :** ajouter deux cas rouges sans outil tiers : une page avec un script en ligne qui utilise `sessionStorage`, et une page qui charge un `/assets/x.js` du site qui l'utilise. Le test exige TRACKER-001 sur la bonne URL : la page dans le premier cas, le fichier `.js` dans le second.

### I2. Ne pas nommer FID : une contorsion pour le banc

`references/performance.md:50` dit : « Do not name the retired metric it replaced at all ». La consigne n'existe que parce que le critère S7 (`evals/scenarios/s7-perf.json`, `report-not-regex`) n'accepte FID qu'à côté d'un mot anglais (`replac|deprecat|former|retired|no longer|old`). Pour un vrai lancement, dire « l'INP a remplacé le FID en mars 2024 » est utile, parce que les équipes, les anciens rapports et les outils parlent encore de FID. La ligne 17 (« Do not cite FID as a current metric ») suffit et elle est juste.

**Correction attendue :**

- supprimer la phrase de la ligne 50 ;
- côté testeur (T-S7), rendre le critère bilingue (`remplac|obsolète|ancien|retiré`) ;
- rejouer S7.

### I3. Page de confidentialité : des valeurs par défaut inventées qui contournent la garde de contenu provisoire

`references/privacy-legal-fr.md:68` et `:77` font écrire sur une page **publique** « Sous-traitant : l'hébergeur du site » et « Durée de conservation : 25 mois au plus », même quand les faits ne sont pas connus. La consigne est née du rouge S8 (passe 2), dont le critère est un `file-regex` sur `sous-traitant` et `mois`. Elle contredit trois règles du skill lui-même :

- `SKILL.md:63` : « Never invent … legal identifiers … replacement for placeholder text » ;
- `SKILL.md:64` : les questions juridiques sont listées, pas tranchées ;
- `references/pre-launch.md:37` : « Never replace placeholder text with invented content ».

Sur le fond, les lignes sont légitimes : les destinataires et la durée de conservation sont des mentions d'information obligatoires au titre du RGPD, art. 13. Ce qui pose problème, c'est la valeur inventée. Elle publie un engagement juridique non vérifié et neutralise PLACEHOLDER-001, qui aurait justement bloqué l'ouverture.

**Correction attendue :** la page porte toujours les deux lignes, avec un marqueur de contenu provisoire, par exemple `[à compléter]`. PLACEHOLDER-001 bloque alors la mise en ligne tant que le propriétaire n'a pas rempli les lignes. Le compte rendu les place en « Needs owner decision ». Le testeur ajuste S8 si son critère exige une valeur plutôt que la ligne. Il faut aussi sourcer l'obligation (RGPD, art. 13) au lieu de « Recommendation (unsourced) ».

### I4. Le vert repose sur une seule passe, et trois scénarios n'ont été verts qu'après une correction ciblée

Voir `docs/rapport-developpeur.md:126`. La spec (§5.3, D4) exige 3 répétitions et la majorité. S4, S7 et S8 sont verts sur une passe unique, juste après une modification écrite pour faire passer le critère (I2 et I3 en sont deux exemples). Le risque de surajustement n'est pas mesuré. Le critère 4 du cadrage (« vert sur la nouvelle ») n'est donc pas atteint au sens de la spec.

**Correction attendue :** décision du propriétaire sur le budget (environ 6 $), puis `--reps 3` après les corrections I2 et I3. À défaut, le rapport et la PR disent explicitement « vert constaté une fois ».

### I5. Doublons entre références : les mêmes règles, à deux endroits, finiront par diverger

| Règle | Endroit 1 | Endroit 2 |
| --- | --- | --- |
| Nom unique de l'entité | `references/structured-data.md:25` | `references/geo.md:30` |
| Devoirs du relais de mesure | `references/privacy-legal-fr.md:73` | `references/security-headers.md:51-58` |
| Cloudflare Web Analytics et Clarity | `references/post-launch.md:29-31` | `references/privacy-legal-fr.md:57-58` |
| Indexing API et quota | `references/pre-launch.md:69` | `references/publishing-routine.md:21` |
| Liste des marqueurs de contenu provisoire | `references/pre-launch.md:35` | `references/build-guards.md:42-49` |

**Correction attendue :** une seule source par règle. L'autre fichier y renvoie en une phrase (« see the X reference »), comme le fait déjà `performance.md:25`.

---

## Mineur

| # | Fichier:ligne | Constat | Correction attendue |
| --- | --- | --- | --- |
| M1 | `references/cloudflare.md:23` | « End of life on 2024-08-05 » : la page source donne « Deprecation date: August 5, 2024 » et aucune date de fin de vie | « deprecated on 2024-08-05 » |
| M2 | `references/geo.md:8` | Exact, mais la page des mises à jour dit seulement « these files aren't needed for Google Search ». La phrase « Google Search itself doesn't use them » est dans le guide (`/search/docs/fundamentals/ai-optimization-guide#mythbusting`) | Citer le guide comme source |
| M3 | `references/security-headers.md:49` | Le cumul des règles `_headers` est marqué « Recommendation (unsourced), observed ». Il est documenté : « will inherit all rules' headers », valeurs d'un même en-tête « joined with a comma separator » | Sourcer avec l'URL S25 |
| M4 | `references/privacy-legal-fr.md:24-25` | `sessionStorage` est présenté comme « a cautious reading », sans le libellé de recommandation ; la ligne 25 l'affirme ensuite comme un fait. La CNIL (§13) ne cite que « local storage », mais le texte de l'article 82 vise toute inscription dans le terminal | Sourcer sur le texte de l'article 82 (Légifrance), ou étiqueter la ligne 25 comme interprétation |
| M5 | `references/privacy-legal-fr.md:88` | La liste LCEN omet, « le cas échéant », le codirecteur et le responsable de la rédaction, ainsi que l'identité et l'adresse des tiers qui stockent des données (art. 1-1, I, 5°) | Compléter |
| M6 | `references/pre-launch.md:76-86` | « Fixing a built `dist/` the evening before » rejoue pas à pas le témoin S1 : localhost, `noindex` de l'accueil, mentions légales dans le plan du site, canonique de la 404. Le cas est plausible, mais la section doublonne « One indexing switch » et le checker | Réduire à 3 lignes : lancer check-site, corriger, reporter les corrections à la source |
| M7 | `references/ai-crawlers.md:56`, `references/keywords.md:35`, `references/privacy-legal-fr.md:108` | Formulations calquées sur les critères : groupes `OAI-SearchBot`/`PerplexityBot` nommés comme dans le témoin ; « Keep other tables … without a Volume column » ; « owner (propriétaire) » | Formuler la règle générale (« aucun robot de recherche IA interdit ») et retirer les ajouts entre parenthèses qui ne servent qu'au correcteur |
| M8 | `scripts/check-site.mjs:842-867` | Tolérance JSONLD-004 pour les nœuds imbriqués tiers : aucun test ne l'épingle, ni dans un sens ni dans l'autre | Deux cas : `author.url` sur un autre hôte accepté ; nœud imbriqué dont l'`@id` est sur le site avec une `url` hors hôte refusé |
| M9 | `scripts/check-site.mjs:401` | La spec §4.2 demande de signaler `_redirects` en info ; ce n'est pas fait | Ajouter l'info, ou amender la spec |
| M10 | `evals/run.mjs:48`, `evals/results/2026-10-12-none-b.json:13`, `evals/results/2026-10-12-none-s3-s8.json:13` | Chemins locaux de la machine (dossier du dépôt mémoire du propriétaire, dossier utilisateur Windows) dans des fichiers suivis d'un dépôt public | Garde par défaut via variable d'environnement ; chemins anonymisés dans les résumés commités |

---

## 1. Faits sourcés : revérification (WebFetch, 12/10/2026)

| # | Affirmation (fichier) | Source relue | Résultat |
| --- | --- | --- | --- |
| F1 | FAQ : plus affichée depuis le 07/05/2026, dépréciée le 08/05/2026, documentation retirée le 15/06/2026 (`structured-data.md:16`) | developers.google.com/search/updates | **Exacte** (« will no longer appear in Google Search starting May 7, 2026 ») |
| F2 | FAQ limitée aux sites gouvernementaux et de santé depuis le 08/08/2023 ; inutile de retirer le balisage ; HowTo retiré du bureau le 13/09/2023 et déprécié (`structured-data.md:15-18`) — S7 | search/blog/2023/08/howto-faq-changes (lue en entier) | **Exacte** (« there's no need to proactively remove it » ; MAJ du 14/09/2023) |
| F3 | Google n'utilise pas llms.txt (`geo.md:8`) | updates (15/06/2026) et ai-optimization-guide | **Exacte**, mais la page citée ne dit que « aren't needed » (M2) |
| F4 | Autres types retirés en 2025-2026 (`structured-data.md:19`) | updates | **Exacte** |
| F5 | LCEN, art. 1-1 depuis le 23/05/2024 (loi 2024-449), mentions de l'éditeur personne morale, sanction de l'art. 1-2 (`privacy-legal-fr.md:88`) | Légifrance JORFTEXT000000801164 | **Exacte**, mais incomplète (M5) |
| F6 | `sessionStorage` traité comme un traceur (art. 82) (`privacy-legal-fr.md:24`) | Lignes directrices 2020-091 §13 (PDF extrait) ; FAQ CNIL | **Non sourcée à la lettre** : la CNIL cite le « local storage » HTML 5, pas `sessionStorage`. Le skill l'écrit comme une lecture prudente, ce qui est correct ; seule la ligne 25 est à reformuler (M4) |
| F7 | Conditions d'exemption, dont « pas de transmission à des tiers » ; RGPD applicable (§51, §52 ; FAQ Q8, Q9, Q10) | PDF CNIL §51 et §52 ; FAQ CNIL (29/04/2026) | **Exacte** (§51 : « ni transmises à des tiers » ; Q10 : « aisément accessible ») |
| F8 | L'INP remplace le FID le 12/03/2024 (`performance.md:17`) | web.dev/blog/inp-cwv-march-12 | **Exacte** |
| F9 | Seuils INP 200/500 ms au 75e centile (`performance.md:18`) | web.dev/articles/inp | **Exacte** |
| F10 | robots.txt en cache « up to 24 hours » ; 4xx sauf 429 ; 5xx : 12 h puis 30 jours (`pre-launch.md:64-66`) | robots_txt (Google) | **Exacte** |
| F11 | « Disallow cache le noindex » ; `X-Robots-Tag` a le même effet (`pre-launch.md:28`, `:63`) | block-indexing (Google) | **Exacte** (« the page can still appear in search results » ; « They have the same effect ») |
| F12 | Anthropic : ClaudeBot, Claude-SearchBot, Claude-User, respect de robots.txt, pas de contournement de CAPTCHA (`ai-crawlers.md:34`, `keywords.md:14`) — S43 | support.claude.com/en/articles/8896518 | **Exacte** (« we will not attempt to bypass CAPTCHAs ») |
| F13 | `_headers` ne s'applique pas aux réponses d'un Worker ; 100 règles ; 2 000 caractères (`security-headers.md:47-48`) | Workers static assets, Headers | **Exacte**, et le cumul est sourçable (M3) |
| F14 | LHCI : `numberOfRuns` 3 par défaut, assertion par défaut `optimistic`/`minScore 1`, `staticDistDir` (`build-guards.md:121-123`) | lighthouse-ci configuration.md | **Exacte** |
| F15 | Médiane de 5 passes « twice as stable », pas de passes concurrentes (`performance.md:24`) | lighthouse variability.md | **Exacte** |
| F16 | Clarity : signal de consentement EEE/UK/CH depuis le 31/10/2025, pas de cookie sans consentement (`privacy-legal-fr.md:58`) | Microsoft Learn (ms.date 21/05/2026) | **Exacte** |
| F17 | Auto Minify : fin de vie le 05/08/2024 (`cloudflare.md:23`) | Cloudflare API deprecations | **Inexacte dans les mots** : la page donne une date de dépréciation et aucune date de fin de vie (M1) |
| F18 | Plus vérifiées dans le même passage, toutes **exactes** : robots.txt géré (préfixe, marqueurs, Bot Preference Sync) ; OpenAI (OAI-SearchBot, GPTBot, ChatGPT-User « may not apply ») ; llmstxt.org (proposition v2, 03/09/2024, H1 seul requis) ; « Couldn't fetch » (causes, « for a few days », propriétés) ; Tiered Cache (Smart pour toutes les offres, Generic Global en Enterprise) ; Early Hints (en-têtes `Link` preload/preconnect) ; page Google « AI features » (citations exactes ; Google-Extended) | — | **Exacte** |

S7 et S43, que le développeur m'avait signalées, sont relues en entier : elles sont exactes. Aucune règle invérifiable n'est écrite comme un fait, à part la nuance F6/M4. Sur la forme, chaque fait daté porte `Source: <URL> (read 2026-10-12)`.

## 2. Concision et P1 à P18

`SKILL.md` fait 76 lignes, ne contient aucun fait daté et renvoie aux 13 références. La description, à la troisième personne, fait 763 caractères. Les 13 références sont liées et aucune ne renvoie à une autre. P1 à P18 sont tous traités ; seule la formulation de P12 est inexacte (M1). Seuls doublons relevés : ceux de I5 et M6.

## 3. Données client

- Livrable hors `docs/` : aucune occurrence, sauf la liste de refus du test (B1).
- `LICENSE:3` porte le nom du propriétaire, comme sur `main` : c'est légitime.
- Les lignes `Author:` de git ne sont pas du contenu.
- Aucune clé réelle : recherche de `0x4AAA`, `sk_live`, `pk_live`, `G-…`, `phc_…`, `AKIA…`, `ghp_…`, aucune trouvée.
- Aucun domaine réel hors des sources officielles : `acme-widgets.test` et `example.com` seulement.
- `docs/` nomme le client (B1). `evals/` contient des chemins locaux (M10).

## 4. Le banc garde-t-il ? Mutations de `scripts/check-site.mjs`

Commande : `node --test scripts/test/check-site.test.mjs scripts/test/skill-structure.test.mjs` (README). Chaque mutation a été appliquée en place, puis annulée par `git checkout -- scripts/check-site.mjs`. `git status --porcelain` est vide à la fin.

| Mutation | Résultat |
| --- | --- |
| ROBOTS-001 supprimé | **Rouge** (1 échec) |
| CANON-001 supprimé | **Rouge** (5) |
| CANON-001, branche localhost seule | Vert : mutation **équivalente**, la branche « autre hôte » produit la même erreur ; pas de constat |
| TLS : `rejectUnauthorized: false` | **Rouge** (A5, code 2 attendu) |
| JSONLD-004 supprimé | **Rouge** (2) |
| PERF-001 supprimé | **Rouge** (2) |
| PLACEHOLDER-001 supprimé | **Rouge** (3) |
| CANON-003 supprimé | **Rouge** (2) |
| TRACKER-001, scripts du site (`sessionStorage` dans un `.js`) | **Vert : survivante** (I1) |
| TRACKER-001, scripts en ligne (stockage) | **Vert : survivante** (I1) |

Non fait, conformément à la consigne reçue : la partie de R2 qui retire une section de `references/` puis rejoue son scénario.

## 5. Enseigner au test

- **FID** : c'est une contorsion (I2). Le bon remède est un critère bilingue, pas une consigne de silence.
- **Valeurs par défaut de la page de confidentialité** : c'est une contorsion, et elle est risquée (I3).
- **Écrits pour le correcteur sans dommage réel** : M6 et M7.
- **Légitime** : `structured-data.md:47`, qui fait appliquer chaque correction à tout fichier HTML, `404.html` compris. C'est un bon conseil générique. Seule réserve : il explique une limite du checker plutôt que la règle.
- **Légitimes aussi** : les termes juridiques français entre parenthèses (« opposition », « directeur de la publication », « hébergeur »), parce que ce sont les termes exacts des textes.

## 6. Écarts de check-site déclarés par le développeur

| Écart | Avis |
| --- | --- |
| `--dist` servi en mémoire, pas sur 127.0.0.1 | **Acceptable.** Les règles de résolution et `_headers` sont appliquées, les codes et le corps de la 404 sont respectés, aucun port n'est ouvert. Il manque l'info `_redirects` (M9). Amender la spec §4.2 pour qu'elle dise ce qui est livré |
| JSONLD-004 tolérant pour les nœuds tiers imbriqués | **Acceptable, et plus juste que la spec** : `geo.md:32` recommande `Article.citation` vers des sources primaires, que la lecture littérale refuserait. Les URL relatives et locales restent refusées partout. Il manque les tests de la tolérance (M8) |
| PERF-001 limité aux scripts externes de `<head>` | **Acceptable.** Un script classique en ligne ne peut pas recevoir `defer` : le signaler donnerait un avertissement impossible à corriger. Le dire en une ligne dans `performance.md` |

---

## Relecture 2 (12/10/2026, HEAD ef9f36c)

Objet : les corrections du testeur (a5da466..fef4050) et du développeur (e6f95f9..ef9f36c). Rien n'a été modifié, sauf cette section. Aucun scénario n'a été lancé.

Tests : 194/194 pour `check-site` et la forme du skill, 42/42 pour le correcteur.

### Verdict : A_CORRIGER

Il reste un constat important : la correction I3 repose sur une garde qui ne couvre pas la page qu'elle doit garder. Il reste aussi un constat mineur : DIST-001 n'a pas de test.

### 1. État des constats

| Constat | Traité | Où |
| --- | --- | --- |
| B1 noms en clair | **OUI** pour l'arbre ; l'historique sera réécrit par le coordinateur | `scripts/test/skill-structure.test.mjs:6`, `:29`, `:52` (empreintes SHA-256) ; `docs/` anonymisé (voir le point 2) |
| I1 TRACKER-001 non gardé | **OUI** | `scripts/test/check-site.test.mjs:545`, `:554`, `:564` ; mutations rouges (voir le point 3) |
| I2 FID | **OUI** | `references/performance.md:17`, `:50` (FID nommé avec sa date, jamais présenté comme actuel) ; critère S7 bilingue `evals/scenarios/s7-perf.json:79` |
| I3 valeurs inventées | **PARTIEL** | `references/privacy-legal-fr.md:84` : plus de valeur inventée, `[à compléter]` et article 13 sourcé (`:54`). La phrase « `check-site` (PLACEHOLDER-001) blocks an indexable build until the owner fills it » est fausse quand la page de confidentialité est en `noindex`, ce que `references/on-page-seo.md:26` autorise pour les pages juridiques : PLACEHOLDER-001 ne lit que les pages indexables (`scripts/check-site.mjs:936`). Vérifié sur une copie de `clean` : `[à compléter]` ajouté à `/legal/`, qui est `noindex` ; résultat « 0 errors », code 0. Voir R2-1 |
| I4 une seule passe | Hors compte (décision de budget du propriétaire) | — |
| I5 doublons | **OUI** | entité : `references/structured-data.md:25` renvoie à `geo.md:31` ; relais : `references/privacy-legal-fr.md:61` ; mesure : `references/post-launch.md:29` ; indexation : `references/publishing-routine.md:21` ; marqueurs : `references/build-guards.md:42-45` |
| M1 Auto Minify | **OUI** | `references/cloudflare.md:23` |
| M2 llms.txt | **OUI** | `references/geo.md:8-9` (guide IA cité) |
| M3 cumul `_headers` | **OUI** | `references/security-headers.md:49` |
| M4 sessionStorage | **OUI** | `references/privacy-legal-fr.md:23-24` ; message `scripts/check-site.mjs:1052` |
| M5 LCEN | **OUI** | `references/privacy-legal-fr.md:88` |
| M6 dist la veille | **OUI** | `references/pre-launch.md:78` (une phrase) |
| M7 formulations pour le correcteur | **OUI** | `references/ai-crawlers.md:56` ; `references/keywords.md` (ligne retirée) ; `references/privacy-legal-fr.md:108` |
| M8 tolérance JSONLD-004 | **OUI** | `scripts/test/check-site.test.mjs:576`, `:592`, `:607` |
| M9 `_redirects` | **OUI**, sans test | `scripts/check-site.mjs:1036-1039` ; spec `docs/spec.md:397`. Voir R2-2 |
| M10 chemins personnels | **OUI** | `evals/run.mjs:48-51` (`EVAL_WATCH`) ; résumés réécrits en `<home>` |

### 2. Arbre de HEAD

Commande : `git grep -i` sur les noms du client et du site de référence, le prénom et le nom du propriétaire, son compte, le nom du dépôt mémoire, `wwwroot`, `C:/Users`, `/c/Users`, `AppData`, les noms des autres projets et l'identifiant GitHub.

Restent seulement `LICENSE:3` et l'URL du dépôt dans `README.md:27`, deux exceptions admises. `posthog` (`scripts/check-site.mjs:51`, `docs/spec.md:457`) désigne un éditeur d'outil de mesure, pas un client.

### 3. Mutations de TRACKER-001

J'ai appliqué chaque mutation en place, lancé les tests avec la commande du README, puis restauré par `git checkout`. `git status --porcelain` est vide à la fin.

| Mutation | Résultat |
| --- | --- |
| Chemin des scripts en ligne neutralisé (`const storage = [] \|\| …`) | **Rouge** : 2 échecs (sessionStorage en ligne ; localStorage et document.cookie) |
| Chemin des scripts du site neutralisé (`if (false) add('TRACKER-001'…`) | **Rouge** : 2 échecs (`/assets/visit.js` ; localStorage) |
| `sessionStorage` retiré de `STORAGE_API` | **Rouge** : 2 échecs (en ligne et script du site) |

### 4. Faits reformulés (WebFetch, 12/10/2026)

| Fait | Source | Résultat |
| --- | --- | --- |
| Auto Minify « Deprecated on 2024-08-05 » | Cloudflare API deprecations : seul le champ « Deprecation date: August 5, 2024 », aucune date de fin de vie | **Exact** |
| `sessionStorage` : non nommé par la CNIL, l'article 82 couvre toute inscription, le traiter comme un traceur est une interprétation | Lignes directrices §13 (le « local storage » HTML 5, pas `sessionStorage`) ; article 82 sur Légifrance (« inscrire des informations dans cet équipement », aucune technologie nommée) | **Exact** |
| INP remplace FID le 12/03/2024 | web.dev : « formal introduction as a Core Web Vital on March 12, 2024, replacing FID » | **Exact** |
| Nouveaux : RGPD art. 13.1.e et 13.2.a ; guide IA de Google (« doesn't use them », « neither harm nor help ») | cnil.fr chapitre 3 ; ai-optimization-guide | **Exacts** |

### 5. DIST-001 sans test

Le constat est de niveau info, n'influe pas sur le code de sortie et dit seulement que le mode `--dist` n'applique pas `_redirects`. Son absence de test ne laisse passer aucun défaut de site : c'est **acceptable sur le fond**.

En revanche, la spec §4.5, point 1, demande deux faces par contrôle (« un contrôle sans cas rouge ne compte pas comme livré »), et DIST-001 est explicitement placé « hors table 4.3 ». C'est donc un mineur : deux cas suffisent, un `dist/` avec `_redirects` (DIST-001 en info, `url` nulle) et le témoin `clean` (aucun DIST-001).

### Constats restants

| ID | Gravité | Fichier:ligne | Correction attendue |
| --- | --- | --- | --- |
| R2-1 | Important | `references/privacy-legal-fr.md:84` ; `scripts/check-site.mjs:936` | Option A, côté testeur et développeur : appliquer PLACEHOLDER-001, en mode `launch`, à toute page publique qui répond 200, `noindex` compris, comme le disent déjà `references/pre-launch.md:35` (« a public page ») et la garde de compilation `references/build-guards.md:42` (« every page »), avec un cas rouge sur une page `noindex`. Option B : réécrire la phrase, en disant que seule la garde de compilation du projet bloque une page `noindex` et que `check-site` ne lit que les pages indexables. L'option A est préférable : la page de confidentialité est souvent en `noindex` |
| R2-2 | Mineur | `scripts/check-site.mjs:1036-1039` | Deux cas de test pour DIST-001 (voir le point 5) |
