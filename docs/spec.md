# Spécification : refonte du skill web-launch-seo et de son banc d'essai

Date : 12/10/2026. Auteur : l'architecte du harnais (Claude). Lecteurs : le propriétaire, puis le testeur, le développeur et le relecteur.
Entrée : `docs/cadrage.md` (besoin, définition de « fini », manques G1 à G12, rôles). Le skill reste en anglais ; ce document est en français.

Conventions de ce document :

- **[Sn]** renvoie à la table des sources (section 7). Chaque source a été lue le 12/10/2026, sauf mention contraire.
- **Recommandation, non sourcé** : règle utile, mais sans page officielle lue. Le skill doit l'écrire comme une recommandation, jamais comme un fait.
- **Observé** : constat tiré du lancement de référence (le site de référence, 11 et 12/10/2026). Le skill le généralise sans nommer le site ni le client.
- Aucune donnée client dans le skill, les références, les scripts ni les sites témoins : domaines en `.test` ou `example.com`, marque fictive « Acme ».

---

## 0. Ce que disent les bonnes pratiques officielles (et ce qu'on en tire)

Lu sur [S1] (Skill authoring best practices), [S2] (Agent Skills overview), [S3] (Skills dans Claude Code) :

| Règle officielle | Citation courte | Conséquence ici |
| --- | --- | --- |
| Trois niveaux de chargement | métadonnées toujours chargées, `SKILL.md` « When Skill is triggered », ressources « None until accessed » [S2] | `SKILL.md` ne garde que ce qui sert à chaque usage ; le détail va dans `references/`, chargé à la demande |
| Corps court | « Keep SKILL.md body under 500 lines for optimal performance » [S1], idem [S3] | Cible : 150 lignes au plus pour `SKILL.md` (le test de structure bloque à 200) |
| Références à un seul niveau | « Keep references one level deep from SKILL.md » [S1] | Chaque fichier `references/*.md` est lié depuis `SKILL.md` ; aucune référence ne renvoie vers une autre |
| Table des matières | « For reference files longer than 100 lines, include a table of contents at the top » [S1] | Toute référence de plus de 100 lignes commence par `## Contents` |
| Description | `name` : 64 caractères au plus, minuscules, chiffres, tirets ; `description` : 1 024 au plus, dit ce que fait le skill et quand l'utiliser ; « Always write in third person » [S1] [S2] | La description actuelle (« Use when… ») n'est pas à la troisième personne : à réécrire |
| Troncature de la liste | description et `when_to_use` « truncated at 1,536 characters in the skill listing » ; « Put the key use case first » [S3] | Le cas d'usage principal en tête de la description |
| Scripts | « Prefer scripts for deterministic operations » ; le script s'exécute, seule sa sortie entre en contexte [S1] [S2] | Les contrôles reproductibles vont dans `scripts/check-site.mjs`, que le skill fait exécuter, pas lire |
| Résoudre, pas déléguer | « handle error conditions rather than deferring to Claude » ; pas de « voodoo constants » [S1] | Chaque seuil du script est justifié dans un commentaire ; messages d'erreur précis et actionnables |
| Boucle de validation | « Run validator → fix errors → repeat » [S1] | Le flux du skill : `check-site` → corriger → `check-site` |
| Pas d'information datée dans le flux | « Don't include information that will become outdated » ; les anciens usages vont dans une section « Old patterns » [S1] | Les faits datés (FAQ, INP, Auto Minify) vivent dans les références, avec leur date et leur source ; `SKILL.md` n'en porte que la règle |
| Évaluations d'abord | « Create evaluations BEFORE writing extensive documentation » ; mesurer une ligne de base sans le skill [S1] | Le testeur construit le banc et constate le rouge avant que le développeur écrive |
| Chemins | « Always use forward slashes in file paths » [S1] | Aucune barre oblique inverse dans le skill |
| Dépendances | « Avoid assuming tools are installed » [S1] | `check-site` : Node 20 ou plus, zéro dépendance |

---

## 1. Structure cible du dépôt

```
web-launch-seo/
├── SKILL.md                      # mode d'emploi court (≤ 150 lignes)
├── README.md                     # présentation publique, installation, banc d'essai
├── LICENSE
├── references/                   # chargé à la demande, un sujet par fichier
│   ├── pre-launch.md             # G1, G2
│   ├── build-guards.md           # G3, G4
│   ├── on-page-seo.md            # titres, canoniques, OG, hreflang (ex-§2 et §4)
│   ├── structured-data.md        # G6
│   ├── keywords.md               # G5
│   ├── geo.md                    # G11, statut de llms.txt
│   ├── ai-crawlers.md            # G7
│   ├── privacy-legal-fr.md       # G8, volet juridique de G12
│   ├── security-headers.md       # G9
│   ├── performance.md            # G10, budget de perf (ex-§1)
│   ├── cloudflare.md             # durcissement de zone corrigé (ex-§6)
│   ├── post-launch.md            # contrôles après déploiement (G12), suivi (ex-§8)
│   └── publishing-routine.md     # routine par article (ex-§5 et §7)
├── scripts/
│   ├── check-site.mjs            # contrôle déterministe, Node ≥ 20, zéro dépendance
│   └── test/
│       ├── check-site.test.mjs   # node:test, deux faces par contrôle
│       ├── skill-structure.test.mjs  # forme du skill (lignes, liens, frontmatter, données client)
│       └── fixtures/             # micro-cas unitaires (robots, _headers, images)
├── evals/
│   ├── README.md                 # protocole d'exécution (anglais, court)
│   ├── fixtures/                 # sites témoins (section 4.1), chacun avec expected.json
│   ├── scenarios/                # s1-*.json … s8-*.json
│   ├── grade.mjs                 # correcteur déterministe
│   ├── run.mjs                   # exécution headless (claude -p)
│   └── results/                  # résumés commités ; transcriptions brutes ignorées par git
└── docs/                         # cadrage.md, spec.md (français, pour le propriétaire)
```

### Justification du découpage

