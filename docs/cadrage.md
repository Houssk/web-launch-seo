# Cadrage : harnais d'amélioration du skill web-launch-seo

Date : 12/10/2026. Décision du propriétaire : autonomie complète, avec un harnais architecte, développeur et testeur. Livraison par une PR qu'il fusionne.

## Le besoin

Le skill doit permettre à un agent qui ne connaît pas le projet de lancer un site rapide, bien référencé et cité par les moteurs IA, sans refaire les erreurs déjà payées une fois. Le lancement du site de référence (12/10/2026) a montré douze manques. Ils sont listés plus bas, et chacun a coûté du temps ou aurait pu coûter une mise en ligne cassée.

Le skill vit en anglais (public international, dépôt public). Ce cadrage est en français, pour le propriétaire.

## Ce qui est « fini »

1. Chaque manque est couvert dans le skill. Chaque affirmation factuelle (règle Google, CNIL, Cloudflare) porte sa source et sa date de lecture.
2. `SKILL.md` reste un mode d'emploi court. Le détail va dans des fichiers `references/` chargés à la demande. Les vérifications reproductibles vont dans des `scripts/` exécutables.
3. Un banc d'essai (`evals/`) prouve que le skill change le comportement d'un agent :
   - des **sites témoins** avec des défauts plantés ;
   - un **script de contrôle déterministe** (`scripts/check-site`) qui trouve ces défauts sur un site servi, sans modèle ;
   - des **scénarios agent** : un agent neuf, avec le skill, reçoit une demande réaliste sur un site témoin ; un correcteur vérifie qu'il trouve et traite les défauts attendus.
4. Le banc d'essai est **rouge sur la version actuelle** du skill et **vert sur la nouvelle**. C'est la preuve que les ajouts servent.
5. Rien de propre au client ni au site de référence dans le skill : des leçons génériques seulement.

## Les douze manques (entrées de l'architecte)

| ID | Manque | Exemple vécu |
| --- | --- | --- |
| G1 | Phase avant lancement : interrupteur d'indexation, staging fermé, garde « contenu provisoire » | site de référence, ouverture le 12/10 |
| G2 | Pièges d'ouverture : `Disallow` cache le `noindex` ; robots.txt en cache 24 h chez Google ; « Impossible de récupérer » sur une propriété neuve | staging et Search Console |
| G3 | URL par environnement ; la compilation refuse un canonique ou un plan du site en localhost | défaut trouvé en relecture finale, tests verts |
| G4 | Règles imposées par des tests : Lighthouse CI bloquant, tests de compilation (titres, canoniques, JSON-LD, robots, plan du site), vérification qu'un test rougit sans sa garde | — |
| G5 | Méthode de mots-clés sans outil payant, volumes « non mesuré », passage aux données de Search Console | — |
| G6 | Données structurées à jour : FAQ réservée depuis 2023, `SoftwareApplication`/`Product`, `AboutPage`/`Person`, `dateModified`, `sameAs`, logo carré, échappement de `<` | — |
| G7 | Robots IA : politique explicite, contrôle Cloudflare (AI Crawl Control, robots.txt géré, Bot Fight Mode) | — |
| G8 | RGPD en France : `sessionStorage` traité comme un traceur (lecture prudente de l'art. 82, la CNIL ne le cite pas), exemption sous conditions, lien d'opposition, sous-traitant et durée ; modèle d'une mesure relayée par le site | outil de mesure tiers sur le site de référence |
| G9 | En-têtes de sécurité : CSP avec empreinte, Referrer-Policy, Permissions-Policy ; `_headers` ne couvre pas les réponses d'un Worker | relais /ingest |
| G10 | Core Web Vitals en détail : INP, CLS de `content-visibility`, coût des requêtes de conteneur, flou de `transform` sur du texte, médiane de plusieurs passes | scènes animées |
| G11 | GEO au-delà de `llms.txt` : cohérence de l'entité, réponses en première phrase, sources primaires, liste fixe de questions de suivi | — |
| G12 | Contrôles après déploiement (commandes) et cas français (LCEN, registre des risques, contenu à fort enjeu relu par un expert) | — |

## Le harnais

| Rôle | Ce qu'il produit | Ce qu'il ne fait pas |
| --- | --- | --- |
| Architecte | La spécification des changements (structure du skill, contenu par manque avec ses sources, matrice des cas d'essai) | Écrire le skill |
| Testeur | Les sites témoins, `scripts/check-site` et ses tests, les scénarios agent et leur correcteur ; il fait tourner le banc sur la version actuelle et constate le rouge | Modifier le skill |
| Développeur | Le nouveau `SKILL.md`, `references/` et `scripts/`, jusqu'au vert du banc | Modifier un test ou un site témoin |
| Relecteur | Une relecture à froid : faits sourcés, concision, cohérence, aucune donnée client, banc qui garde vraiment (mutation) | Corriger lui-même |

Ordre : architecte, testeur (rouge), développeur (vert), relecteur, corrections, PR.

## Contraintes

- Coût : les scénarios agent appellent un modèle. Le banc reste petit (6 à 8 scénarios). Le contrôle déterministe porte l'essentiel.
- Le skill installé (`~/.claude/skills/web-launch-seo`) n'est mis à jour qu'après la fusion de la PR, par `git pull`.
- Aucune affirmation sans source. Une règle non vérifiable s'écrit comme une recommandation, pas comme un fait.
