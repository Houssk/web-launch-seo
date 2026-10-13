# Rapport du développeur : skill web-launch-seo, du rouge au vert

Date : 12/10/2026. Branche `feat/harnais`, à partir de b3b29ef. Rôle : développeur du harnais (`docs/cadrage.md`, `docs/spec.md` et ses amendements, `docs/validation-contrat.md`, `docs/rapport-testeur.md`). Je n'ai modifié ni test, ni site témoin, ni scénario, ni correcteur, ni lanceur. Rien n'a été poussé.

## 1. Ce qui est livré

| Chemin | Contenu |
| --- | --- |
| `scripts/check-site.mjs` | Contrôle déterministe, Node ≥ 20, zéro dépendance, 45 contrôles de la spec §4.3, sortie texte et JSON de §4.4, codes 0/1/2, exports `isAllowed`, `parseHeadersFile`, `headersFor`, `imageSize`, `cspHash` |
| `SKILL.md` | 77 lignes, en anglais : description à la troisième personne (763 caractères), `How to use`, `Phase router` (13 références), `Run the checker`, `Non-negotiable guardrails`, `Report format` (Fixed, Needs owner decision, Not verified) |
| `references/*.md` | Les 13 fichiers de la spec §1, chacun avec une section « Say in the report » ; chaque fait daté porte `Source: <URL> (read 2026-10-12)`, chaque règle non sourcée porte « Recommendation (unsourced) » |
| `README.md` | Nouvelle structure, commandes du checker et du banc |
| `evals/results/2026-10-12-new*.{json,md}` | Campagnes `new`, `new-b`, `new-c` |
| `evals/results/2026-10-12-{old,none}*.{json,md}` | Campagnes `old` et `none` recorrigées (`--regrade`) |

Aucun autre script n'est prévu par la spec : `scripts/` ne contient que `check-site.mjs` (et les tests du testeur).

## 2. Couverture des manques G1 à G12

| Manque | Fichier(s) | Contrôles check-site |
| --- | --- | --- |
| G1 interrupteur, staging fermé, contenu provisoire | `references/pre-launch.md`, `references/build-guards.md` (gardes et test) | ROBOTS-002, INDEX-001, INDEX-002, SITEMAP-001, SITEMAP-004, PLACEHOLDER-001 |
| G2 pièges d'ouverture | `references/pre-launch.md` (« Opening-day pitfalls », « Say in the report ») | ROBOTS-001, ROBOTS-006, INDEX-002 |
| G3 URL par environnement, refus du localhost | `references/build-guards.md` | ROBOTS-003, SITEMAP-002, CANON-001, OG-001, JSONLD-004 |
| G4 règles imposées par des tests, Lighthouse CI, preuve par retrait | `references/build-guards.md` (gabarit de test, `lighthouserc.json`) | META-*, CANON-002/003, LINK-001, NOTFOUND-001, SITEMAP-003, HREFLANG-001 |
| G5 mots-clés sans outil payant | `references/keywords.md` | - |
| G6 données structurées à jour | `references/structured-data.md` | JSONLD-001 à 008, SITEMAP-005 |
| G7 robots IA, couche Cloudflare | `references/ai-crawlers.md`, `references/cloudflare.md` | ROBOTS-004, ROBOTS-005 |
| G8 RGPD France, mesure d'audience | `references/privacy-legal-fr.md` (dont « Keeping measurement without a banner ») | TRACKER-001 |
| G9 en-têtes de sécurité, Worker | `references/security-headers.md` (gabarit de relais) | HEADERS-001/002, CSP-001/002, MIXED-001 |
| G10 Core Web Vitals | `references/performance.md` | IMG-001, CSS-001, PERF-001 |
| G11 GEO au-delà de llms.txt | `references/geo.md` | ENTITY-001, LLMS-001 |
| G12 contrôles après déploiement, cas français | `references/post-launch.md` ; LCEN, registre des risques, contenu à fort enjeu dans `references/privacy-legal-fr.md` | REDIRECT-001/002, NOTFOUND-001, HEADERS-001 (HSTS en ligne) |