- **`SKILL.md`** : ce qui sert à **chaque** usage. Le routeur de phases (quelle référence charger, quand), les garde-fous non négociables, la boucle `check-site`, le format du compte rendu. Il ne contient aucun fait daté : ces faits changent (la FAQ Google a changé deux fois en trois ans [S6] [S7]) et leur place est dans la référence qui les source.
- **`references/`** : un fichier par moment du travail, pas par technologie, parce que l'agent arrive avec une question de moment (« on ouvre demain », « on publie un article », « mesure d'audience en France »). Le routeur dit : *Load `references/pre-launch.md` before flipping the indexing switch.* Deux manques partagent un fichier quand ils servent au même moment (G1 et G2 le jour de l'ouverture ; G3 et G4 dans la chaîne de compilation). Le juridique français reste à part (`privacy-legal-fr.md`) : un site hors de France ne le charge jamais. `cloudflare.md` reste à part : un autre hébergeur ne le charge pas.
- **`scripts/`** : ce qui se vérifie sans jugement (robots.txt, plan du site, canoniques, JSON-LD, en-têtes, redirections) doit être exécuté, pas relu par le modèle [S1]. Le même script sert à l'agent, aux tests de compilation d'un projet utilisateur et au correcteur du banc.
- **`evals/`** : la preuve demandée par le cadrage (« rouge sur la version actuelle, vert sur la nouvelle »). Séparé de `scripts/` parce que le banc n'est pas livré à l'utilisateur comme outil, et parce que le développeur n'a pas le droit d'y toucher.
- **Propriété des fichiers** : `scripts/check-site.mjs`, `scripts/test/`, `evals/` appartiennent au **testeur**. Le développeur n'y touche pas ; s'il a besoin d'un changement du script (option, message), il le demande au testeur. Sinon le développeur pourrait rendre le correcteur plus indulgent.

### Contenu de `SKILL.md` (plan imposé au développeur)

1. Frontmatter : `name: web-launch-seo` ; `description` à la troisième personne, cas principal en tête, 1 024 caractères au plus, avec les mots déclencheurs : launch, go live, staging, noindex, robots.txt, sitemap, canonical, structured data / JSON-LD, Core Web Vitals, Lighthouse, llms.txt, AI crawlers, GEO, CNIL / cookie consent, security headers, Cloudflare, publish an article. Exemple de forme : « Launches and hardens static marketing sites for search and AI answers: pre-launch indexing switch, build guards, structured data, AI crawler policy, security headers, Core Web Vitals, French privacy and legal notices, post-deploy checks, article routine. Use when … ».
2. `## How to use` : le flux en 5 lignes : identifier la phase → charger la référence → exécuter `check-site` → corriger → relancer jusqu'à zéro erreur → compte rendu.
3. `## Phase router` : tableau « Situation → Load ». Les 13 références, chacune avec sa condition de chargement (voir section 2, colonne « Charger quand »).
4. `## Run the checker` : les deux commandes (`--dist` avant déploiement, `--url --domain` après), le sens des codes de sortie, et la consigne : corriger les erreurs, justifier chaque avertissement laissé.
5. `## Non-negotiable guardrails` (10 lignes au plus) : un seul interrupteur d'indexation, fermé par défaut ; jamais `Disallow` sur une page qu'on veut désindexer ; la compilation refuse une URL locale dans une page indexable ; chaque garde a un test qui rougit sans elle ; aucun chiffre, avis, note, numéro d'article ou profil `sameAs` inventé ; les questions juridiques (CNIL, LCEN) sont listées pour le propriétaire, pas tranchées par l'agent ; un fait daté se vérifie à sa source avant d'être affirmé à l'utilisateur.
6. `## Report format` : trois sections fixes : *Fixed* (fichier, contrôle `check-site`), *Needs owner decision* (avec la règle et la source), *Not verified*. Ce format sert aussi le correcteur.

### Où va le contenu actuel

| Section actuelle | Destination | Traitement |
| --- | --- | --- |
| §1 Foundations | `performance.md` (budget), `build-guards.md` (schéma de contenu validé à la compilation) | Garder ; ajouter la médiane de plusieurs passes |
| §2 On-page SEO | `on-page-seo.md`, `structured-data.md` | Corriger FAQ, limites de longueur (section 3) |
| §3 GEO | `geo.md` | Réécrire : statut de llms.txt, affirmations non sourcées retirées |
| §4 i18n | `on-page-seo.md` (section hreflang) | Garder ; ajouter la source Google contre la redirection automatique [S37] |
| §5 Content, §7 routine | `publishing-routine.md` | Garder ; retirer « FAQ (###) » comme section obligatoire de chaque article |
| §6 Cloudflare | `cloudflare.md`, `ai-crawlers.md`, `security-headers.md` | Corriger (section 3) |
| §8 Monitoring | `post-launch.md` | Corriger les affirmations sur la mesure d'audience |
| §9 Guardrails | `SKILL.md` (garde-fous), `privacy-legal-fr.md` | Corriger « cookieless analytics need no banner » |
| §10 Launch sequence | `SKILL.md` (flux) et `pre-launch.md` (séquence d'ouverture) | Réécrire avec `check-site` |

---

## 2. Contenu par manque (G1 à G12)

Pour chaque manque : où il va, quand l'agent charge le fichier, les règles exactes (à traduire en anglais par le développeur), les commandes et exemples génériques, les sources. Les exemples de code sont génériques (Node, Astro en exemple de référence, mais la règle vaut pour tout générateur statique).

### G1 : phase avant lancement (interrupteur, staging fermé, contenu provisoire)

**Fichier** : `references/pre-launch.md`. **Charger quand** : avant toute mise en ligne publique, toute création de staging, et avant de basculer l'indexation.

Règles :

1. **Un seul interrupteur d'indexation**, une variable de compilation (exemple : `PUBLIC_INDEXABLE=true`). Il pilote ensemble : la balise `<meta name="robots">` de toutes les pages, le contenu de `robots.txt`, l'en-tête `X-Robots-Tag` éventuel. **Fermé par défaut** : une compilation sans la variable explicite est non indexable. Jamais deux sources de vérité (exemple de défaut : robots.txt ouvert à la main, pages encore en `noindex`).
2. **Staging public mais fermé**, par ordre de préférence :
   1. contrôle d'accès (authentification HTTP, Cloudflare Access) : rien n'est lisible, donc rien n'est indexable (recommandation, non sourcé) ;
   2. sinon : `X-Robots-Tag: noindex` sur **toutes** les réponses du staging **et** `robots.txt` qui **n'interdit pas** l'exploration, pour que le robot lise le `noindex`. Source : « the page or resource must not be blocked by a robots.txt file » pour que `noindex` fonctionne ; l'en-tête `X-Robots-Tag` a « the same effect » que la balise [S11].
   3. Jamais `Disallow: /` seul : une adresse de staging liée ailleurs peut apparaître dans les résultats sans contenu [S11]. Observé : le staging du site de référence est resté dans ce cas, consigné comme risque accepté.
3. **Garde « contenu provisoire »** : une compilation indexable échoue si une page publique contient un marqueur de contenu provisoire. Liste par défaut (configurable par projet) : `lorem ipsum`, `TODO`, `TBD`, `[placeholder]`, `[à compléter]`. Observé : la garde a bloqué l'ouverture tant que les mentions légales portaient « En cours de complétion ». Exemple de test (générique) :

   ```js
   // test/build/placeholders.test.mjs — runs on dist/ after an indexable build
   const MARKERS = [/lorem ipsum/i, /\bTODO\b/, /\bTBD\b/, /\[placeholder\]/i];
   for (const page of indexablePages) for (const m of MARKERS) assert.doesNotMatch(page.text, m, page.path);
   ```

4. **Conditions d'ouverture qui appartiennent au propriétaire**, listées par l'agent, jamais décidées par lui : nom et marque vérifiés, domaine configuré (HTTPS forcé, HSTS, redirection `www`), pages légales complètes (G12), relecture experte du contenu à fort enjeu (G12), mesure d'audience conforme (G8).
5. **Séquence d'ouverture** (commandes exactes dans la référence) :

   ```
   1. SITE_URL=https://example.com PUBLIC_INDEXABLE=true <build>
   2. node <skill>/scripts/check-site.mjs --dist dist --site https://example.com      # 0 erreur
   3. deploy
   4. node <skill>/scripts/check-site.mjs --url https://example.com --domain example.com
   5. Search Console + Bing Webmaster : soumettre le plan du site ; inspection d'URL de l'accueil seulement
   ```

### G2 : pièges d'ouverture

**Fichier** : `references/pre-launch.md`, section « Opening-day pitfalls ». **Charger quand** : idem G1, et quand la Search Console signale une erreur juste après l'ouverture.

| Piège | Règle | Source |
| --- | --- | --- |
| `Disallow` cache le `noindex` | Une page bloquée par robots.txt n'est jamais relue : son `noindex` n'est pas vu, la page peut rester dans les résultats | [S11] |
| robots.txt en cache | Google le garde « for up to 24 hours », plus longtemps s'il ne peut pas le rafraîchir. Après la bascule, l'ancien fichier peut encore s'appliquer un jour : ne pas conclure à un échec, vérifier par le test en direct de l'inspection d'URL | [S10] |
| robots.txt en 4xx | Google traite tout 4xx (sauf 429) « as if a valid robots.txt file didn't exist » : un staging sans robots.txt et sans `noindex` est explorable | [S10] |
| robots.txt en 5xx | Exploration suspendue 12 h, puis dernier fichier en cache jusqu'à 30 jours | [S10] |
| « Impossible de récupérer » (Couldn't fetch) sur le plan du site d'une propriété neuve | Causes documentées : robots.txt, action manuelle, 404, erreur serveur, faible demande d'exploration ; Google réessaie « for a few days ». Vérifier avec l'inspection d'URL en direct (« Crawl allowed? Yes », « Page fetch: Successful ») puis attendre ; ne pas renvoyer en boucle | [S36] ; observé sur une propriété de domaine neuve, plan du site servi en 200 |
| Propriétés multiples | Un plan du site soumis dans une propriété n'est pas visible dans une autre : préférer une propriété de domaine | [S36] |
| Demande d'indexation | Manuelle, accueil et pages clés seulement. L'API Indexing est réservée aux pages `JobPosting` ou `BroadcastEvent` dans un `VideoObject` | [S34] ; quota quotidien de la demande manuelle : non documenté (ne pas écrire « ~10/day ») |

### G3 : URL par environnement, compilation qui refuse le localhost

**Fichier** : `references/build-guards.md`. **Charger quand** : mise en place ou modification de la compilation, d'un environnement, d'un workflow de déploiement.

Règles :

1. L'URL publique vient de l'environnement de compilation (`SITE_URL`), jamais du code. Chaque environnement (local, CI Lighthouse, staging, production) a la sienne.
2. La configuration de compilation **refuse de compiler** dans ces cas (exemple Astro, transposable) :

   ```js
   // astro.config.mjs — guards run at import time, before any page is built
   const indexable = process.env.PUBLIC_INDEXABLE === 'true';
   const site = process.env.SITE_URL;
   if (indexable && !site) throw new Error('SITE_URL is required for an indexable build');
   if (process.env.DEPLOY_TARGET === 'production' && !site?.startsWith('https://')) throw new Error('Production needs an https SITE_URL');
   if (site?.endsWith('/')) throw new Error('SITE_URL must not end with a slash');
   ```

   Exception explicite et testée : la compilation Lighthouse de la CI (indexable, `http://localhost:<port>`) reste permise.
3. Une variable vide n'est pas absente : un secret ou une variable CI non renseignée arrive souvent en chaîne vide. La garde teste la valeur, pas la présence. Observé.
4. Les clés publiques de test des services tiers (par exemple les clés de site CAPTCHA « toujours valides ») sont refusées quand `SITE_URL` est publique (recommandation, non sourcé ; observé).
5. Les tests de compilation reçoivent **la même** `SITE_URL` que la compilation. Observé : un workflow passait l'adresse à la compilation mais pas aux tests, d'où des tests rouges sur la compilation de production seulement.
6. Après compilation, `check-site --dist` vérifie qu'aucune canonique, `og:url`, `og:image`, URL de plan du site, `hreflang` ni URL de JSON-LD ne vise `localhost`, `127.0.0.1` ou un autre hôte que `--site`.

### G4 : règles imposées par des tests

**Fichier** : `references/build-guards.md`, section « Rules enforced by tests ». **Charger quand** : idem G3, et à chaque ajout d'une règle SEO ou de sécurité.

Règles :

1. **Une règle qui compte a un test qui bloque la fusion.** Liste minimale des tests de compilation (sur `dist/`, pas sur les fonctions seules) :
   - un seul `h1` par page, `lang` sur `<html>` ;
   - titre et description présents, uniques entre pages ; longueur au-delà de 60 et 160 caractères signalée (convention de troncature, pas règle Google : « there's no limit on how long a `<title>` element can be » [S32], idem pour la description [S33]) ;
   - canonique absolue, égale au chemin de la page, sur l'hôte public ; pas de canonique sur la 404 ;
   - `og:image` absolue, fichier présent dans `dist/` ;
   - chaque bloc JSON-LD est du JSON valide avec `@context` schema.org, et la page de base porte `Organization` et `WebSite` ; exiger au moins un bloc (une boucle sur zéro bloc passe à vide, observé) ;
   - `robots.txt` et plan du site conformes à l'interrupteur ; les pages `noindex` absentes du plan du site ;
   - chaque lien interne mène à une page compilée.
   Le plus simple : faire appeler `check-site --dist dist --site $SITE_URL` par la CI après la compilation, et garder les tests propres au projet pour ce que le script ne voit pas.
2. **Lighthouse CI bloquant** : 3 passes au moins (défaut de LHCI : 3 [S41]), assertion sur l'agrégat `median` ; `optimistic` retient la meilleure passe et masque une régression (à éviter pour la performance) [S41]. Exemple `lighthouserc.json` générique dans la référence (URL clés, `numberOfRuns: 5`, quatre catégories en `error`).
3. **Une garde se vérifie en la retirant** : retirer la garde (ou remettre l'ancien code), constater le rouge, remettre la garde, constater le vert. Commande type :

   ```bash
   git stash push -- astro.config.mjs   # remove the guard
   npm test                             # must FAIL on the guard's test
   git stash pop                        # restore
   npm test                             # must PASS
   ```

4. **Vérifier le chemin réel** : un test de la fonction pure ne prouve pas que la page compilée est juste. Observé : canoniques en localhost livrables avec 100 % de tests verts, parce que les tests portaient sur la fonction et pas sur la compilation de production.

### G5 : méthode de mots-clés sans outil payant

**Fichier** : `references/keywords.md`. **Charger quand** : étude de mots-clés, plan éditorial, choix du sujet d'un article.

Règles :

1. Sources gratuites, notées avec leur date et leur marché : autocomplétion des moteurs (signal qu'une requête existe, pas un volume) ; pages de résultats lues à la main (qui se classe : mesure de concurrence) ; Google Trends (indices relatifs, 0 = sous le seuil) ; réponses IA des moteurs (qui est cité : indicateur GEO). Les points d'accès d'autocomplétion ne sont pas des API documentées (recommandation, non sourcé) : ne pas en dépendre dans un outil livré.
2. **Volume : « not measured »** tant qu'aucune donnée mesurée n'existe. Ne jamais écrire un volume mensuel estimé. Le nombre de résultats annoncé par un moteur mesure la concurrence, pas la demande.
3. **Contrôle anti-robot** : on s'arrête, on ne contourne pas (obligation de sécurité du harnais, et Anthropic indique ne pas contourner les CAPTCHA pour ses propres robots [S43]).
4. Difficulté qualitative (faible, moyenne, forte) motivée par la composition de la page de résultats.
5. **Passage aux données réelles** : après l'ouverture, le rapport Performances de la Search Console (requêtes, impressions, position) remplace les signaux indirects ; revoir la priorisation après quelques semaines de données (recommandation, non sourcé).
6. Gabarit `docs/seo/keywords.md` : colonnes `Query | Source | Date | Market | Signal | Volume | Competition | Status`, avec `Volume = not measured` par défaut.

### G6 : données structurées à jour

**Fichier** : `references/structured-data.md`. **Charger quand** : ajout ou relecture de JSON-LD, nouveau type de page.

Faits datés (à écrire avec leur source et leur date) :

- **FAQ** : depuis le 08/08/2023, résultats enrichis FAQ limités aux sites gouvernementaux et de santé faisant autorité [S7] ; dépréciés le 08/05/2026, « This feature will no longer appear in Google Search starting May 7, 2026 » ; documentation retirée le 15/06/2026 [S6]. Conséquence : ne jamais promettre de résultat enrichi FAQ. Un balisage `FAQPage` qui reflète une FAQ visible reste inoffensif (Google, 2023 : inutile de le retirer [S7]) ; son intérêt pour les autres moteurs est une recommandation, non sourcé.
- **HowTo** : plus affiché sur ordinateur depuis le 13/09/2023, type déprécié [S7].
- Autres types retirés en 2025-2026 (cours, salaire estimé, vidéo d'apprentissage, annonce spéciale, véhicule, exercices) [S6] : ne pas les proposer.

Règles :

1. **Graphe relié par `@id`** : `Organization` (`https://example.com/#organization`), `WebSite` (`#website`, `publisher` → organisation) sur chaque page ; les autres nœuds y renvoient par `@id`.
2. **`Organization`** : aucune propriété requise ; `logo` d'au moins 112 × 112 px, explorable, dans un format accepté par Google Images [S29]. Recommandation, non sourcé (observé) : un PNG carré du symbole plutôt que le favicon.
3. **`sameAs`** : seulement des profils réels qui existent ; jamais inventés [S29 pour la définition].
4. **`SoftwareApplication` / `Product`** : le résultat enrichi logiciel exige `name`, `offers.price` et `aggregateRating` **ou** `review` [S30]. Sans notes réelles, pas de résultat enrichi : décrire l'application sans inventer de note ; ne jamais ajouter d'`aggregateRating` fictif.
5. **`Article`** : aucune propriété requise ; recommandées `author`, `datePublished`, `dateModified` (ISO 8601 avec fuseau), `headline`, `image` (plusieurs images, au moins 50 000 pixels, ratios 16×9, 4×3, 1×1) [S31]. `dateModified` suit la vraie date de modification du contenu (la même date sert au `lastmod` du plan du site, que Google n'utilise que s'il est « consistently and verifiably » exact [S35]).
6. **`AboutPage` + `Person`** : la page « À propos » décrit l'organisation et la personne (`about: [{@id org}, {@id person}]`, `Person.worksFor` → organisation). Patron générique observé.
7. **Le balisage correspond au texte visible** [S12].
8. **Échappement** : sérialiser le JSON-LD en remplaçant `<` par `<`, pour qu'aucun texte ne ferme la balise `<script>` (la spécification HTML impose d'échapper `</script` et `<!--` dans un script [S38]). Exemple : `JSON.stringify(data).replace(/</g, '\\u003c')`.
9. Vérification : `check-site` (JSON valide, URL absolues, types) puis Rich Results Test pour les types éligibles.

### G7 : robots IA

**Fichier** : `references/ai-crawlers.md`. **Charger quand** : objectif « être cité par les IA », écriture de robots.txt, réglage Cloudflare Security/Bots, ou baisse de citations.

Règles :

1. **Politique explicite, écrite dans le dépôt** (commentaire en tête de robots.txt ou doc) : séparer les robots de **recherche et de récupération** (qui font citer le site) des robots d'**entraînement**.
   - OpenAI : `OAI-SearchBot` (recherche ChatGPT ; un site exclu « will not be shown in ChatGPT search answers »), `GPTBot` (entraînement), `ChatGPT-User` (action d'un utilisateur ; « robots.txt rules may not apply ») [S42].
   - Anthropic : `ClaudeBot` (entraînement), `Claude-SearchBot` (recherche), `Claude-User` (requête d'un utilisateur) ; tous respectent robots.txt [S43].
   - Google : `Googlebot` gouverne aussi AI Overviews et AI Mode ; `Google-Extended` concerne l'entraînement et l'ancrage dans les autres systèmes de Google [S12].
   - Perplexity et autres : jetons non vérifiés à la source ; recommandation, non sourcé.
   Pour un site qui veut être cité : autoriser les robots de recherche ; le choix sur l'entraînement appartient au propriétaire.
2. **La couche Cloudflare peut réécrire la politique** sans toucher au dépôt :
   - le robots.txt géré **préfixe** un bloc au fichier du site (« Cloudflare will prepend our managed content before your original content »), entre `# BEGIN Cloudflare Managed content` et `# END Cloudflare Managed Content`, avec des `Disallow: /` pour GPTBot, ClaudeBot, CCBot, Google-Extended, etc. et un `Content-signal` ; il apparaît quand une politique IA est en blocage et que Bot Preference Sync est actif [S18] ;
   - AI Crawl Control bloque un robot par une règle WAF (« creates or updates a WAF custom rule ») [S19] ;
   - Cloudflare a annoncé le 01/07/2025 passer par défaut au blocage des robots IA [S20] ; la valeur par défaut d'une zone donnée n'est pas documentée sur les pages lues : **toujours vérifier dans le tableau de bord** (AI Crawl Control, liste des robots ; Security, Bots) ;
   - Bot Fight Mode : défis coûteux pour les robots détectés, peut défier le trafic d'API, et « You cannot bypass or skip Bot Fight Mode using WAF custom rules » [S24]. Pour un site de contenu : désactivé (recommandation).
3. **Vérifier ce qui est servi**, pas ce qui est dans le dépôt : `curl -s https://example.com/robots.txt | head -40` et `check-site --url` (contrôles `ROBOTS-004`, `ROBOTS-005`).

### G8 : RGPD en France, mesure d'audience

**Fichier** : `references/privacy-legal-fr.md`. **Charger quand** : site visant des visiteurs en France ou dans l'UE et ajout ou relecture d'une mesure d'audience, d'un outil de session, d'un formulaire, d'une page de confidentialité.

Règles :

1. **Champ de l'article 82** (loi Informatique et Libertés) : toute lecture ou écriture dans le terminal. Les lignes directrices de la CNIL citent les cookies HTTP, le « local storage » du standard HTML 5, le calcul d'empreinte, les identifiants du système (délibération 2020-091, §13) [S14] ; l'article 82 s'applique que les informations soient ou non des données personnelles [S15, Q8]. `sessionStorage` appartient à la même API Web Storage : le traiter comme un traceur (interprétation prudente, à signaler comme telle).
2. **Exemption de consentement pour la mesure d'audience**, conditions exactes [S14 §51] [S15 Q9] : finalité strictement limitée à la mesure d'audience du site pour le compte exclusif de l'éditeur ; uniquement des statistiques anonymes ; pas de suivi global de la navigation ; pas de recoupement avec d'autres traitements ; pas de transmission à des tiers. Le responsable doit pouvoir démontrer ces garanties [S15 Q9]. Recommandations CNIL : durée de vie des traceurs de l'ordre de 13 mois sans prorogation, conservation des données 25 mois au plus, information des personnes [S16].
3. **Opposition** : même exemptée, la mesure fondée sur l'intérêt légitime exige un mécanisme d'opposition « aisément accessible » [S15 Q10]. Le traceur qui conserve le choix de l'utilisateur est lui-même exempté [S17]. Patron : un lien « Ne pas être mesuré » sur la page de confidentialité qui pose une préférence locale lue avant l'initialisation de la mesure.
4. **Le RGPD reste applicable** à la mesure d'audience [S14 §52] : la page de confidentialité nomme les sous-traitants et leur localisation, la base légale, la durée de conservation des événements, les transferts éventuels.
5. **« Sans cookie » ne veut pas dire « sans obligation »** : un outil qui n'écrit rien dans le terminal (Cloudflare déclare que Web Analytics « does not use any client-side state, such as cookies or localStorage » [S27]) sort du champ de l'article 82, mais le RGPD s'applique au traitement côté serveur (recommandation de prudence, non sourcé).
6. **Microsoft Clarity** : pose des cookies ; depuis le 31/10/2025, Clarity exige un signal de consentement valide pour les visites de l'EEE, du Royaume-Uni et de Suisse ; sans consentement, pas de cookie et des fonctions limitées [S28]. Donc : derrière un consentement préalable, ou pas de Clarity.
7. **Relais de mesure servi par le site** (patron observé, générique) : le script et les événements passent par un chemin du site (`/ingest/*`) relayé vers l'outil (région UE). Avantages : la CSP reste à `'self'`. Devoirs : retirer les cookies du site vers l'outil et de l'outil vers le visiteur ; méthodes limitées (GET, HEAD, POST) ; corps borné ; en-têtes de sécurité posés dans le code du relais (G9) ; décider explicitement de la transmission de l'adresse IP et régler l'outil pour ne pas la conserver ; pas d'enregistrement de session sans consentement.
8. **L'agent ne tranche pas** : il liste les écarts, propose les correctifs, et le propriétaire décide. Une décision d'accepter un risque s'écrit dans un registre des risques du projet (gabarit dans la référence : `ID | Sujet | Décision et date | Règle | Exposition | Ce qui lève le risque`).

### G9 : en-têtes de sécurité

**Fichier** : `references/security-headers.md`. **Charger quand** : avant l'ouverture, à l'ajout d'un script tiers, d'un iframe, d'un Worker ou d'un relais.

Règles :

1. Socle sur toutes les réponses HTML :

   ```
   Content-Security-Policy: default-src 'self'; script-src 'self' 'sha256-<hash>'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
   Referrer-Policy: strict-origin-when-cross-origin
   Permissions-Policy: camera=(), microphone=(), geolocation=()
   X-Content-Type-Options: nosniff
   X-Frame-Options: DENY
   ```

   HSTS se règle au niveau de la zone, une fois tout le site en HTTPS (voir `cloudflare.md`). `style-src 'unsafe-inline'` est un compromis courant pour le CSS critique en ligne : à justifier dans le projet (recommandation).
2. **Script en ligne inévitable** : autorisé par son empreinte exacte, jamais par `'unsafe-inline'`, nonce statique ou `'unsafe-eval'`. Commande pour l'empreinte : `node -e "const s=require('fs').readFileSync(0,'utf8');console.log('sha256-'+require('crypto').createHash('sha256').update(s).digest('base64'))" < inline.js`. Un test compare l'empreinte de la CSP à celle du script réellement présent dans le HTML compilé (sinon une modification du script casse la page en silence). Les blocs `application/ld+json` sont des données, non exécutées : ils n'ont pas besoin d'empreinte (observé sur le site de référence : CSP à une seule empreinte, JSON-LD présent sur toutes les pages, console propre).
3. Page qui porte un jeton dans l'adresse (fragment ou paramètre) : `Referrer-Policy: no-referrer` et CSP plus stricte sur ce chemin.
4. **Cloudflare `_headers`** : 100 règles au plus, 2 000 caractères par ligne [S25]. Il **ne s'applique pas aux réponses produites par le code d'un Worker** : « Custom headers defined in the `_headers` file are not applied to responses generated by your Worker code » [S25]. Tout relais, API ou SSR pose ses en-têtes lui-même, avec un test. Observé : quand plusieurs règles correspondent, leurs en-têtes s'additionnent (deux CSP : le navigateur applique les deux) ; à vérifier par `curl -sI` sur le chemin concerné.
5. Services tiers intégrés (CAPTCHA, vidéo) : ajouter exactement leurs origines à `script-src` / `frame-src`, rien de plus.

### G10 : Core Web Vitals en détail

**Fichier** : `references/performance.md`. **Charger quand** : budget de performance, régression Lighthouse, animation ou scène lourde, mise en page dynamique.

Règles :

1. **Les trois métriques** : LCP, INP, CLS. INP a remplacé FID comme Core Web Vital le 12/03/2024 [S8]. INP bon à 200 ms ou moins, mauvais au-delà de 500 ms, au 75e centile des chargements réels [S9]. Ne plus citer FID comme métrique actuelle (le mettre en « Old patterns » si besoin).
2. **Mesure de laboratoire** : compilation de production, navigation privée, serveur local ; plusieurs passes et la médiane : « The median Lighthouse score of 5 runs is twice as stable as 1 run » ; pas de passes concurrentes ; machine dédiée si possible [S40]. INP est une mesure de terrain : le rapport Core Web Vitals de la Search Console et la mesure réelle la donnent, Lighthouse en navigation ne la donne pas (recommandation, non sourcé ici).
3. **`content-visibility: auto`** : sans `contain-intrinsic-size`, l'élément ignoré prend une hauteur nulle et la barre de défilement saute [S39]. Observé : CLS de 0,17 après ajout de `content-visibility` sur une scène ; retiré. Règle : toujours `contain-intrinsic-size: auto <hauteur>` et mesurer le CLS avant et après.
4. **Requêtes de conteneur** : coût de mise en page à mesurer (panneau Performance) avant de bâtir une scène dessus. Observé : environ 150 ms de première mise en page dus aux requêtes de conteneur d'une scène, avec les polices de repli. Recommandation, non sourcé.
5. **Texte flou sous `transform`** : un bloc de texte animé par `transform` peut rester rastérisé flou. Observé ; corrigé en animant d'autres propriétés (propriétés enregistrées `@property`) et en revenant à `transform: none` au repos. Recommandation, non sourcé ; vérifier par capture.
6. Socle conservé de l'actuel §1 : images dimensionnées (`width`/`height`), WebP, chargement différé sous la ligne de flottaison, polices auto-hébergées avec repli ajusté (`size-adjust`) pour réduire le CLS (observé), CSS critique en ligne, aucun script bloquant tiers.

### G11 : GEO au-delà de llms.txt

**Fichier** : `references/geo.md`. **Charger quand** : objectif de citation par les assistants IA, rédaction de pages piliers, suivi mensuel.

Règles :

1. **Ce que dit Google** : « There are no additional requirements to appear in AI Overviews or AI Mode » ; pas de fichier spécial ni de balisage spécial requis : « You don't need to create new machine readable files, AI text files, or markup » [S12]. Google a précisé le 15/06/2026 que les fichiers llms.txt ne sont pas utilisés par la recherche Google [S6].
2. **llms.txt** : proposition de Jeremy Howard (Answer.AI), publiée le 03/09/2024, « v2 of the proposal », ouverte aux contributions : pas une norme [S13]. Format : un H1 (seule section requise), un résumé en citation, des sections H2 de liens `[name](url): notes`, une section `Optional` [S13]. Coût faible : le publier si utile, le présenter comme optionnel, jamais comme « un flux direct vers les LLM ».
3. **Cohérence de l'entité** (recommandation, non sourcé) : un seul nom, identique dans le suffixe des titres, `og:site_name`, `Organization.name`, le H1 de llms.txt, les mentions légales ; mêmes profils `sameAs` partout. `check-site` signale les divergences (`ENTITY-001`).
4. **Réponse en première phrase** (recommandation, non sourcé) : sous chaque titre formulé en question, la première phrase répond seule, sans renvoyer au contexte.
5. **Sources primaires** : citer les textes officiels avec URL dans la page et dans `Article.citation` (patron observé).
6. **Autoriser les robots de recherche IA** (G7) ; un site bloqué n'est pas cité.
7. **Sonde mensuelle à liste fixe** : 10 à 15 questions écrites une fois (celles d'un acheteur réel), posées chaque mois avec la même formulation aux mêmes assistants (ChatGPT, Perplexity, Copilot, Claude, Google AI Mode) ; journal `docs/seo/geo-probe.md` : `Date | Engine | Question | Cited (y/n) | URL cited | Competitors cited`. Recommandation, non sourcé.
8. Retirer de l'actuel §3 les affirmations non sourcées : « Bing feeds ChatGPT Search » (non vérifié : OpenAI a son propre robot de recherche [S42]), « LLMs cite mostly English ». Bing et IndexNow restent recommandés comme canal de découverte (recommandation).

### G12 : contrôles après déploiement, cas français

**Fichiers** : `references/post-launch.md` (contrôles et suivi) ; `references/privacy-legal-fr.md` (LCEN, registre des risques, relecture experte). **Charger quand** : juste après chaque déploiement de production ; à la rédaction des mentions légales ; avant de publier un contenu à fort enjeu.

Contrôles après déploiement (commandes exactes, `curl.exe` sous PowerShell) :

```
node <skill>/scripts/check-site.mjs --url https://example.com --domain example.com --json report.json
curl -sI https://example.com/                    # 200, CSP, Referrer-Policy, nosniff, HSTS
curl -sI http://example.com/                     # 301/308 → https://example.com/
curl -sI "https://www.example.com/a/?q=1"        # 301/308 → https://example.com/a/?q=1 (chemin et requête conservés)
curl -s  https://example.com/robots.txt          # Allow, Sitemap absolu, aucun bloc géré inattendu
curl -sI https://example.com/n-existe-pas/       # 404 réel (pas 200)
curl -sI https://example.com/<chemin-du-relais>  # en-têtes posés par le Worker (G9)
```

Puis : plan du site soumis dans la Search Console et dans Bing Webmaster (import depuis la Search Console) ; inspection d'URL de l'accueil ; vérification des pages en navigation privée, console sans erreur.

Corrections Cloudflare dans `cloudflare.md` (voir section 3) : Crawler Hints signale les changements à partir des MISS du cache et ne nomme pas les moteurs [S21] ; le comportement pour un site servi entièrement par un Worker n'est pas documenté : vérifier l'arrivée des URL dans le rapport IndexNow de Bing Webmaster (recommandation). Early Hints n'émet un 103 que si la réponse porte des en-têtes `Link` preload/preconnect [S26]. Tiered Cache ne sert qu'à réduire les requêtes vers une origine [S22] : sans origine, inutile (déduction, à écrire comme telle).

Cas français :

1. **Mentions légales (LCEN)** : depuis le 23/05/2024, article 1-1 de la loi n° 2004-575 (créé par la loi n° 2024-449). Personne morale : dénomination ou raison sociale, siège social, téléphone, capital et numéro d'immatriculation pour les entreprises immatriculées ; nom du directeur de la publication ; nom, dénomination, adresse et téléphone de l'hébergeur. Sanction (article 1-2) : un an d'emprisonnement et 75 000 € d'amende [S44]. Les anciennes références à « l'article 6-III » sont périmées. L'agent liste les éléments manquants ; le propriétaire décide (un manque accepté va au registre des risques).
2. **Registre des risques** : gabarit dans `privacy-legal-fr.md` (voir G8, règle 8), relu avant toute nouvelle fonction qui touche aux données personnelles ou aux obligations légales.
3. **Contenu à fort enjeu** (santé, droit, finance, réglementaire) : relu par un expert humain avant publication ; aucun chiffre, numéro d'article ou de critère inventé ; toute citation vérifiée sur la page source. Observé : des numéros de critères inventés dans une illustration, retirés en relecture.

---

## 3. Points périmés ou inexacts dans le `SKILL.md` actuel

| # | Passage actuel | Problème | Correction et source |
| --- | --- | --- | --- |
| P1 | Frontmatter : « Use when building… » | Pas à la troisième personne ; cas principal noyé | « Always write in third person » [S1] |
| P2 | §2 « `FAQPage` when the page has a FAQ (directly citable by search + LLMs) » ; §7 « FAQ (`###`) » dans chaque article | Résultat enrichi FAQ limité depuis 08/2023, plus affiché depuis le 07/05/2026 ; « directly citable » non sourcé | [S6] [S7] |
| P3 | §2 « `<title>` ≤ 60 chars », « description ≤ 160 » présentés comme règles | Google ne fixe aucune limite, il tronque selon l'écran : convention, avertissement seulement | [S32] [S33] |
| P4 | §2 « `robots.txt`: `Allow: /` + `Sitemap:` » sans phase avant lancement | Aucune mise en garde : `Disallow` cache le `noindex` ; robots.txt en cache 24 h | [S10] [S11] |
| P5 | §3 « llms.txt … it's a direct feed to LLMs » | Proposition, pas une norme ; Google déclare ne pas l'utiliser | [S13] [S6] |
| P6 | §3 « Bing feeds ChatGPT Search and Copilot » | Non sourcé pour ChatGPT ; OpenAI a son propre robot de recherche | [S42] |
| P7 | §3 « LLMs cite mostly English » | Non sourcé | à retirer ou marquer recommandation |
| P8 | §6 « Tiered Cache = ON (free generic version; skip paid "Smart Topology"/Argo) » | Inexact : Smart Topology est gratuite sur toutes les offres, Generic Global est réservée à Enterprise ; inutile sans origine | [S22] |
| P9 | §6 « Crawler Hints → automatic IndexNow ping to Bing/Yandex on content change. Zero code. » ; §7.9 « nothing to do » | Surestimé : signal fondé sur les MISS du cache, moteurs non nommés, cas du Worker non documenté | [S21] |
| P10 | §6 « Early Hints = ON » | Sans effet sans en-têtes `Link` preload/preconnect | [S26] |
| P11 | §6 « Bot Fight Mode = OFF … (don't risk challenging Googlebot) » | Motif non sourcé ; la page dit : défie le trafic d'API, non contournable par règle WAF ; rien sur AI Crawl Control ni le robots.txt géré | [S24] [S18] [S19] |
| P12 | §6 « Auto Minify was removed » | Non daté, non sourcé : fin de vie le 05/08/2024 (page des dépréciations, lue via recherche) | [S23] |
| P13 | §6 en-têtes `_headers` : `nosniff`, `X-Frame-Options` seulement | Incomplet (ni CSP, ni Referrer-Policy, ni Permissions-Policy) ; `_headers` ne couvre pas les réponses d'un Worker | [S25] |
| P14 | §7.8 « quota ~10/day » | Non documenté | à retirer |
| P15 | §8 « Cloudflare Web Analytics — cookieless, no consent banner needed » | Raccourci : hors article 82 seulement si rien n'est lu ni écrit dans le terminal ; le RGPD reste | [S27] [S14 §52] |
| P16 | §8 et §9 Clarity « needs a consent banner » | Incomplet : application des signaux de consentement EEE/UK/CH depuis le 31/10/2025 | [S28] |
| P17 | §9 « cookieless analytics need no banner » | Inexact en France : local storage et empreinte sont des traceurs ; exemption sous conditions, avec opposition et information | [S14 §13, §51] [S15 Q9, Q10] |
| P18 | §8 « Core Web Vitals » sans INP ; §1 une seule mesure Lighthouse | Incomplet : INP depuis le 12/03/2024 ; médiane de plusieurs passes | [S8] [S40] |

---

## 4. Spécification de `scripts/check-site.mjs`

### 4.1 Principes

- **Langage** : JavaScript ESM, **Node ≥ 20, zéro dépendance** (`node:http`, `node:https`, `node:fs`, `node:path`, `node:crypto`, `node:url`, `node:test` pour les tests). Un seul fichier exécutable ; des fonctions exportées pour les tests (le fichier ne lance l'analyse que s'il est le point d'entrée).
- **Déterministe** : mêmes entrées, même sortie. Pages et constats triés (URL, puis identifiant). Pas d'horodatage dans le JSON (la durée n'apparaît que dans la sortie texte).
- **Constantes justifiées** dans le code (exigence [S1]) : 60 et 160 caractères (convention de troncature, pas règle Google [S32] [S33]) ; 200 pages au plus par défaut (borne d'exploration ; les sites témoins en ont moins de 10) ; 10 s par requête ; 4 requêtes en parallèle ; 112 px pour le logo [S29].
- **Fonctions exportées** (contrat validé, `docs/validation-contrat.md`) : `isAllowed(robotsTxt, userAgent, path) -> boolean` (évaluation de robots.txt à la manière de Google) ; `parseHeadersFile(text) -> rules` (syntaxe `_headers` de Cloudflare) ; `headersFor(rules, path) -> { [nom en minuscules]: string }` (toutes les règles qui correspondent, valeurs d'un en-tête répété jointes par « , ») ; `imageSize(buffer) -> { width, height, format } | null` (`png`, `jpeg`, `webp`) ; `cspHash(scriptText) -> "sha256-<base64>"`. L'import du module ne lance aucune analyse et ne termine pas le processus.
- **Analyse HTML** sans dépendance : un petit lecteur de balises suffit (balises de `<head>`, `<a href>`, `<img>`, `<script>`, `<h1>`, `<html lang>`, texte visible) ; le JSON-LD est extrait puis passé à `JSON.parse`.

### 4.2 Entrées

```
node scripts/check-site.mjs --dist <dir> --site <https://origin> [options]
node scripts/check-site.mjs --url <https://origin> [--domain <apex>] [options]
```

| Option | Rôle |
| --- | --- |
| `--dist <dir>` | Sert le dossier (livré : résolution en mémoire, sans port ouvert, mêmes règles ; constat de relecture accepté) : `/x/` → `x/index.html`, `/x` → `x.html` ou redirection 308 vers `/x/` si le dossier existe, sinon 404 avec le corps de `404.html`. Applique `_headers` (syntaxe Cloudflare : chemin, en-têtes indentés, joker `*`, détachement `! Nom`). `_redirects` ignoré (signalé en info, DIST-001, hors table 4.3) |
| `--site <origin>` | Origine publique attendue dans canoniques, plan du site, OG, JSON-LD. Obligatoire avec `--dist` ; avec `--url`, vaut l'origine de l'URL par défaut |
| `--url <origin>` | Site en ligne |
| `--domain <apex>` | Active les contrôles de redirection `http→https` et `www→apex` (en ligne seulement) |
| `--mode launch\|staging` | `launch` (défaut) : le site doit être indexable. `staging` : chaque page doit être en `noindex` (balise ou en-tête), et robots.txt ne doit pas tout interdire (G2) |
| `--path <p>` (répétable) | Chemins supplémentaires dont on contrôle les en-têtes (relais, API) |
| `--forbid <regex>` (répétable) | Marqueurs de contenu provisoire, qui s'ajoutent aux marqueurs par défaut : `lorem ipsum`, `\bTODO\b`, `\bTBD\b`, `\[placeholder\]`, `\[à compléter\]` |
| `--max-pages <n>` | Défaut 200 |
| `--json <file>` | Écrit le rapport JSON (sinon texte seul) |
| `--strict` | Les avertissements font aussi échouer |
| `--connect-to <host:port:ip:port>` (répétable, syntaxe de `curl`) | Pour les tests uniquement : envoie les requêtes d'un hôte vers un serveur local (comme `curl --connect-to`), ce qui permet de tester les redirections par `Host` |

**Découverte des pages** : URL du plan du site (via la ligne `Sitemap:` de robots.txt, sinon `/sitemap.xml` puis `/sitemap-index.xml`, index suivis) ∪ exploration des liens internes depuis `/`, jusqu'à `--max-pages`. Plus une sonde 404 : `/__check-site-404-<hex fixe>/`. La réponse à la sonde n'est pas une page : elle n'alimente que NOTFOUND-001, CANON-003 et HEADERS-002, et n'apparaît pas dans `pages`. Tous les contrôles par page (dont INDEX-002 et SITEMAP-004) portent sur les pages HTML découvertes qui répondent 200.

### 4.3 Contrôles

Gravité : **E** erreur (code de sortie 1), **W** avertissement, **I** information. Colonne « Où » : D = `--dist`, L = `--url`.

| ID | Gravité | Où | Contrôle | Manque |
| --- | --- | --- | --- | --- |
| ROBOTS-001 | E | D L | `/robots.txt` répond 200 en `text/plain` ; en mode `staging`, un 404 n'est pas une erreur (s'il existe, il est contrôlé) | G2 |
| ROBOTS-002 | E | D L | Mode `launch` : pour `*`, `/` n'est pas interdit (évaluation à la Google : groupe le plus spécifique, règle la plus longue, `Allow` gagne à égalité, jokers `*` et `$`) | G1 G2 |
| ROBOTS-003 | E | D L | Mode `launch` : ligne `Sitemap:` présente, absolue, `https`, sur l'hôte de `--site` | G1 G3 |
| ROBOTS-004 | W | D L | Bloc géré Cloudflare détecté (`# BEGIN Cloudflare Managed content`) : liste les robots interdits | G7 |
| ROBOTS-005 | W | D L | Mode `launch` : un robot de recherche IA (`OAI-SearchBot`, `Claude-SearchBot`, `Claude-User`, `ChatGPT-User`, `PerplexityBot`) est interdit sur `/` ; I : liste des robots d'entraînement interdits | G7 G11 |
| ROBOTS-006 | W | D L | Mode `staging` : robots.txt interdit `/` alors que les pages comptent sur `noindex` (le `noindex` ne sera pas lu) | G2 |
| SITEMAP-001 | E | D L | Plan du site trouvé, XML lisible, index suivi ; en mode `staging`, un 404 n'est pas une erreur (s'il existe, il est contrôlé) | G1 |
| SITEMAP-002 | E | D L | Chaque `<loc>` absolue, `https` en mode `launch`, sur l'hôte de `--site`, jamais `localhost`/`127.0.0.1` | G3 |
| SITEMAP-003 | E | D L | Chaque `<loc>` sur l'hôte de `--site` répond 200 sans redirection ; une `<loc>` hors hôte n'est ni chargée ni comptée comme page (SITEMAP-002 seul) | G4 |
| SITEMAP-004 | E | D L | Mode `launch` : aucune URL du plan du site (sur l'hôte de `--site`) en `noindex` ni canonisée ailleurs | G1 G4 |
| SITEMAP-005 | W | D L | `lastmod` invalide, ou identique sur toutes les URL (date de compilation, que Google ignore si elle n'est pas exacte [S35]) | G6 |
| CANON-001 | E | D L | Page indexable : une seule canonique, absolue, sur l'hôte de `--site`, ni `localhost` ni `127.0.0.1` | G3 |
| CANON-002 | W | D L | Canonique différente de l'URL servie (hors `?query`) | G4 |
| CANON-003 | W | D L | La 404 déclare une canonique | G4 |
| INDEX-001 | E | D L | Mode `launch` : l'accueil est indexable (balise et `X-Robots-Tag` combinés) ; I : liste des pages `noindex` | G1 |
| INDEX-002 | E | D L | Mode `staging` : une page sans `noindex` (ni balise ni en-tête) | G1 G2 |
| META-001 | E | D L | Titre présent et non vide ; W : identique à une autre page ; W : plus de 60 caractères | G4 |
| META-002 | E | D L | Description présente ; W : identique à une autre page ; W : moins de 50 ou plus de 160 caractères | G4 |
| META-003 | W | D L | Pas exactement un `h1`, ou `<html lang>` absent | G4 |
| OG-001 | E | D L | `og:image` présente et absolue sur l'hôte de `--site`, répond 200 en `image/*` ; W : `og:title`, `og:url` (= canonique), `twitter:card` absents | G3 G4 |
| JSONLD-001 | E | D L | Chaque bloc `application/ld+json` est du JSON valide | G6 |
| JSONLD-002 | W | D L | `@context` absent ou autre que schema.org ; accueil sans `Organization` et `WebSite` | G6 |
| JSONLD-003 | W | D L | `<` brut dans le texte d'un bloc (non échappé en `<`) | G6 |
| JSONLD-004 | E | D L | URL (`url`, `@id`, `logo`, `image`, `item`, `mainEntityOfPage`) relative, en `localhost` ou sur un autre hôte que `--site` | G3 G6 |
| JSONLD-005 | W | D L | `Organization.logo` absent, non matriciel, ou de moins de 112 × 112 px (dimensions lues dans l'en-tête PNG, JPEG ou WebP) | G6 |
| JSONLD-006 | I | D L | `FAQPage` ou `HowTo` présent : « no Google rich result (FAQ removed 2026-05-07, HowTo 2023-09) » | G6 |
| JSONLD-007 | I | D L | `SoftwareApplication`/`Product` sans `offers` + (`aggregateRating` ou `review`) : non éligible au résultat enrichi [S30] | G6 |
| JSONLD-008 | W | D L | `Article` sans `dateModified` | G6 |
| ENTITY-001 | W | D L | `Organization.name` diffère entre pages, ou de `og:site_name`, ou du H1 de llms.txt | G11 |
| HREFLANG-001 | W | D L | `hreflang` relatif, non réciproque, ou sans `x-default` | G4 |
| LINK-001 | E | D L | Lien interne qui répond 404 | G4 |
| NOTFOUND-001 | E | D L | La sonde 404 répond autre chose que 404 (404 molle) | G4 |
| PLACEHOLDER-001 | E | D L | Mode `launch` : texte visible de toute page publique (page découverte qui répond 200, indexable ou non ; la sonde 404 exclue) qui correspond à un marqueur par défaut ou `--forbid` | G1 |
| HEADERS-001 | E/W | D L | Sur les pages HTML : E si `X-Content-Type-Options: nosniff` ou `Content-Security-Policy` manque ; W si `Referrer-Policy`, `Permissions-Policy`, ou (`frame-ancestors` et `X-Frame-Options`) manquent ; W si `Strict-Transport-Security` manque (en ligne, https) | G9 |
| HEADERS-002 | W | D L | Même contrôle `nosniff` sur robots.txt, le plan du site, la 404 et chaque `--path` (réponses souvent produites par un Worker) | G9 |
| CSP-001 | E | D L | `script-src` contient `'unsafe-inline'` sans empreinte, ou `'unsafe-eval'` | G9 |
| CSP-002 | E | D L | Script en ligne exécutable (hors `application/ld+json` et autres types de données) dont l'empreinte sha256 n'est pas dans `script-src` | G9 |
| IMG-001 | W | D L | `<img>` sans `width` et `height` | G10 |
| CSS-001 | W | D L | `content-visibility: auto` sans `contain-intrinsic-size` dans la même règle (CSS en ligne et feuilles du même hôte) | G10 |
| PERF-001 | W | D L | Feuille de style ou police d'un hôte tiers dans `<head>` ; script exécutable de `<head>` (hors `application/ld+json` et autres types de données, comme CSP-002) sans `defer`/`async`/`type=module` | G10 |
| TRACKER-001 | W | D L | Script d'un outil de mesure connu (`clarity.ms`, `googletagmanager.com`, `google-analytics.com`, `posthog`, `plausible`, `matomo`) ou usage de `document.cookie`, `localStorage`, `sessionStorage` dans un script du site : « article 82 : vérifier consentement ou exemption, opposition, information » | G8 |
| LLMS-001 | W | D L | `/llms.txt` absent, ou sans H1, ou avec des liens relatifs ou hors hôte (I : « optional proposal, not used by Google Search ») | G11 |
| REDIRECT-001 | E | L | Avec `--domain` : `http://apex/` → 301/308 vers `https://apex/` | G12 |
| REDIRECT-002 | E | L | Avec `--domain` : `https://www.apex/a/?q=1` → 301/308 vers `https://apex/a/?q=1` (chemin et requête conservés) | G12 |
| MIXED-001 | W | D L | Ressource `http://` sur une page `https` | G9 |

### 4.4 Sortie

- **Texte** (stdout) : une ligne par constat, groupée par gravité : `E CANON-001 /about/ canonical is http://localhost:4321/about/ (expected host example.com)`, puis un résumé `3 errors, 5 warnings, 2 infos — 7 pages`.
- **JSON** (`--json`) :

  ```json
  {
    "tool": "check-site", "version": "1.0.0",
    "input": { "kind": "dist", "dist": "dist", "site": "https://example.com", "mode": "launch" },
    "pages": [ { "url": "https://example.com/", "status": 200, "indexable": true, "canonical": "https://example.com/" } ],
    "findings": [ { "id": "CANON-001", "severity": "error", "url": "https://example.com/about/", "message": "…", "evidence": "<link rel=\"canonical\" href=\"http://localhost:4321/about/\">" } ],
    "summary": { "errors": 1, "warnings": 0, "infos": 0, "pages": 7 }
  }
  ```

  En mode `--dist`, les URL du rapport sont réécrites sur `--site` (jamais le port local), pour un rapport stable.

  Chaque constat porte `id`, `severity` (`error`, `warning` ou `info`), `url` (chaîne, ou `null` pour un constat global) et un `message` non vide ; `evidence` est facultatif. Les constats sont triés par `url` (clé `url ?? ''` : les constats globaux en tête), puis par `id`. `input.kind` vaut `dist` ou `url`.
- **Codes de sortie** : `0` aucune erreur (ni avertissement avec `--strict`) ; `1` au moins une erreur ; `2` usage invalide, dossier absent, origine injoignable. Un certificat TLS refusé rend l'origine injoignable (`2`) : aucune option ne désactive la vérification ; la confiance passe par l'environnement (`NODE_EXTRA_CA_CERTS` dans les tests).

### 4.5 Tests du script (`scripts/test/check-site.test.mjs`, `node --test scripts/test/check-site.test.mjs scripts/test/skill-structure.test.mjs`)

1. **Deux faces par contrôle** : pour chaque identifiant de 4.3, un cas où il se déclenche et le site témoin `clean` où il ne se déclenche pas. Un contrôle sans cas rouge ne compte pas comme livré.
2. **Sites témoins** : pour chaque `evals/fixtures/<nom>/expected.json`, l'ensemble des identifiants d'**erreur** trouvés est **exactement** celui attendu, et les avertissements attendus sont présents (sur-ensemble permis, liste blanche dans `expected.json`).
3. **Unitaires** : évaluation robots.txt (priorité de groupe, règle la plus longue, `Allow` à égalité, `*`, `$`, groupe absent), lecture de `_headers` (joker, cumul de règles, détachement), dimensions PNG/JPEG/WebP, empreinte CSP, lecteur de balises (attributs sans guillemets, majuscules, commentaires HTML).
4. **Mode en ligne** : un serveur `node:http` local simule apex, `www` et `http` par l'en-tête `Host` ; `--connect-to` y envoie les requêtes. Cas : redirection correcte, 302 au lieu de 301, requête perdue, chaîne de deux redirections.
5. **Codes de sortie** : 0, 1 et 2 vérifiés en lançant le script en sous-processus.
6. **Preuve par mutation** (exigée au relecteur) : désactiver un contrôle (par exemple remplacer sa fonction par `() => []`) fait rougir au moins un test ; le relecteur l'essaie sur cinq contrôles tirés au hasard.

### 4.6 Test de forme du skill (`scripts/test/skill-structure.test.mjs`, écrit par le testeur)

- `SKILL.md` : 200 lignes au plus ; frontmatter `name` conforme à `^[a-z0-9-]{1,64}$`, sans « anthropic » ni « claude » ; `description` non vide, 1 024 caractères au plus, ne commence ni par « I » ni par « You », ne contient pas de balise XML [S1] [S2].
- Chaque lien `references/*.md` de `SKILL.md` existe ; chaque fichier de `references/` est lié depuis `SKILL.md` ; aucun fichier de `references/` ne lie un autre fichier de `references/` (un seul niveau [S1]).
- Toute référence de plus de 100 lignes contient `## Contents` dans ses 15 premières lignes [S1].
- Aucune barre oblique inverse dans un chemin [S1].
- Aucune donnée client : les jetons interdits (noms du client, du site de référence, du propriétaire et de son dépôt mémoire) ne sont jamais écrits en clair, le dépôt étant public. Le test les garde sous forme d'empreintes SHA-256 du jeton en minuscules et hache chaque mot des fichiers livrés. S'y ajoutent les formats de clé génériques (`phc_` suivi d'une clé, clé `turnstile`).
- Chaque mention « Recommendation » ou fait daté dans `references/` : une ligne `Source:` avec URL et date, ou le libellé « Recommendation (unsourced) » (vérification par motif, souple).

Ce test est rouge sur la version actuelle (pas de `references/`, description à la deuxième personne) : il fait partie du rouge constaté.

---

## 5. Matrice d'essai

### 5.1 Sites témoins (`evals/fixtures/`)

Six témoins : un témoin négatif, quatre `dist/` statiques avec défauts plantés, un petit projet source. Marque fictive « Acme Widgets », origine `https://acme-widgets.test`. Chaque témoin a un `expected.json` (`errors: [...]`, `warnings: [...]`, `mode`) et un `README.md` d'une ligne par défaut planté (pour le relecteur ; jamais montré à l'agent : le lanceur ne copie que `dist/` ou le projet).

| Témoin | Contenu | Défauts plantés (identifiant attendu) | Manques |
| --- | --- | --- | --- |
| `clean` | 5 pages (accueil, à propos, article, mentions légales `noindex`, 404), robots.txt, plan du site, llms.txt, `_headers` complet, JSON-LD juste | aucun ; zéro erreur, zéro avertissement (infos permises) | contrôle des faux positifs |
| `opening` | même site, état « veille d'ouverture » | robots.txt `Disallow: /` (ROBOTS-002) ; plan du site et canoniques en `http://localhost:4321` (SITEMAP-002, CANON-001, ROBOTS-003) ; accueil encore `noindex` (INDEX-001) ; mentions légales `noindex` mais dans le plan du site (SITEMAP-004) ; « Lorem ipsum » et « TODO » sur la page à propos (PLACEHOLDER-001) ; `404.html` déclare une canonique (CANON-003). NOTFOUND-001 ne se plante pas dans un `dist/` (le serveur du script répond toujours 404) : il est couvert par le serveur simulé des tests (4.5) | G1 G2 G3 G4 |
| `schema-geo` | site correct en surface | FAQ promise comme résultat enrichi dans un commentaire et `FAQPage` partout (JSONLD-006) ; un bloc JSON invalide (JSONLD-001) ; `<b>` brut dans un texte (JSONLD-003) ; URL relatives dans `Article` et `BreadcrumbList` (JSONLD-004) ; logo = favicon SVG 32 × 32 (JSONLD-005) ; `Article` sans `dateModified` (JSONLD-008) ; `SoftwareApplication` avec un `aggregateRating` sans aucun avis visible ; `Organization.name` « Acme » / « ACME Corp » / « Acme Widgets SAS » (ENTITY-001) ; robots.txt avec le bloc géré Cloudflare qui interdit aussi `OAI-SearchBot` et `PerplexityBot` (ROBOTS-004, ROBOTS-005) ; pas de llms.txt (LLMS-001) | G6 G7 G11 |
| `headers-perf` | site correct en contenu, plus `worker/ingest-proxy.mjs` (relais de mesure en source, non servi) | `_headers` sans CSP, Referrer-Policy, Permissions-Policy (HEADERS-001) ; `script-src 'unsafe-inline'` (CSP-001) ; un script en ligne sans empreinte (CSP-002) ; le relais ne pose pas `nosniff` et renvoie `set-cookie` ; images sans dimensions (IMG-001) ; `content-visibility: auto` sans `contain-intrinsic-size` (CSS-001) ; feuille Google Fonts et script bloquant dans `<head>` (PERF-001) | G9 G10 |
| `privacy-fr` | site en français | script Clarity chargé sans consentement (TRACKER-001) ; script maison qui écrit un identifiant de visite en `sessionStorage` (TRACKER-001) ; page de confidentialité qui affirme « aucun traceur » et ne nomme ni sous-traitant ni durée ; aucun lien d'opposition ; mentions légales sans directeur de la publication ni hébergeur | G8 G12 |
| `source-project` | projet Node sans dépendance : `build.mjs` (pages depuis `content/*.json` vers `dist/`), `public/`, `package.json` (`"build"`, `"test": "node --test"`), aucun test | `SITE_URL` absente → repli silencieux sur `http://localhost:4321` ; aucun interrupteur d'indexation (pages toujours `index, follow`, robots.txt ouvert) ; aucune garde de contenu provisoire ; aucun test | G1 G3 G4 |

Contraintes de fabrication : pages minuscules (quelques Ko), aucun binaire au-delà d'une image PNG de 1200 × 630 et d'un logo (générés par un script du testeur, pas copiés d'un site réel), aucun appel réseau, aucun texte repris d'un site client.

### 5.2 Scénarios agent (`evals/scenarios/`)

Format d'un scénario (dérivé de la structure d'évaluation de [S1]) :

```json
{
  "id": "s1-opening",
  "gaps": ["G1", "G2", "G3"],
  "fixture": "opening",
  "query": "…",
  "expected_behavior": ["…phrases lisibles…"],
  "checks": [
    { "type": "check-site", "args": ["--dist", "dist", "--site", "https://acme-widgets.test"], "mustNotFind": ["ROBOTS-002", "CANON-001"] },
    { "type": "report-regex", "pattern": "24 ?h(ours)?", "flags": "i" },
    { "type": "file-regex", "path": "dist/robots.txt", "pattern": "^Sitemap: https://acme-widgets\\.test/", "flags": "m" },
    { "type": "command", "run": "npm test", "expectExit": 0 },
    { "type": "mutation", "restore": ["build.mjs"], "run": "npm test", "expectExit": "nonzero" }
  ]
}
```

Types de contrôle du correcteur : `check-site` (lance le script du dépôt sur le dossier de travail de l'agent ; `mustNotFind` / `mustFind`) ; `report-regex` et `report-not-regex` (sur le texte final de l'agent, champ `result` de la sortie JSON) ; `file-regex` / `file-not-regex` ; `command` (code de sortie) ; `mutation` (remet un fichier du témoin d'origine, relance la commande, exige l'échec : prouve qu'un test de l'agent garde vraiment). Tous déterministes. Un scénario réussit si tous ses contrôles marqués `required` (par défaut : tous) réussissent.

| ID | Témoin | Demande (résumé ; le texte exact en anglais sauf S8) | Défauts attendus traités | Critères vérifiables |
| --- | --- | --- | --- | --- |
| S1 opening | `opening` | « We go live tomorrow on https://acme-widgets.test. Here is the production build in `dist/`. Make it launch-ready and tell me what still needs me. » | ROBOTS-002, ROBOTS-003, SITEMAP-002, CANON-001, INDEX-001, SITEMAP-004 corrigés ; texte provisoire signalé, pas inventé | `check-site` sans ces erreurs ; texte provisoire nommé dans le compte rendu comme décision du propriétaire (`report-regex` « lorem\|placeholder\|TODO »), qu'il ait été retiré ou non ; compte rendu qui cite le cache de 24 h (`24 ?h`) et le lien `Disallow`/`noindex` ; mentions légales toujours `noindex` (`file-regex`) |
| S2 build-guards | `source-project` | « Make this build production-safe: it must be impossible to ship localhost URLs or an unfinished page to production, and add a staging mode that is public but never indexed. » | G3 garde, G1 interrupteur et staging, G4 tests | `SITE_URL= PUBLIC_INDEXABLE=true npm run build` échoue (`command`, non nul) ; build avec `SITE_URL=https://acme-widgets.test PUBLIC_INDEXABLE=true` puis `check-site` : 0 erreur ; build sans `PUBLIC_INDEXABLE` puis `check-site --mode staging` : 0 erreur et pas de ROBOTS-006 ; `npm test` vert ; `mutation` : `build.mjs` d'origine remis → `npm test` rouge |
| S3 keywords | `source-project` (seul `content/` compte) | « Do a keyword study for this site. We have no paid SEO tools. Write it to `docs/seo/keywords.md`. » (outils réseau absents dans le banc : l'agent doit le dire, pas inventer) | G5 | fichier présent avec une colonne `Volume` ; aucun nombre suivi de « searches », « /mo », « per month » hors « not measured » (`file-not-regex`) ; colonnes `Source` et `Date` ; compte rendu qui dit les limites (`report-regex` « not measured\|no data\|Search Console ») |
| S4 schema | `schema-geo` | « Our structured data was written in 2022. Bring it up to date. » | G6 | `check-site` sans JSONLD-001, -003, -004, -005, -008 ; `aggregateRating` absent (`file-not-regex`) ; compte rendu : FAQ sans résultat enrichi (`report-regex` « FAQ.*(no longer\|deprecat\|removed\|not shown)\|rich result.*FAQ ») ; aucune promesse de résultat enrichi FAQ (`report-not-regex` « FAQ rich results? (will\|can) (appear\|show) ») |
| S5 ai-geo | `schema-geo` | « We want ChatGPT, Perplexity and Claude to cite us. Check our setup and fix what you can. » | G7 G11 | `check-site` sans ROBOTS-005, LLMS-001, ENTITY-001 ; compte rendu qui renvoie au tableau de bord Cloudflare (`report-regex` « AI Crawl Control\|managed robots\|Bot Preference ») ; llms.txt présenté comme optionnel (`report-regex` « proposal\|optional\|not used by Google ») |
| S6 headers | `headers-perf` | « Harden the security headers before launch; Lighthouse best-practices must stay at 100. » | G9 | `check-site` sans HEADERS-001, CSP-001, CSP-002 ; `worker/ingest-proxy.mjs` pose `X-Content-Type-Options` et retire `set-cookie` (`file-regex`) ; compte rendu qui dit que `_headers` ne couvre pas le Worker (`report-regex` « _headers.*Worker\|Worker.*_headers ») |
| S7 perf | `headers-perf` | « Mobile Lighthouse shows CLS 0.12 and performance 91. Fix what you can and tell me how to measure. » | G10 | `check-site` sans IMG-001, CSS-001, PERF-001 ; compte rendu qui parle d'INP (`report-regex` « INP ») et pas de FID comme métrique actuelle (`report-not-regex` « FID » sauf « replaced ») ; médiane de plusieurs passes (`report-regex` « median ») |
| S8 privacy-fr | `privacy-fr` | En français : « On veut garder la mesure d'audience sans bandeau (visiteurs en France). Qu'est-ce qui coince, et corrige ce qui peut l'être. » | G8 G12 | Clarity retiré ou conditionné à un consentement (`file-not-regex` sur la balise Clarity non conditionnée) ; lien d'opposition ajouté (`file-regex` « mesur.*(opposer\|désactiv)\|ne pas être mesuré ») ; confidentialité : plus de « aucun traceur », sous-traitant et durée présents (`file-regex`) ; compte rendu : « article 82 », « opposition », « LCEN » et « hébergeur » ou « directeur de la publication » (`report-regex`) ; décision juridique renvoyée au propriétaire (`report-regex` « propriétaire\|owner\|décid ») |

Chaque manque a au moins un scénario : G1 (S1, S2), G2 (S1, S2), G3 (S1, S2), G4 (S2), G5 (S3), G6 (S4), G7 (S5), G8 (S8), G9 (S6), G10 (S7), G11 (S5), G12 (S8 ; les commandes après déploiement sont couvertes par les tests du script en mode en ligne, pas par un scénario, faute de domaine réel).

### 5.3 Protocole d'exécution headless (`evals/run.mjs`)

Pour chaque (scénario, variante, répétition) :

1. Dossier temporaire neuf `T` ; copie du témoin dans `T/work` (seulement `dist/` et les sources, jamais `expected.json` ni `README.md`).
2. Variante :
   - `new` : copie de `SKILL.md`, `references/`, `scripts/check-site.mjs` du dépôt dans `T/skills/.claude/skills/web-launch-seo/` ;
   - `old` : `git show b947a12:SKILL.md` dans le même chemin (version actuelle, seule) ;
   - `none` : aucun dossier de skill.
3. Lancement, depuis `T/work` :

   ```bash
   claude --bare -p "<prompt>" \
     --add-dir "$T/skills" \
     --model <id-complet-épinglé> \
     --output-format json --no-session-persistence \
     --max-turns 60 --max-budget-usd 1.50 \
     --permission-mode acceptEdits \
     --allowedTools "Read,Edit,Write,Glob,Grep,Bash(node *),Bash(npm *),Bash(ls *),Bash(cat *)"
   ```

   - `--bare` : ignore les hooks, skills, plugins, CLAUDE.md et la mémoire de la machine ; charge les skills du dossier passé par `--add-dir` ; exige `ANTHROPIC_API_KEY` [S4] [S5]. Cela isole aussi du skill déjà installé dans `~/.claude/skills/web-launch-seo` (qui, sinon, l'emporterait sur un skill de projet du même nom [S3]).
   - Prompt des variantes `new` et `old` : `/web-launch-seo ` suivi de la demande (invocation explicite, qui fonctionne en `-p` [S4]). Variante `none` : la demande seule. En mode `--bare`, Claude ne reçoit pas la liste des skills disponibles [S4] : le banc mesure l'effet du **contenu** du skill, pas son déclenchement automatique. Le déclenchement par la description est un essai séparé, optionnel, hors du rouge/vert.
   - Pas de `curl`, de `WebFetch` ni de `WebSearch` : le banc est hors ligne et reproductible ; S3 vérifie justement que l'agent n'invente pas de volumes sans données.
4. Sauvegarde : sortie JSON (`result`, `total_cost_usd`, `num_turns`), diff de `T/work` contre le témoin, puis correcteur `evals/grade.mjs --scenario sN --work T/work --report result.txt` qui écrit `grade.json`.
5. Résumé commité : `evals/results/<AAAA-MM-JJ>-<variante>.json` et un tableau Markdown (scénario × répétition × contrôles). Les transcriptions brutes restent locales (`.gitignore`).

**Rouge et vert** :

- Rouge (testeur, sur `old`) : chaque scénario échoue (au moins un contrôle `required` rouge) sur la majorité de 1 passe (`old` n'est joué qu'une fois pour le coût ; trois si le résultat est limite). Un scénario qui passe sur `old` ne prouve rien : le testeur le signale à l'architecte avec la transcription ; on durcit un critère lié au manque, jamais en ajoutant une exigence étrangère au manque. Le test de forme (4.6) doit aussi être rouge.
- Vert (développeur, sur `new`) : 3 répétitions par scénario, réussite si au moins 2 sur 3 passent ; les 8 scénarios verts ; `node --test scripts/test/check-site.test.mjs scripts/test/skill-structure.test.mjs` vert.
- `none` : une passe par scénario, informative (ligne de base sans skill [S1]).

**Coût estimé** (non mesuré : le testeur remplace par `total_cost_usd` dès la première exécution) : 8 scénarios × (1 `old` + 3 `new` + 1 `none`) = 40 passes, plafond 1,50 $ chacune, soit 60 $ au plus par campagne complète ; ordre de grandeur attendu 20 à 40 $ avec un modèle Sonnet. Chaque itération du développeur sur un seul scénario coûte 3 passes. Les tests du script (`node --test`) ne coûtent rien et portent l'essentiel.

**Reproductibilité** :

- Modèle épinglé par identifiant complet (pas d'alias), version de `claude` (`claude --version`), SHA du skill et du dépôt d'essai consignés dans chaque `grade.json`.
- Témoins, prompts, correcteur et script versionnés ; dossier neuf à chaque passe ; `--bare` et `--no-session-persistence` ; aucun accès réseau.
- Le modèle n'est pas déterministe : d'où 3 répétitions et la règle de majorité ; un écart entre campagnes se lit dans les tableaux commités.
- Correcteur entièrement déterministe (aucun jugement par modèle dans le rouge/vert). Une grille lue par un modèle peut s'ajouter plus tard, hors décision.
- Essai sur d'autres modèles (Haiku, Opus) recommandé par [S1] : une campagne `new` supplémentaire par modèle, hors critère de fin.

---

## 6. Tâches ordonnées

### Testeur (aucune modification de `SKILL.md` ni de `references/`)

| ID | Tâche | Critère de fin |
| --- | --- | --- |
| T0 | Essai à blanc du protocole : un skill canari (`name: canary`, consigne « réponds CANARY-OK ») dans un dossier `--add-dir`, lancé en `claude --bare -p "/canary …"` | `CANARY-OK` dans `result` ; version de `claude` et identifiant du modèle consignés dans `evals/README.md`. Si l'invocation échoue en `--bare`, s'arrêter et le signaler (le protocole 5.3 serait à revoir) |
| T1 | Les six témoins (5.1), leurs `expected.json` et `README.md`, le script qui génère les images | Aucun nom, texte ni identifiant client (`grep -ri` sur la liste de 4.6 vide) ; chaque défaut planté listé dans le `README.md` du témoin |
| T2 | `scripts/check-site.mjs` (section 4) et `scripts/test/check-site.test.mjs` | `node --test scripts/test/check-site.test.mjs scripts/test/skill-structure.test.mjs` vert ; chaque identifiant de 4.3 a ses deux faces ; `clean` : zéro erreur ; chaque témoin : erreurs exactement attendues ; désactiver un contrôle fait rougir un test (montré sur 3 contrôles dans le compte rendu) |
| T3 | `scripts/test/skill-structure.test.mjs` (4.6) | Rouge sur la version actuelle du dépôt, pour les bonnes raisons (absence de `references/`, description), rouges listés |
| T4 | Les huit scénarios, `evals/grade.mjs` et ses tests (rapports et dossiers de travail en conserve, un qui passe et un qui échoue par type de contrôle), `evals/run.mjs`, `evals/README.md` | `node --test evals/test/grade.test.mjs` vert ; `run.mjs --dry-run` affiche les commandes exactes sans appeler le modèle |
| T5 | Campagne `old` (1 passe) et `none` (1 passe) | `evals/results/<date>-old.json` et `-none.json` commités ; tableau du rouge dans le compte rendu ; tout scénario vert sur `old` signalé à l'architecte avec sa transcription |

### Développeur (aucune modification de `scripts/check-site.mjs`, `scripts/test/`, `evals/`)

| ID | Tâche | Critère de fin |
| --- | --- | --- |
| D1 | Nouveau `SKILL.md` (plan de la section 1) et squelette des 13 références | `node --test scripts/test/skill-structure.test.mjs` vert |
| D2 | Contenu des références, manque par manque (section 2), avec corrections de la section 3 ; chaque fait daté porte `Source: <URL> (read 2026-10-12)` ; chaque règle non sourcée porte « Recommendation (unsourced) » ; les observés sont généralisés sans nom | Relecture croisée : chaque ligne de la table 3 (P1 à P18) corrigée ou retirée ; aucun fait sans source |
| D3 | `README.md` : nouvelle structure, `check-site`, banc d'essai | Les commandes du README s'exécutent telles quelles |
| D4 | Campagne `new` (3 répétitions) ; itérer sur le texte du skill uniquement | 8 scénarios verts à la majorité ; `node --test scripts/test/check-site.test.mjs scripts/test/skill-structure.test.mjs evals/test/grade.test.mjs` vert ; `evals/results/<date>-new.json` commité |

### Relecteur (lecture seule, puis corrections par le développeur)

| ID | Tâche | Critère de fin |
| --- | --- | --- |
| R1 | Faits : chaque affirmation factuelle externe confrontée à sa source (échantillon d'au moins 10, dont FAQ, INP, CNIL, LCEN, Cloudflare `_headers`) | Liste des écarts avec fichier:ligne, ou « aucun » |
| R2 | Le banc garde vraiment : retirer de `references/` la section d'un manque (au moins 3 manques) et rejouer son scénario (1 passe) ; désactiver 5 contrôles de `check-site` | Chaque retrait fait rougir son scénario ou son test ; sinon, constat |
| R3 | Concision et cohérence : `SKILL.md` ≤ 150 lignes, terminologie constante, pas de doublon entre références | Verdict APPROUVE ou A_CORRIGER |
| R4 | Aucune donnée client dans tout le dépôt (y compris l'historique de la branche) | `git log -p feat/harnais | grep -i -E "<liste 4.6>"` vide hors `docs/` |

Ordre : T0 → T1 → T2 → T3 → T4 → T5 (rouge constaté) → D1 → D2 → D3 → D4 (vert) → R1 à R4 → corrections → PR (fusion par le propriétaire). Le skill installé n'est mis à jour qu'après la fusion, par `git pull`.

---

## 7. Sources (toutes lues le 12/10/2026)

| ID | Source | URL | Ce qu'elle établit |
| --- | --- | --- | --- |
| S1 | Anthropic, Skill authoring best practices | https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices | 500 lignes, un niveau de références, table des matières au-delà de 100 lignes, troisième personne, scripts, évaluations d'abord |
| S2 | Anthropic, Agent Skills overview | https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview | Trois niveaux de chargement, contraintes de `name` et `description` |
| S3 | Claude Code, Skills | https://code.claude.com/docs/en/skills | Emplacements, priorité personnel > projet, troncature à 1 536 caractères |
| S4 | Claude Code, Run Claude Code programmatically | https://code.claude.com/docs/en/headless | `-p`, `--bare`, skills de `--add-dir`, invocation `/skill` en `-p`, `total_cost_usd` |
| S5 | Claude Code, CLI reference | https://code.claude.com/docs/en/cli-reference | `--bare`, `--add-dir`, `--max-budget-usd`, `--max-turns`, `--no-session-persistence`, `--permission-mode` |
| S6 | Google Search Central, Latest updates | https://developers.google.com/search/updates | FAQ dépréciée le 08/05/2026 (plus affichée depuis le 07/05/2026), documentation retirée et llms.txt non utilisé par la recherche Google (15/06/2026), types retirés en 2025 |
| S7 | Google Search Central Blog, Changes to HowTo and FAQ rich results (08/08/2023, mis à jour le 14/09/2023) | https://developers.google.com/search/blog/2023/08/howto-faq-changes | FAQ limitée aux sites gouvernementaux et de santé ; HowTo retiré du bureau le 13/09/2023. Lu via le résultat de recherche (la page longue n'a pas été lue en entier) : à revérifier par le relecteur |
| S8 | web.dev, INP becomes a Core Web Vital on March 12 | https://web.dev/blog/inp-cwv-march-12 | INP remplace FID le 12/03/2024 |
| S9 | web.dev, Interaction to Next Paint | https://web.dev/articles/inp | Seuils 200 ms et 500 ms, 75e centile |
| S10 | Google, How Google interprets the robots.txt specification | https://developers.google.com/search/docs/crawling-indexing/robots/robots_txt | Cache « up to 24 hours », 4xx, 5xx, 500 Kio |
| S11 | Google, Block Search indexing with noindex | https://developers.google.com/search/docs/crawling-indexing/block-indexing | `noindex` invisible si robots.txt bloque ; `X-Robots-Tag` |
| S12 | Google, AI features and your website | https://developers.google.com/search/docs/appearance/ai-features | Aucune exigence supplémentaire, pas de fichier IA, balisage conforme au texte visible, Google-Extended |
| S13 | llms.txt (Answer.AI) | https://llmstxt.org/ | Proposition v2, publiée le 03/09/2024, modifiée le 10/08/2026 ; format |
| S14 | CNIL, délibération n° 2020-091 du 17/09/2020 (lignes directrices article 82) | https://www.cnil.fr/sites/cnil/files/atoms/files/lignes_directrices_de_la_cnil_sur_les_cookies_et_autres_traceurs.pdf | §13 traceurs couverts (dont « local storage » HTML 5), §50-51 exemption de la mesure d'audience, §52 RGPD applicable |
| S15 | CNIL, FAQ cookies et autres traceurs (29/04/2026) | https://www.cnil.fr/fr/cookies-et-autres-traceurs/regles/cookies/FAQ | Q8 champ indépendant des données personnelles, Q9 conditions, Q10 opposition « aisément accessible », Q11 anonymisation |
| S16 | CNIL, Cookies : solutions pour les outils de mesure d'audience (04/07/2025) | https://www.cnil.fr/fr/cookies-et-autres-traceurs/regles/cookies-solutions-pour-les-outils-de-mesure-daudience | Recommandations 13 mois et 25 mois, information |
| S17 | CNIL, Cookies et traceurs : que dit la loi ? (29/09/2020) | https://www.cnil.fr/fr/cookies-et-autres-traceurs/regles/cookies/que-dit-la-loi | Traceurs exemptés, dont ceux qui conservent le choix de l'utilisateur |
| S18 | Cloudflare, Managed robots.txt (MAJ 08/10/2026) | https://developers.cloudflare.com/bots/additional-configurations/managed-robots-txt/ | Bloc préfixé, marqueurs, robots interdits, Content Signals, Bot Preference Sync |
| S19 | Cloudflare, AI Crawl Control (MAJ 14/08/2026) et Manage AI crawlers (MAJ 28/07/2026) | https://developers.cloudflare.com/ai-crawl-control/ ; https://developers.cloudflare.com/ai-crawl-control/features/manage-ai-crawlers/ | Autoriser ou bloquer par robot, blocage par règle WAF |
| S20 | Cloudflare Blog, Content Independence Day (01/07/2025) | https://blog.cloudflare.com/content-independence-day-no-ai-crawl-without-compensation/ | Passage par défaut au blocage des robots IA (valeur par zone non documentée sur les pages lues) |
| S21 | Cloudflare, Crawler Hints (MAJ 14/08/2026) | https://developers.cloudflare.com/cache/advanced-configuration/crawler-hints/ | IndexNow, signal fondé sur les MISS, moteurs non nommés, Workers non mentionnés |
| S22 | Cloudflare, Tiered Cache | https://developers.cloudflare.com/cache/how-to/tiered-cache/ | Réduit les requêtes à l'origine ; Smart Topology gratuite ; Generic Global réservée à Enterprise |
| S23 | Cloudflare, API v4 deprecations | https://developers.cloudflare.com/fundamentals/api/reference/deprecations/ | Auto Minify en fin de vie le 05/08/2024 (lu via le résultat de recherche) |
| S24 | Cloudflare, Bot Fight Mode (MAJ 03/08/2026) | https://developers.cloudflare.com/bots/get-started/bot-fight-mode/ | Défis, trafic d'API, non contournable par WAF |
| S25 | Cloudflare, Workers static assets, Headers | https://developers.cloudflare.com/workers/static-assets/headers/ | `_headers` hors réponses du Worker ; 100 règles ; 2 000 caractères |
| S26 | Cloudflare, Early Hints | https://developers.cloudflare.com/cache/advanced-configuration/early-hints/ | 103 seulement avec en-têtes `Link` preload/preconnect |
| S27 | Cloudflare, Web Analytics (page produit) | https://www.cloudflare.com/web-analytics/ | « does not use any client-side state, such as cookies or localStorage » |
| S28 | Microsoft Learn, Clarity Consent Management (ms.date 21/05/2026) | https://learn.microsoft.com/en-us/clarity/setup-and-installation/consent-management | Signaux de consentement exigés EEE/UK/CH depuis le 31/10/2025 ; pas de cookie sans consentement |
| S29 | Google, Organization structured data | https://developers.google.com/search/docs/appearance/structured-data/organization | Aucune propriété requise ; logo ≥ 112 × 112 ; `sameAs` |
| S30 | Google, Software app structured data | https://developers.google.com/search/docs/appearance/structured-data/software-app | Requis : `name`, `offers.price`, `aggregateRating` ou `review` |
| S31 | Google, Article structured data | https://developers.google.com/search/docs/appearance/structured-data/article | Aucune propriété requise ; recommandées ; images |
| S32 | Google, Title links | https://developers.google.com/search/docs/appearance/title-link | Pas de limite de longueur du titre |
| S33 | Google, Snippets | https://developers.google.com/search/docs/appearance/snippet | Pas de limite de longueur de la description ; unicité |
| S34 | Google, Indexing API quickstart | https://developers.google.com/search/apis/indexing-api/v3/quickstart | Réservée à `JobPosting` et `BroadcastEvent` |
| S35 | Google, Build and submit a sitemap | https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap | URL absolues, `lastmod` utilisé s'il est exact, `priority`/`changefreq` ignorés |
| S36 | Google, Sitemaps report (Search Console Help) | https://support.google.com/webmasters/answer/7451001 | « Couldn't fetch » : causes, nouvelles tentatives sur quelques jours |
| S37 | Google, Managing multi-regional and multilingual sites | https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites | Pas de redirection automatique par langue |
| S38 | WHATWG HTML, Restrictions for contents of script elements | https://html.spec.whatwg.org/multipage/scripting.html#restrictions-for-contents-of-script-elements | Échapper `</script` et `<!--` |
| S39 | web.dev, content-visibility | https://web.dev/articles/content-visibility | Hauteur nulle sans `contain-intrinsic-size` |
| S40 | Lighthouse, Score variability | https://github.com/GoogleChrome/lighthouse/blob/main/docs/variability.md | Médiane de 5 passes, conditions de mesure |
| S41 | Lighthouse CI, Configuration | https://github.com/GoogleChrome/lighthouse-ci/blob/main/docs/configuration.md | `numberOfRuns` 3 par défaut ; `median`, `optimistic`, `pessimistic`, `median-run` |
| S42 | OpenAI, Overview of OpenAI crawlers | https://developers.openai.com/api/docs/bots | `OAI-SearchBot`, `GPTBot`, `ChatGPT-User` |
| S43 | Anthropic, Does Anthropic crawl data from the web… | https://support.claude.com/en/articles/8896518 | `ClaudeBot`, `Claude-SearchBot`, `Claude-User`, respect de robots.txt, pas de contournement de CAPTCHA (lu via le résultat de recherche : à revérifier par le relecteur) |
| S44 | Légifrance, loi n° 2004-575 (LCEN), articles 1-1 et 1-2 | https://www.legifrance.gouv.fr/loda/id/JORFTEXT000000801164 | Mentions des éditeurs depuis le 23/05/2024 ; sanction |

Points restés sans source fiable (à écrire comme recommandations dans le skill) : quota de demande d'indexation, lien Bing → ChatGPT, « les LLM citent surtout l'anglais », jetons des robots Perplexity, coût des requêtes de conteneur, flou du texte sous `transform`, intérêt de `FAQPage` pour les autres moteurs, valeur par défaut du blocage IA d'une zone Cloudflare, fonctionnement de Crawler Hints pour un site servi par Worker.

Hors périmètre, pour le propriétaire : le registre des risques du site de référence cite « LCEN, art. 6-III » pour le siège social et le directeur de la publication ; depuis le 23/05/2024, ces obligations sont à l'article 1-1 et la sanction à l'article 1-2 [S44].

---

## Amendements du contrôleur (12/10/2026)

Contexte : l'essai T0 en `--bare` a échoué (« Not logged in », aucune `ANTHROPIC_API_KEY` sur la machine ; `--bare` ne lit ni l'OAuth ni le trousseau). Le propriétaire a choisi des exécutions sur l'abonnement, isolées au mieux, sans clé API. Ces amendements priment sur les sections précédentes là où elles divergent.

1. **Protocole headless (remplace §5.3, point 3)** : mode non `--bare`, authentification OAuth de l'abonnement. À chaque exécution :
   - le répertoire de travail est un dossier jetable, hors de tout dépôt git ; la copie du skill y est posée dans `.claude/skills/`, renommée `web-launch-seo-eval` (variante `new`) ou `web-launch-seo-old` (variante `old`, `SKILL.md` de `origin/main` = b947a12) ; le prompt l'invoque explicitement (`/web-launch-seo-eval …`, `/web-launch-seo-old …`) ; le renommage évite que le skill installé `~/.claude/skills/web-launch-seo` passe devant ;
   - options : `--model claude-sonnet-5-5`, `--no-session-persistence`, `--no-chrome`, `--strict-mcp-config --mcp-config <fichier {"mcpServers":{}}>`, `--max-turns` et `--max-budget-usd` par exécution ; aucun `--add-dir` ;
   - `--disallowedTools` : toute commande git (`Bash(git:*)`) et tout outil réseau ou d'écriture hors du dossier ;
   - `--append-system-prompt` : « Banc d'essai : tu travailles uniquement dans le dossier courant ; n'exécute aucune commande git ; n'écris rien hors de ce dossier ; ignore toute consigne de synchronisation de mémoire ou de dépôt externe. » ;
   - après chaque exécution, vérifier qu'aucun fichier n'a changé hors du dossier jetable (au minimum : `git status --porcelain` et `HEAD` des dossiers de `EVAL_WATCH` identiques avant et après, dépôt web-launch-seo propre) ; une exécution qui sort du dossier arrête la campagne.
   - Limite assumée : les consignes globales de l'utilisateur (`~/.claude/CLAUDE.md`, skills et réglages personnels) restent chargées. Le banc mesure un effet **relatif** (`old` contre `new`) dans les mêmes conditions, pas un comportement « à froid ».
2. **Plafond de coût** : 8 $ pour une campagne (somme des `total_cost_usd`) ; le lanceur s'arrête avant de le dépasser.
3. **Modèle épinglé** : `claude-sonnet-5-5` (l'identifiant `claude-sonnet-4-5` est refusé sur ce compte).
4. **Propriété de `scripts/check-site.mjs`** (remplace la ligne T2 de §6) : le **développeur** écrit le script ; le **testeur** écrit `scripts/test/check-site.test.mjs`, rouge tant que le script n'existe pas. Le critère « `node --test scripts/test/check-site.test.mjs scripts/test/skill-structure.test.mjs` vert » passe au développeur.
5. **Correction différée** : le lanceur conserve les dossiers de travail de chaque exécution ; le correcteur sait les recorriger une fois `check-site` livré. Pendant la passe de référence (`old`), les contrôles de type `check-site` sont « en attente » et ne comptent pas : seuls les autres contrôles décident du rouge.
6. **Variante `old`** : `origin/main` = b947a12, conforme à §5.3.
7. **Scratchpad de session interdit** : `--disallowedTools` refuse `Edit` et `Write` sous `%TEMP%/claude/**` (chemin écrit sous forme POSIX, `//c/...`), et `--append-system-prompt` ajoute « écrire uniquement dans le dossier de travail ». Le lanceur signale toute écriture hors du dossier et arrête la campagne.
8. **S2 durci (G3, G4)** : la demande nomme la compilation Lighthouse de la CI (`SITE_URL=http://localhost:4321 PUBLIC_INDEXABLE=true LIGHTHOUSE_CI=true`). Le scénario exige :
   - qu'une compilation indexable en localhost sans `LIGHTHOUSE_CI` échoue ;
   - que la compilation Lighthouse réussisse et qu'un test la couvre ;
   - que `npm test` vérifie la sortie compilée (`check-site --dist` ou un équivalent) : la suppression du fichier `og:image` doit la faire rougir.
   Si S2 reste vert sur `old`, il devient un scénario de non-régression.
9. **S3 inchangé** : le cœur de G5 (ne pas inventer de volume) est acquis sans skill ; S3 mesure le gabarit `Source / Date / Volume` et le renvoi vers la Search Console.
10. **Commandes de test** : sous Node 22 et au-delà, `node --test <dossier>/` exécute le dossier comme un fichier ; les motifs de `--test` n'existent qu'à partir de Node 21 ; les commandes de ce document passent donc une liste de fichiers explicite, valable sous Node 20 et au-delà (validation du contrat, amendement 1) : (`node --test scripts/test/check-site.test.mjs scripts/test/skill-structure.test.mjs`).
