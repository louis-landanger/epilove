# Tests de charge (k6)

Scénario de [docs/11](../../docs/11-qualite-ops.md) : **3 000 connexions temps réel** tenues pendant la **révélation du Pacte**, puis une **rafale de messages** entre les paires que la révélation a créées.

## Ce que fait le scénario

1. `pnpm pact:load --members 3000 --reveal-in 180` (développement seulement) crée 3 000 membres fictifs « Charge » (identifiants `10ad0000-…`, jamais mélangés aux autres), une saison « Charge » close et calculée (membres associés deux à deux, mode amitié) et programme sa révélation comme une vraie : c'est le worker qui révèle.
2. k6 (`pact-reveal.js`) ouvre les connexions pendant `RAMP_SECONDS` (60 s) : jeton par l'API (`realtime.token`), puis connexion Centrifugo et abonnement au canal personnel et à `broadcast:pact`. 30 membres par VU ; les deux membres d'une paire sont dans le même VU, pour chronométrer un message avec une seule horloge.
3. À la diffusion `pact.reveal`, chaque client fait comme l'écran de révélation : `pact.result` après un délai aléatoire dans la fenêtre de la saison (`revealWindowMs` : au moins 3 s, et le temps qu'il faut pour servir tous les participants au débit `PACT_REVEAL_RESULTS_PER_SECOND`, 400 par défaut, soit 7,5 s pour 3 000), puis `pact.current` dans la minute qui suit (l'écran passe en phase « révélé » sans attendre le serveur).
4. 45 s après la révélation, dans chaque paire, le premier écrit 3 messages au second (`messaging.send`) ; on mesure l'envoi → réception par Centrifugo.
5. `run.sh` supprime ensuite les membres et la saison (`pnpm pact:load --clean`), même en cas d'échec.

## Lancer

Prérequis : services locaux (`pnpm services:up`), l'app **compilée** (`pnpm --filter @atomes/web build`, puis `pnpm start` avec `APP_ENV=development` et `DEV_AUTH=1`), le worker (révélation et relais de l'outbox), Docker pour k6.

```sh
infra/load/run.sh 3000 180
# Plusieurs processus de l'app (répartition par membre, comme un équilibreur) :
API_URL=http://localhost:3000,http://localhost:3010 infra/load/run.sh 3000 180
```

Réglages : `SOCKETS_PER_VU` (30), `RAMP_SECONDS` (60), `MESSAGES_PER_PAIR` (3), `PACT_REVEAL_RESULTS_PER_SECOND` (400), `REVEAL_JITTER_MS` (force la fenêtre), `BURST_DELAY_SECONDS` (45), `K6_IMAGE` (`grafana/k6:2.3.0`). Le résumé est écrit dans `infra/load/results/summary.json` (ignoré par git).

## Seuils

| Mesure | Seuil | Source |
|---|---|---|
| `realtime_connected` | > 99 % | 3 000 connexions |
| `pact_reveal_received` | > 99 % | tout le monde reçoit la révélation |
| `pact_reveal_delay` (minute annoncée → diffusion reçue) | p95 < 3 s | révélation synchronisée |
| `pact_result_ready` (minute annoncée → résultat reçu) | p95 < 8 s | suspense de 2,6 s, requêtes étalées sur la fenêtre de la saison |
| `http_req_duration{name:realtime.token}` | p95 < 300 ms | docs/11 (latence API) |
| `message_delivery` (envoi → réception) | p95 < 1 s | docs/11 |
| `message_delivered` | > 99 % | |
| `http_req_failed` | < 1 % | |

## Résultats mesurés (2 octobre 2026)

Environnement : un seul conteneur de **4 vCPU** qui fait tout tourner (app Next.js en production, PostgreSQL 18, Centrifugo 6.9, worker, et k6 lui-même). Les chiffres sont donc un plancher.

| Mesure | 1 processus de l'app | 4 processus de l'app (même 4 vCPU) |
|---|---|---|
| Connexions réussies | 3 000 / 3 000, connexion p95 7 ms | 3 000 / 3 000, p95 9 ms |
| Révélation reçue | 3 000 / 3 000, p95 2,2 s après la minute | 3 000 / 3 000, p95 1,7 s |
| `realtime.token` | p95 4 ms | p95 5 ms |
| Résultat reçu | **46 %** en moins de 30 s ; p95 34 s | **99 %** ; p95 29 s |
| Requêtes en échec | 15 % (délai de 30 s dépassé sur `pact.result`) | 0,3 % |
| Messages (3 par paire ayant reçu son résultat, rafale juste après la vague de résultats) | 2 114 envoyés, 100 % reçus, p95 3,4 s | 4 488 envoyés, 100 % reçus, p95 6,5 s |

