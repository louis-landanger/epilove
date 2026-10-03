# Solveur du Pacte

Couplage de poids maximum du Pacte (PAC-02), décrit dans [docs/06-matching.md](../../docs/06-matching.md#9-le-pacte). Job ponctuel en Python ([ADR 0021](../../docs/adr/0021-solveur-du-pacte.md)), appelé par `pnpm pact:compute` (`apps/worker/src/tasks/pact`).

## Entrée et sortie

Une requête JSON sur l'entrée standard, une réponse JSON sur la sortie standard :

```json
{
  "threshold": 0.6,
  "neighbours": 50,
  "power": 1,
  "engine": "auto",
  "timeLimitSeconds": 300,
  "distinctPairs": true,
  "graphs": [{ "mode": "love", "nodes": ["<id>"], "edges": [["<id>", "<id>", 0.72]] }]
}
```

```json
{ "graphs": [{ "mode": "love", "pairs": [["<id bas>", "<id haut>", 0.72]], "stats": {} }] }
```

- Le solveur ne reçoit que des identifiants opaques et des scores : ni prénom, ni réponse, ni préférence.
- Un graphe par mode, traités dans l'ordre. Avec `distinctPairs`, une paire couplée en Love n'est pas recouplée en Amis (l'application n'a qu'un match par paire).
- Étapes : seuil (`threshold` : mieux vaut aucun match qu'un mauvais match), sparsification (une arête est gardée si elle fait partie des `neighbours` meilleures d'au moins une de ses extrémités), couplage, puis vérification (chaque personne au plus une fois, uniquement des arêtes du graphe).
- Moteurs : `networkx` (algorithme d'Edmonds, graphes généraux, exact), `cpsat` (OR-Tools CP-SAT, une variable par arête, arrêt à `timeLimitSeconds` avec le statut `feasible` s'il n'a pas prouvé l'optimum), `auto` (networkx jusqu'à 250 000 arêtes, CP-SAT au-delà s'il est installé). Le statut est repris dans le rapport de contrôle qualité.
- Poids entiers (score × 10⁶, ou score² avec `power: 2`) : calcul exact dans les deux moteurs.
- Code de sortie 2 et message court sur la sortie d'erreur si la requête est invalide, sans identifiant de membre.

## Commandes

```bash
uv sync --frozen --extra cpsat               # dépendances, avec OR-Tools
pnpm --filter @epilove/pact-solver test:py   # pytest (dont comparaison à une recherche exhaustive)
pnpm --filter @epilove/pact-solver lint:py   # ruff
pnpm --filter @epilove/pact-solver bench     # 3 000 membres synthétiques (≈ 4 minutes)
pnpm pact:compute --synthetic 3000           # chaîne complète à blanc, vrais scores de questionnaire
```

Les tests Python ne passent pas par `pnpm test` (pas de `uv` dans ce job) : la CI a un job dédié, `Pact solver (Python)`.

## Mesures

Machine de développement (4 cœurs), 3 000 membres synthétiques, toutes les paires candidates (pire cas : mode Amis), seuil 0,60, 50 voisins :

| Étape | Résultat |
|---|---|
| Paires candidates | 4 498 500 |
| Au-dessus du seuil | 1 604 796 (35,7 %) |
| Après sparsification | 80 799 |
| Glouton (référence) | 0,1 s, 1 474 paires, total 1 395,6 |
| networkx | 141 s, 1 500 paires, total 1 425,6, optimal |
| CP-SAT | 59 s, 1 500 paires, total 1 425,6, optimal |

Les deux moteurs trouvent le même optimum, CP-SAT plus vite sur ces poids uniformes.

Chaîne complète à blanc (`pnpm pact:compute --synthetic 3000`) : 3 001 membres synthétiques générés comme les données de développement, 2 324 participants (au moins 30 réponses), vrais scores de questionnaire et vraies règles d'éligibilité :

| Étape | Love | Amis |
|---|---|---|
| Participants | 1 996 | 1 773 |
| Arêtes après seuil et sparsification | 44 591 | 52 110 |
| networkx | 68 s, optimal | 78 s, optimal |
| CP-SAT (limite 300 s) | | 302 s, `feasible` (optimum non prouvé) |
| Paires, couverture | 866, 86,8 % | 886, 99,9 % |
| Score minimal, médian | 0,62, 0,92 | 0,79, 0,92 |

Construction du graphe côté TypeScript : 4 s pour 2,7 millions de paires. Total : 2 min 30 s avec networkx. Sur des scores de questionnaire, CP-SAT peine à prouver l'optimum : `auto` reste donc sur networkx à l'échelle du campus. Le calcul tourne deux jours avant la révélation, ces durées laissent toute la marge nécessaire.
