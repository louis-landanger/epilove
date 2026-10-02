# ADR-0021 — Solveur du Pacte : processus Python appelé par le worker, révélation par l'outbox

- **Statut** : accepté
- **Date** : 2026-10-02
- **Auteurs** : session B (Rencontre)

## Contexte

Le Pacte (PAC-02, docs/06, section 9) calcule un couplage de poids maximum sur un graphe général, une fois par édition, pour tout le campus. docs/03 (décision 012) retient Python pour son écosystème (networkx, OR-Tools). Le reste de la chaîne (éligibilité, compatibilité, écriture des résultats, révélation) vit en TypeScript, avec les politiques d'accès de `packages/core`. Il faut décider comment les deux mondes se parlent, où s'appliquent les règles et comment la révélation atteint tout le monde à la même seconde (PAC-03).

## Options envisagées

1. **Tout en Python** : le solveur lit la base, recalcule l'éligibilité et la compatibilité. Double implémentation des politiques et du score, donc des règles qui divergent tôt ou tard.
2. **Service Python permanent** (HTTP) : une brique de plus à déployer et surveiller pour un calcul lancé deux fois par an.
3. **Processus Python ponctuel, JSON sur l'entrée et la sortie standard** : TypeScript construit le graphe avec les politiques de `packages/core`, Python ne voit que des identifiants opaques et des scores, et renvoie les paires.

## Décision

Option 3.

- `apps/worker/src/tasks/pact` construit les arêtes (`buildPactEdges` : `canSee` dans les deux sens, incognito levé pour la paire puisque participer vaut consentement, paires déjà matchées exclues, critères éliminatoires, seuil, 50 meilleurs voisins par personne et par mode), appelle `python -m pact_solver` (`uv run` en développement, `PACT_SOLVER_COMMAND` dans un conteneur), puis **vérifie la réponse** (chaque paire est une arête envoyée, au-dessus du seuil, personne deux fois dans un mode, aucune paire dans deux modes).
- Le solveur (`apps/pact-solver`) ne reçoit ni prénom, ni réponse, ni préférence. Moteur par défaut : networkx (exact, prévisible) ; CP-SAT disponible et retenu automatiquement au-delà de 250 000 arêtes. Les mesures sont dans `apps/pact-solver/README.md`.
- Love d'abord, puis Amis sans les paires déjà couplées en Love : l'application n'a qu'un match par paire.
- Le rapport de contrôle qualité (agrégats seulement, groupes de moins de 10 personnes non détaillés, échantillon anonymisé) est stocké dans `pact_season.report`.
- Révélation : une tâche cron (`pact_reveal_due`, chaque minute) planifie une tâche Graphile Worker à l'heure exacte (`runAt`, clé de tâche unique). Celle-ci revérifie les politiques (un blocage, une pause ou un bannissement depuis le calcul retire la paire), crée les matchs `source = pact` et les notifications, et écrit dans l'outbox la diffusion `pact.reveal` sur `broadcast:pact` **en premier**, avant les événements personnels. Les écrans démarrent la séquence à la réception, puis demandent leur résultat après un délai aléatoire de 0 à 3 s ; un sondage avec gigue prend le relais sans temps réel.

## Conséquences

- Plus facile : une seule implémentation des règles d'éligibilité et du score ; solveur testable seul (pytest, comparaison à une recherche exhaustive) ; calcul rejouable à blanc sur une population synthétique (`pnpm pact:compute --synthetic 3000`, 2 min 30 s).
- Plus coûteux : un environnement Python dans le conteneur du worker (ou un conteneur dédié qui partage le code du worker), et un job CI de plus.
- La diffusion passe par l'outbox (fiabilité, idempotence) : la révélation part environ une seconde après l'heure (mesuré : 830 ms, deux navigateurs à 2 ms d'écart). Remise en cause si le test de charge k6 montre un relais trop lent pour 3 000 connexions.