Le contenu de l'ancien `SKILL.md` est réparti selon la table « Où va le contenu actuel » de la spec : `on-page-seo.md` (§2, §4), `publishing-routine.md` (§5, §7), `cloudflare.md` (§6), `post-launch.md` (§8), garde-fous dans `SKILL.md`.

## 3. Points périmés P1 à P18

| # | Correction | Où |
| --- | --- | --- |
| P1 | Description à la troisième personne, cas principal en tête | `SKILL.md` |
| P2 | FAQ : limitée depuis le 08/08/2023, plus affichée depuis le 07/05/2026 ; plus de section FAQ obligatoire par article | `structured-data.md`, `publishing-routine.md` |
| P3 | 60 et 160 caractères : convention de troncature, avertissement seulement | `on-page-seo.md`, check-site META-001/002 |
| P4 | `Disallow` cache le `noindex`, cache de 24 h, 4xx, 5xx | `pre-launch.md` |
| P5 | llms.txt : proposition, non utilisée par la recherche Google | `geo.md` |
| P6 | « Bing feeds ChatGPT » retiré (OpenAI a son robot `OAI-SearchBot`) | `geo.md` |
| P7 | « LLMs cite mostly English » retiré, dit comme non sourcé | `geo.md` |
| P8 | Tiered Cache corrigé (Smart Topology toutes offres, Generic Global Enterprise, inutile sans origine) | `cloudflare.md` |
| P9 | Crawler Hints : signal sur MISS, moteurs non nommés, Worker non documenté, vérifier dans Bing | `cloudflare.md`, `publishing-routine.md` |
| P10 | Early Hints sans effet sans en-têtes `Link` | `cloudflare.md` |
| P11 | Bot Fight Mode : défis, API, non contournable par WAF ; AI Crawl Control et robots.txt géré | `cloudflare.md`, `ai-crawlers.md` |
| P12 | Auto Minify : fin de vie le 05/08/2024, sourcée | `cloudflare.md` |
| P13 | En-têtes complets (CSP, Referrer-Policy, Permissions-Policy) ; `_headers` ne couvre pas un Worker | `security-headers.md` |
| P14 | « quota ~10/day » retiré : quota non documenté | `pre-launch.md`, `publishing-routine.md` |
| P15 | Cloudflare Web Analytics : hors article 82, RGPD toujours applicable | `privacy-legal-fr.md`, `post-launch.md` |
| P16 | Clarity : signal de consentement EEE/UK/CH depuis le 31/10/2025 | `privacy-legal-fr.md`, `post-launch.md` |
| P17 | « cookieless analytics need no banner » remplacé : stockage local = traceur, exemption sous conditions, opposition, information | `privacy-legal-fr.md`, `SKILL.md` |
| P18 | INP depuis le 12/03/2024, seuils ; médiane de 5 passes | `performance.md`, `build-guards.md` |

## 4. Résultats

### Tests sans modèle

| Commande | Résultat |
| --- | --- |
| `node --test scripts/test/check-site.test.mjs` | 170/170 |
| `node --test scripts/test/skill-structure.test.mjs` | 18/18 |
| `node --test evals/test/grade.test.mjs` | vert (229/229 pour les trois fichiers ensemble) |

Node 24.20.0 seulement ; Node 20 non essayé.

### Scénarios `new` (1 passe par scénario)

| Scénario | Campagne | SHA du skill | Statut | Contrôles verts / rouges | Coût |
| --- | --- | --- | --- | --- | --- |
| S1 opening | `2026-10-12-new` | 8961006 | vert | 11/0 | 0,35 $ |
| S2 build-guards | `2026-10-12-new` | 8961006 | vert | 19/0 | 0,30 $ |
| S3 keywords | `2026-10-12-new` | 8961006 | vert | 5/0 | 0,11 $ |
| S4 schema | `2026-10-12-new-b` | 944222c | vert | 7/0 | 0,20 $ |
| S5 ai-geo | `2026-10-12-new` | 8961006 | vert | 5/0 | 0,21 $ |
| S6 headers | `2026-10-12-new` | 8961006 | vert | 6/0 | 0,18 $ |
| S7 perf | `2026-10-12-new-b` | 944222c | vert | 8/0 | 0,15 $ |
| S8 privacy-fr | `2026-10-12-new-c` | 1613347 | vert | 10/0 | 0,21 $ |

