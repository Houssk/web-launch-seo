# Validation du contrat de check-site (A1 à A7)

Date : 12/10/2026. Auteur : l'architecte du harnais (auteur de `docs/spec.md`). Objet : le contrat fixé par le testeur en tête de `scripts/test/check-site.test.mjs` (HEAD 514df4b), avant que le développeur code `scripts/check-site.mjs`.

## Verdict : À AMENDER (9 amendements)

Les sept points tiennent et le développeur peut coder dès maintenant contre A1 à A7. Aucun amendement ne retire un test existant ni ne change un point du contrat. Ils en précisent trois (A3, A5, A7), ajoutent quatre tests, assouplissent une expression régulière et corrigent la spec là où elle contredit le contrat ou se contredit elle-même.

Ce qui a été vérifié :

- les 45 identifiants de la spec §4.3 ont chacun un cas rouge et une face verte. Je l'ai vérifié par un `diff` entre la table de la spec et `CHECKS`, avec des gravités identiques. Aucun contrôle sans test ;
- le contrat s'exécute sans dépendance npm. Le fichier n'importe que des modules `node:`, et il n'y a pas de `package.json` à la racine. `node --test scripts/test/check-site.test.mjs` sous Node 24.20.0 donne 166 tests : 1 vert (le méta-test) et 165 rouges, tous sur « scripts/check-site.mjs is missing » ;
- la confiance TLS par `NODE_EXTRA_CA_CERTS` fonctionne. Je l'ai sondé avec le certificat commité (CA:TRUE, SAN `acme-widgets.test` et `www.acme-widgets.test`) : avec la variable, 200 ; sans elle, `DEPTH_ZERO_SELF_SIGNED_CERT` ;
- le témoin `clean` peut tenir le « zéro avertissement » d'A4 avec une lecture raisonnable de la spec, sauf PERF-001, dont la formulation actuelle le contredit (amendement 7).

## Point par point

| Point | Conforme à la spec ? | Écart justifié ? | À changer |
| --- | --- | --- | --- |
| A1 exports (`isAllowed`, `parseHeadersFile`, `headersFor`, `imageSize`, `cspHash`) ; l'import ne lance rien | Conforme. La spec §4.1 exige des fonctions exportées et un import sans effet, sans les nommer : A1 les nomme | Oui : sans noms, pas de tests unitaires (§4.5 point 3) | Reporter les noms dans la spec §4.1 (amendement 9). Le test n'a rien à changer : il ne fixe que les signatures, et `headersFor` ne vérifie que la présence des deux CSP, pas le séparateur |
| A2 la sonde 404 n'est pas une page ; elle ne nourrit que NOTFOUND-001, CANON-003 et HEADERS-002 | Précision. La spec dit seulement « plus une sonde 404 », mais elle range déjà la 404 sous HEADERS-002 et dit « pas de canonique sur la 404 » (G4) | Oui. Sinon META, OG ou CANON-001 se déclencheraient sur une page `noindex` par nature, et `pages` du témoin `clean` ne vaudrait plus 4 | La liste entre parenthèses n'est pas exhaustive : écrire « tous les contrôles par page (dont INDEX-002 et SITEMAP-004) ». Reporter dans la spec §4.2 (amendement 9) |
| A3 SITEMAP-003 et SITEMAP-004 limités à l'hôte de `--site` | Précision (la spec ne dit rien) | Oui, et pour une raison plus forte que d'éviter le double signalement : charger une `<loc>` hors hôte rendrait le script non déterministe. `http://localhost:4321` est le port par défaut du serveur de développement Astro, il peut répondre sur la machine qui lance les tests, et en mode en ligne ce serait une requête vers un tiers | Le dire, et l'épingler par un test (amendement 2) |
| A4 « face verte » = ni erreur ni avertissement sur `clean` | Écart : la spec §5.1 dit « zéro erreur, avertissements listés » | Oui. C'est le contrôle des faux positifs, et un témoin juste n'a aucune raison d'avertir | Corriger la spec §5.1 (amendement 9) et PERF-001 (amendement 7), sans quoi A4 contredit la spec |
| A5 `--connect-to` répétable ; confiance TLS par `NODE_EXTRA_CA_CERTS` | Précision. La répétition est nécessaire (quatre couples hôte:port). La spec ne disait rien du TLS | Oui. Pas de dépendance, pas d'option `--insecure`, et la vérification par la sonde ci-dessus est concluante | Épingler l'hypothèse : le script ne désactive jamais la vérification TLS (amendement 3) |
| A6 forme d'un constat (`id`, `severity`, `url` ou `null`, `message`, `evidence` facultatif) | Conforme à l'exemple de §4.4. `url: null` pour un constat global est une précision | Oui | Reporter dans §4.4 avec deux règles que les tests imposent déjà sans les écrire : les constats à `url: null` sont triés en tête (clé `url ?? ''`), et `input.kind` vaut `dist` ou `url` (amendement 9) |
| A7 contrôles coupés en `staging` | ROBOTS-002, ROBOTS-003, ROBOTS-005, INDEX-001 et PLACEHOLDER-001 sont déjà marqués « Mode launch » dans la spec, et l'exigence de `https` de SITEMAP-002 aussi. **SITEMAP-004 est un écart** | Oui : c'est un défaut de ma spec. En staging, toutes les pages sont `noindex`, donc toute URL du plan du site déclencherait SITEMAP-004, et le critère « `--mode staging` : 0 erreur » de S2 serait inatteignable | Marquer SITEMAP-004 « Mode launch » dans la spec. Compléter la liste avec ROBOTS-001 et SITEMAP-001 (amendement 4) |