Ce qui tient : le temps réel. Centrifugo garde 3 000 connexions sans effort, la diffusion arrive partout en moins de 3 s, et un message hors pic arrive en p95 0,6 s (mesure intermédiaire avec 1 000 messages).

Ce qui ne tient pas : la vague de `pact.result`. Mesures détaillées :

- `pact.result` coûte environ **6 ms de CPU** dans le gestionnaire (≈ 14 requêtes SQL ; l'essentiel du temps est la construction et le décodage des requêtes), plus ≈ 3 ms de Next.js par requête ; `pact.current` environ 2 ms (≈ 8 requêtes).
- Un processus sert ≈ **110 résultats/s** à 100 % d'un cœur ; 3 000 résultats demandent donc ≈ 30 s.
- Quatre processus sur les mêmes 4 vCPU ne montent qu'à ≈ 165 résultats/s : la machine est saturée (CPU inactif < 10 %, PostgreSQL et k6 compris).
- Corrigé en chemin : `calendarDateIn` recréait un `Intl.DateTimeFormat` à chaque appel (9,5 % du CPU de `pact.result`), et l'écran de révélation rafraîchissait `pact.current` sur tous les écrans à la même milliseconde (désormais étalé comme le résultat).

## Après la fusion (3 octobre 2026)

Changements :

- `pact.result` : le membre n'est plus chargé deux fois, les profils et relations des paires sont chargés en une fois, les allers-retours indépendants partent en parallèle (7 → 4), et les questions actives sont gardées 5 minutes par processus. Banc en processus sur la saison « Charge » : 17 → 16 requêtes, 8,4 → 8,1 ms de CPU, 179 → 194 résultats/s pour un processus (sans Next).
- Fenêtre de révélation à la taille de la saison (`revealWindowMs` dans `@atomes/core`, renvoyée par `pact.current`) : les demandes arrivent au rythme que l'API sert au lieu de s'empiler ; régler `PACT_REVEAL_RESULTS_PER_SECOND` sur le débit mesuré du déploiement.
- L'écran ne rappelle plus `pact.current` au signal de révélation (la phase change sur place, resynchronisation étalée sur la minute suivante) : la vague de requêtes est divisée par deux.
- L'écran retente une demande de résultat qui échoue pour une raison passagère (réseau, serveur occupé, limite de débit), avec un délai croissant et aléatoire, au lieu d'afficher une erreur.

Mesures, même conteneur de 4 vCPU qui fait tout tourner :

| Mesure | Avant, 1 processus | Après, 1 processus | Avant, 4 processus | Après, 4 processus |
|---|---|---|---|---|
| Résultat reçu | 46 % ; p95 34 s | 95,8 % ; p95 33,8 s | 99 % ; p95 29 s | **100 % ; p95 19,3 s** |
| Requêtes en échec | 15 % | 1,2 % | 0,3 % | **0 %** |
| Rafale de messages, p95 (messages envoyés) | 3,4 s (2 114) | 7,4 s (4 317) | 6,5 s (4 488) | 6,4 s (4 499) |

La rafale ne part que des paires qui ont reçu leur résultat : à un processus, elle est deux fois plus grosse qu'avant, d'où un p95 plus haut. Le scénario k6 ne retente pas les requêtes : les 1,2 % d'échecs à un processus sont des délais de 30 s dépassés, que l'écran retenterait. Le p95 de 19 s à quatre processus reste au-dessus de l'objectif de 8 s : environ 15 ms de CPU par résultat (API, Next, PostgreSQL) pour 3 000 membres donnent un plancher d'une douzaine de secondes sur ces 4 vCPU partagés avec PostgreSQL, Centrifugo, le worker et k6.

## Recommandations pour la révélation à 3 000

1. **Plusieurs processus de l'API pendant la révélation**, sur des vCPU qui ne servent pas à PostgreSQL : il faut ≈ 400 résultats/s pour tenir p95 < 8 s, soit ≈ 4 processus (≈ 4 vCPU dédiés). À valider en préproduction avec ce scénario, k6 lancé depuis une autre machine.
2. Régler `PACT_REVEAL_RESULTS_PER_SECOND` sur le débit mesuré en préproduction : avec un débit plus faible, la fenêtre s'allonge d'elle-même (le résultat arrive plus tard mais sans saturer l'API ni les messages). Allonger le suspense de la séquence reste une décision produit.
3. Écarté : préparer les résultats chiffrés pendant le compte à rebours et diffuser la clé à la révélation. Un blocage dans les dernières minutes laisserait alors voir la carte de la personne qui a bloqué.