**8/8 verts.** Rouges de la première passe, corrigés dans le skill :

| Scénario | Rouge | Cause | Correction du skill |
| --- | --- | --- | --- |
| S4 | « logo is not the SVG favicon » | l'agent a corrigé les quatre pages mais pas `404.html`, que check-site ne lit que pour le statut et la canonique | `structured-data.md` : appliquer chaque correction à tout fichier HTML, `404.html` compris, puis chercher l'ancienne valeur dans toute la sortie |
| S7 | « FID présenté comme métrique actuelle » | le compte rendu français disait « L'INP a remplacé FID » (voir réserve 4) | `performance.md` : ne pas nommer l'ancienne métrique dans le compte rendu |
| S8 (passe 1) | lien d'opposition absent | l'agent a supprimé toute la mesure alors que la demande était de la garder | `privacy-legal-fr.md` : section « Keeping measurement without a banner » |
| S8 (passe 2) | sous-traitant et durée de conservation absents de la page | l'agent les a renvoyés au propriétaire sans les écrire | `privacy-legal-fr.md` : lignes « Sous-traitants » et « Durée de conservation » toujours présentes, valeur prudente par défaut signalée au propriétaire |

Les corrections ne touchent que `structured-data.md`, `performance.md` et `privacy-legal-fr.md`. D'après les transcriptions (appels `Read`), les passes vertes de S1, S2, S3, S5 et S6 n'ont lu aucun de ces trois fichiers : elles restent valables pour le contenu final des références qu'elles ont lues (`pre-launch`, `on-page-seo`, `security-headers`, `build-guards`, `keywords`, `ai-crawlers`, `geo`). `SKILL.md` n'a pas changé depuis 8961006.

### `old` et `none` après `--regrade`

Les contrôles `check-site` en attente sont maintenant jugés ; aucun n'est plus « pending ».

| Scénario | `old` | Contrôles v/r | check-site | `none` | Contrôles v/r | check-site |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | rouge | 7/4 | rouge | rouge | 9/2 | vert |
| S2 (durci) | rouge | 18/1 | vert, vert | rouge (`none-b`) | 18/1 | vert, vert |
| S3 | rouge | 2/3 | - | rouge | 2/3 | - |
| S4 | rouge | 3/4 | rouge | rouge | 5/2 | rouge |
| S5 | rouge | 4/1 | vert | rouge | 1/4 | rouge |
| S6 | rouge | 3/3 | vert | rouge | 5/1 | vert |
| S7 | rouge | 7/1 | vert | rouge | 5/3 | rouge |
| S8 | rouge | 1/9 | - | rouge | 0/10 | - |

**`old` : 8/8 rouges ; `none` : 8/8 rouges ; `new` : 8/8 verts.** Campagnes lues : `old` = `2026-10-12-old` (S1, S3 à S8) et `-old-s2-hardened` (S2) ; `none` = `-none` (S1), `-none-b` (S2, S5), `-none-c` (S6 à S8), `-none-s3-s8` (S3, S4). Le S2 de `2026-10-12-old` et de `2026-10-12-none` précède le durcissement : recorrigé, mais non lu.

## 5. Coût

| Campagne | Exécutions | Coût |
| --- | --- | --- |
| `2026-10-12-new` | 8 | 1,73 $ |
| `2026-10-12-new-b` (S4, S7, S8) | 3 | 0,55 $ |
| `2026-10-12-new-c` (S8) | 1 | 0,21 $ |
| **Total** | 12 | **2,49 $** sur 3,20 $ autorisés |

`--regrade` ne coûte rien (aucun appel au modèle). Aucune garde d'isolation déclenchée, aucune exécution rejouée pour cause externe.

## 6. Écarts et réserves