## Amendements

Le testeur modifie les tests. La spec est modifiée par celui à qui le contrôleur confie cette correction.

1. **Commande d'exécution compatible avec Node 20.** Dans l'en-tête du test (ligne 4), dans la spec §4.5, §6 (lignes T2 et D4) et dans l'amendement 4 de la spec, remplacer `node --test scripts/test/` et `node --test "scripts/test/*.test.mjs"` par `node --test scripts/test/check-site.test.mjs scripts/test/skill-structure.test.mjs`. La spec annonce Node 20 ou plus. Les motifs de `--test` n'existent qu'à partir de Node 21, et sous Node 22 et au-delà un dossier n'est plus accepté (constat du testeur). Une liste de fichiers explicite marche partout et dans tous les shells. Non vérifié sous Node 20 : seul Node 24 est installé ici.
2. **A3 précisé et épinglé.** Ajouter à A3 : « an off-host `<loc>` is never fetched and never added to `report.pages` ». Ajouter un test : un serveur `node:http` sur `127.0.0.1:<port>` compte les requêtes reçues. Une copie de `clean` ajoute à `sitemap.xml` une `<loc>http://127.0.0.1:<port>/x/</loc>`. Attendu : SITEMAP-002 en erreur, 0 requête reçue, et aucune page `127.0.0.1` dans `pages`. Spec §4.3 (SITEMAP-003 et -004) : « `<loc>` sur l'hôte de `--site` ; une `<loc>` hors hôte n'est ni chargée ni comptée comme page (SITEMAP-002 seul) ».
3. **A5 complété : la vérification TLS ne se désactive pas.** Ajouter à A5 : « the script never disables certificate verification; an untrusted certificate makes the origin unreachable (exit 2) ». Ajouter un test : `liveSite()` lancé par `run(site.args, { env: { NODE_EXTRA_CA_CERTS: undefined } })`, et non par `report()`, car aucun JSON n'est écrit. Attendu : code 2. `spawn` ignore les valeurs `undefined`, ce qui neutralise aussi une variable posée sur la machine. Sans ce test, un `rejectUnauthorized: false` ferait passer tous les tests en ligne, et le script dirait sain un site au certificat cassé. Spec §4.4 : « certificat refusé = origine injoignable (2) ; aucune option ne désactive la vérification ».
4. **A7 complété : en staging, un robots.txt ou un plan du site absent n'est pas une erreur.** En staging, ROBOTS-003 n'exige déjà plus de ligne `Sitemap:`, mais SITEMAP-001 exige toujours un plan du site. Or un staging sans plan du site est juste. Un staging sans robots.txt l'est aussi : Google traite un robots.txt en 4xx comme une absence de règle [S10], donc le `noindex` reste lisible (G2). Avec les règles actuelles, S2 (`maxErrors: 0` en staging) jugerait rouge un agent qui a bien travaillé. Ajouter à A7 : « in staging, a 404 for robots.txt or the sitemap is not an error (ROBOTS-001, SITEMAP-001); when present, they are still checked ». Ajouter un test : la variante `staging-ok` sans `robots.txt` ni `sitemap.xml`, en `--mode staging`. Attendu : aucune erreur, code 0. Spec §4.3 : mêmes mots sur ROBOTS-001 et SITEMAP-001.
5. **Ligne de résumé : ne pas interdire la durée.** La spec §4.1 permet la durée dans la sortie texte, mais le motif du test (`… — (\d+) pages?$`) refuse tout ce qui suit « pages » sur la ligne. Retirer le `$`, ou écrire dans le contrat que la durée va sur une ligne à part. Je préfère retirer le `$` : c'est le plus simple.
6. **Découverte par un index de plan du site.** Aucun test ne vérifie que la ligne `Sitemap:` est suivie, ni qu'un index est parcouru. Or la pile de référence (Astro et son intégration de plan du site) produit `sitemap-index.xml` puis `sitemap-0.xml`. Un script qui ne lirait que `/sitemap.xml` passerait tous les tests et échouerait sur le premier vrai site. Ajouter un test sur une copie de `clean` : `sitemap.xml` retiré, `sitemap-0.xml` reprend son contenu, et `sitemap-index.xml` (`<sitemapindex>`) pointe vers `sitemap-0.xml`. La ligne `Sitemap:` de robots.txt vise l'index. Attendu : ni erreur ni avertissement, et les quatre mêmes `pages`.
7. **Spec, PERF-001 : exclure les blocs de données.** « Script de `<head>` sans `defer`/`async`/`type=module` » vise, à la lettre, le `<script type="application/ld+json">` que toutes les pages de `clean` portent dans `<head>`. Le zéro avertissement d'A4 est donc intenable à la lettre. Nouvelle formulation : « script exécutable de `<head>` (hors `application/ld+json` et autres types de données, comme CSP-002) sans `defer`/`async`/`type=module` ». Le test n'a rien à changer.
8. **Spec, OG-001 : retirer « (ou un hôte d'images déclaré) ».** Aucune option de §4.2 ne permet de déclarer un hôte d'images, et aucun test n'en suppose une.
9. **Spec : reporter le contrat dans §4, pour qu'il n'y ait qu'une source de vérité.**
   - §4.1 : les noms et signatures d'A1.
   - §4.2 : la sonde 404 selon A2, avec la formulation corrigée ; `--connect-to` « répétable, syntaxe de `curl` » ; `--forbid` « s'ajoute aux marqueurs par défaut » (c'est ce que dit le titre du test ; la spec était ambiguë).
   - §4.3 : SITEMAP-004 préfixé « Mode launch : ».
   - §4.4 : A6, avec les constats à `url: null` en tête et `input.kind` à `dist` ou `url`.
   - §5.1, ligne `clean` : « aucun ; zéro erreur, zéro avertissement (infos permises) ».

