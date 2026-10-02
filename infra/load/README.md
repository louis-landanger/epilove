# Tests de charge (k6)

Scénario de [docs/11](../../docs/11-qualite-ops.md) : **3 000 connexions temps réel** tenues pendant la **révélation du Pacte**, puis une **rafale de messages** entre les paires que la révélation a créées.

## Ce que fait le scénario

1. `pnpm pact:load --members 3000 --reveal-in 180` (développement seulement) crée 3 000 membres fictifs « Charge » (identifiants `10ad0000-…`, jamais mélangés aux autres), une saison « Charge » close et calculée (membres associés deux à deux, mode amitié) et programme sa révélation comme une vraie : c'est le worker qui révèle.
2. k6 (`pact-reveal.js`) ouvre les connexions pendant `RAMP_SECONDS` (60 s) : jeton par l'API (`realtime.token`), puis connexion Centrifugo et abonnement au canal personnel et à `broadcast:pact`. 30 membres par VU ; les deux membres d'une paire sont dans le même VU, pour chronométrer un message avec une seule horloge.
3. À la diffusion `pact.reveal`, chaque client fait comme l'écran de révélation : `pact.current` et `pact.result`, chacun après un délai aléatoire dans `PACT_RULES.revealJitterMs` (3 s).
4. 45 s après la révélation, dans chaque paire, le premier écrit 3 messages au second (`messaging.send`) ; on mesure l'envoi → réception par Centrifugo.
5. `run.sh` supprime ensuite les membres et la saison (`pnpm pact:load --clean`), même en cas d'échec.

## Lancer

Prérequis : services locaux (`pnpm services:up`), l'app **compilée** (`pnpm --filter @epilove/web build`, puis `pnpm start` avec `APP_ENV=development` et `DEV_AUTH=1`), le worker (révélation et relais de l'outbox), Docker pour k6.

```sh
infra/load/run.sh 3000 180
# Plusieurs processus de l'app (répartition par membre, comme un équilibreur) :
API_URL=http://localhost:3000,http://localhost:3010 infra/load/run.sh 3000 180
```

Réglages : `SOCKETS_PER_VU` (30), `RAMP_SECONDS` (60), `MESSAGES_PER_PAIR` (3), `REVEAL_JITTER_MS` (3000), `BURST_DELAY_SECONDS` (45), `K6_IMAGE` (`grafana/k6:2.3.0`). Le résumé est écrit dans `infra/load/results/summary.json` (ignoré par git).

## Seuils

| Mesure | Seuil | Source |
|---|---|---|
| `realtime_connected` | > 99 % | 3 000 connexions |
| `pact_reveal_received` | > 99 % | tout le monde reçoit la révélation |
| `pact_reveal_delay` (minute annoncée → diffusion reçue) | p95 < 3 s | révélation synchronisée |
| `pact_result_ready` (minute annoncée → résultat reçu) | p95 < 8 s | suspense de 2,6 s, requêtes étalées sur 3 s |
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

## Recommandations pour la révélation à 3 000

1. **Plusieurs processus de l'API pendant la révélation**, sur des vCPU qui ne servent pas à PostgreSQL : il faut ≈ 400 résultats/s pour tenir p95 < 8 s, soit ≈ 4 processus (≈ 4 vCPU dédiés). À valider en préproduction avec ce scénario, k6 lancé depuis une autre machine.
2. Si ce n'est pas possible : allonger `PACT_RULES.revealJitterMs` et le suspense de la séquence (décision produit), ou alléger `pact.result` (moins de requêtes par résultat).
3. Écarté : préparer les résultats chiffrés pendant le compte à rebours et diffuser la clé à la révélation. Un blocage dans les dernières minutes laisserait alors voir la carte de la personne qui a bloqué.