1. **Une passe par scénario, pas trois.** La spec §5.3 demande 3 répétitions et la majorité ; le budget (3,20 $) ne le permettait pas. Le vert est donc constaté une fois par scénario, et S4, S7, S8 l'ont été après correction du skill. Le modèle n'est pas déterministe : une campagne `--reps 3` reste à jouer (environ 6 $).
2. **check-site, mode `--dist` servi en mémoire.** La spec §4.2 dit « sert le dossier sur 127.0.0.1 ». Le script résout les chemins dans le processus, avec les mêmes règles (`/x/`, `/x` → `x.html` ou 308, 404 avec `404.html`, `_headers` appliqué, `_headers` et `_redirects` non servis). Rien d'observable ne change et aucun port n'est ouvert. `_redirects` n'est pas signalé en info.
3. **check-site, choix d'interprétation** (aucun test ne les contredit) :
   - JSONLD-004 : une URL relative ou locale est une erreur partout ; « autre hôte » n'est une erreur que pour les nœuds du site (racines, éléments de `@graph`, nœuds dont l'`@id` est sur l'hôte). Un auteur ou une citation imbriqués peuvent pointer ailleurs. La spec, à la lettre, les refuserait aussi ;
   - PERF-001 : ne vise que les scripts externes (`src`) de `<head>` ; un petit script en ligne dans `<head>` n'est pas signalé ;
   - CSP-002 se déclenche même si `script-src` contient `'unsafe-inline'` (le témoin `headers-perf` l'exige) ; il ne s'applique pas à une page sans CSP (HEADERS-001 le couvre déjà) ;
   - ENTITY-001 ne compte que les `Organization` du site (pas un nœud dont l'`@id` est sur un autre hôte) ;
   - en ligne, la joignabilité se juge sur `GET /` ; un échec réseau ou TLS donne le code 2.
4. **Critère S7 à revoir par le testeur.** Le contrôle « report does not present FID as a current metric » n'accepte la mention de FID qu'avec `replac|deprecat|former|retired|no longer|old`, en anglais seulement. Les comptes rendus sont en français (consignes globales chargées) : « L'INP a remplacé FID » a été jugé rouge. Je n'ai pas touché au test ; le skill demande désormais de ne pas nommer FID, ce qui est aussi un meilleur conseil. Ajouter `remplac|obsolète|ancien` rendrait le critère bilingue comme les autres.
5. **Fait ajouté hors spec, vérifié** : la configuration Lighthouse CI (`aggregationMethod` par assertion, défaut `{"aggregationMethod": "optimistic", "minScore": 1}`, `staticDistDir`), lue le 12/10/2026 sur la page [S41]. Aucun autre fait nouveau : le reste vient de la table des sources de la spec, ou est écrit comme recommandation.
6. **Sources à revérifier par le relecteur** : [S7] et [S43] ont été lues par l'architecte « via le résultat de recherche » ; je ne les ai pas relues.
7. **Limites connues du banc**, inchangées : consignes globales de l'utilisateur chargées (comptes rendus en français), effet relatif `old` contre `new` dans les mêmes conditions.
8. **Valeurs par défaut de la page de confidentialité** : retirées au tour de correction (relecture I3), voir §7.
9. Le README garde l'URL GitHub publique du dépôt, déjà présente avant ; aucune donnée client (test de forme vert).

## 7. Tour de correction après la relecture à froid (`docs/relecture.md`)

### Constats traités

| Constat | Traitement | Fichier |
| --- | --- | --- |
| B1 (part du développeur) | Noms du propriétaire, du site de référence et du client remplacés par « le propriétaire », « le site de référence », « le client », leçons et chiffres gardés ; relecture versée anonymisée | `docs/cadrage.md`, `docs/spec.md`, `docs/rapport-developpeur.md`, `docs/relecture.md` |
| I2 | Consigne « ne pas nommer FID » retirée ; le compte rendu dit que l'INP a remplacé le FID le 2024-03-12, avec sa source | `references/performance.md` |
| I3 | Valeurs par défaut inventées retirées ; les lignes « Sous-traitants » et « Durée de conservation » restent obligatoires (RGPD art. 13, sourcé), avec les vraies valeurs du propriétaire ou le repère `[à compléter]`, que PLACEHOLDER-001 bloque | `references/privacy-legal-fr.md` |
| I5 | Une seule source par règle : nom de l'entité dans `geo.md` ; devoirs du relais dans `security-headers.md` ; Cloudflare Web Analytics et Clarity dans `privacy-legal-fr.md` ; Indexing API et quota dans `pre-launch.md` ; marqueurs de contenu provisoire dans `pre-launch.md`. Les autres fichiers renvoient en une phrase | 6 références |
| M1 | « Deprecated on 2024-08-05 » au lieu de « end of life » | `references/cloudflare.md` |
| M2 | Guide Google sur l'IA générative cité comme source (« Google Search itself doesn't use them »), revérifié le 12/10/2026 | `references/geo.md` |
| M3 | Cumul des règles `_headers` sourcé (« will inherit all rules' headers », valeurs « joined with a comma separator »), revérifié le 12/10/2026 | `references/security-headers.md` |
| M4 | `sessionStorage` écrit partout comme une interprétation prudente de l'article 82, jamais comme un fait CNIL (référence, message TRACKER-001, cadrage) | `references/privacy-legal-fr.md`, `scripts/check-site.mjs`, `docs/cadrage.md` |
| M5 | Liste LCEN complétée (codirecteur, responsable de la rédaction, tiers qui stockent des données, « le cas échéant »), d'après la relecture de Légifrance par le relecteur | `references/privacy-legal-fr.md` |
| M6 | « Fixing a built dist/ » réduit à trois phrases | `references/pre-launch.md` |
| M7 | Règle générale pour ROBOTS-005 ; phrase sur les autres tableaux retirée de `keywords.md` ; « owner (propriétaire) » ramené à « owner » | `references/ai-crawlers.md`, `references/keywords.md`, `references/privacy-legal-fr.md` |
| M9 | `_redirects` signalé en info (`DIST-001`, hors table 4.3) ; spec §4.2 amendée (service en mémoire, DIST-001) | `scripts/check-site.mjs`, `docs/spec.md` |
| §6 | Limite de PERF-001 (scripts externes seulement) dite en une ligne | `references/performance.md` |
| §5 | Conseil « 404 incluse » reformulé en règle (blocs partagés sur toutes les pages), la limite du checker en complément | `references/structured-data.md` |

### Constats laissés

| Constat | Raison |
| --- | --- |
| I1, M8 (tests TRACKER-001 et JSONLD-004) et M10 (chemins locaux) | Part du testeur, faite avant ce tour |
| I4 (une passe au lieu de trois) | Décision de budget du propriétaire ; le vert reste « constaté une fois » |
| DIST-001 sans test | Les tests appartiennent au testeur ; vérifié à la main (une copie de `clean` avec `_redirects` donne `I DIST-001`, 0 erreur) |

### Vérifications

- `node --test scripts/test/check-site.test.mjs scripts/test/skill-structure.test.mjs evals/test/grade.test.mjs` : 236/236.
- S7 rejoué sur `new` après le retrait de la consigne FID (campagne `2026-10-12-new-d`, `EVAL_WATCH` sur le dépôt mémoire) : **vert**, 8/8 contrôles, 0,16 $, 16 tours. Le compte rendu dit « L'INP a remplacé le FID le 2024-03-12 », accepté par le critère bilingue du testeur.
- Coût cumulé du développeur : 2,49 + 0,16 = 2,65 $.

## 8. Reste à faire

| ID | Sujet | Qui | Ce qui débloque |
| --- | --- | --- | --- |
| R1 à R4 | Relecture à froid : faits sourcés, mutation du banc, concision, données client dans l'historique | relecteur | ce rapport |
| D4 | Campagne `new --reps 3` (règle de majorité) | développeur | budget d'environ 6 $ accordé par le propriétaire |
| - | Essai sous Node 20 | testeur ou relecteur | une machine Node 20 |