## Remarques sans amendement

- **Les branches secondaires d'un contrôle** n'ont pas toutes leur cas. La spec (§4.5 point 1) n'en exige qu'un par identifiant, et la règle est donc respectée. Restent sans cas, entre autres :
  - les avertissements de doublon et de longueur de META-001 et META-002 ;
  - l'`og:image` absente ou qui ne répond pas `image/*` (OG-001) ;
  - l'absence de `@context` (JSONLD-002) ;
  - `nosniff` absent sur une page HTML (HEADERS-001 en erreur) ;
  - la redirection `http` qui vise `www` (REDIRECT-001).

  La preuve par mutation du relecteur (§4.5 point 6) dira si l'une d'elles mérite un test.
- **Le test du lecteur HTML** (`<LINK REL=canonical HREF=…/about/>`) est juste. En HTML, la barre oblique finale d'une valeur sans guillemets appartient à la valeur. Un lecteur qui la prendrait pour une balise auto-fermante produirait un faux CANON-002. C'est à signaler au développeur, pas à changer.
- **Une incohérence de ma spec**, hors contrat : G3 règle 6 veut qu'aucune canonique ne vise `localhost`, alors que CANON-001 ne juge que les pages indexables. Une page `noindex`, donc tout un staging, peut ainsi garder une canonique en `localhost` sans constat. À trancher avec la mutation du relecteur. Le contrat n'en dépend pas.
- **Les exclusions d'A2.** CSP-002 et HEADERS-001 ne s'appliquent pas à la 404. Un script en ligne cassé sur la 404 n'est donc pas vu. Le risque est faible et l'exclusion est cohérente avec A2.
- **Node 20.** Sa fin de maintenance est annoncée pour avril 2026 (calendrier de nodejs.org, non relu aujourd'hui). Si c'est confirmé, passer le minimum à Node 22 dans la spec §0 et §4.1 ; l'amendement 1 resterait utile.
