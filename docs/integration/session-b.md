# Notes de passation — Session B (Rencontre)

> Tenues à jour à chaque push. Branche : `claude/confident-ptolemy-8943zn`.

## État d'avancement

| Palier | Élément | État |
|---|---|---|
| 1 | Données de développement (`pnpm db:seed:dev`, page `/dev`) | ✅ fait et testé |
| 1 | Lecture des membres et politiques (`canViewProfile`, `canMessage`) | ✅ fait et testé |
| 1 | Questionnaire (PAC-01, DEC-05) | ✅ fait et testé (API) ; interface vérifiée à la main |
| 1 | Découverte (DEC-01 à DEC-06, DEC-11) | ✅ fait et testé (API, dont concurrence) ; interface vérifiée à la main |
| 1 | Matchs (CHAT-01, CHAT-13) | ✅ création, écran « Liaison établie », unmatch ; bloquer et signaler câblés sur le contrat `safety` (NOT_IMPLEMENTED côté A) |
| 1 | Messagerie temps réel (CHAT-02, CHAT-03) | ⏳ API, relais et paquet `realtime` faits et testés ; interface en cours |
| 1 | Notifications | ⏳ |
| 1 | Pacte | ⏳ |

## Ce qui est fait

### Données de développement

- `packages/db/src/dev-seed/` : 400 membres fictifs déterministes (graine fixe), répartis selon les ordres de grandeur de docs/00 (EPITA 90, ESME 95, IPSA 45, Sup'Biotech 70, ISG 100 ; part de femmes par école ; ~3 % de personnes non binaires). Les 5 personas de docs/00 (Inès, Hugo, Sarah, Malik, Camille) sont les membres 1 à 5, avec des histoires scénarisées (match Inès–Hugo avec conversation, Sarah très likée, Camille–Malik en mode Amis…).
- Identifiants reconnaissables : `de000000-0000-7000-8000-00000000xxxx`. Le script supprime puis recrée ces membres : il est idempotent (même état final à chaque exécution) et remet à zéro ce qui a été fait avec eux dans l'application.
- Photos de synthèse (dégradés, halos, orbites aux couleurs des écoles, jamais de visage) encodées en PNG par un encodeur maison (`photos.ts`, sans dépendance native) et téléversées dans `epilove-media` (bucket créé s'il manque) ; un second passage ne re-téléverse pas les images existantes. Premier passage ≈ 2 min.
- Prompts et intérêts préfixés `dev-` (catalogue de A pas encore fusionné), réponses au questionnaire tirées de 5 profils latents (compatibilités réalistes), likes, passes, matchs, conversations chiffrées (`@epilove/crypto`), blocages et contacts masqués.
- Refusé hors `APP_ENV=development|test`.
- Page `/dev` (404 hors développement) : choix du membre courant, stocké dans le cookie `epilove-dev-member` (non HttpOnly, volontairement) puis envoyé comme en-tête `x-dev-user-id`. Procédure `dev.members` (NOT_FOUND hors développement).

### Politiques et lecture des membres

- `packages/core/src/policies/profile-access.ts` : `canViewProfile` (soi, match, découverte, « t'a liké ») et `canMessage`, testées par propriétés (un blocage, un contact masqué, un bannissement, une suspension ou une suppression ferment tout ; un message implique un match actif et l'accès aux deux profils ; jamais de mineur).
- `Relations` gagne `hasActiveMatch(a, b)`.
- `packages/db/src/repositories/members.ts` : `loadMembers`, `loadMember`, `loadDiscoverableMembers` (pré-filtre SQL grossier, `canSee` fait le vrai travail), `loadRelations` (blocages, likes, matchs entre le viewer et une liste), `touchLastActive`. Exposé par le sous-chemin `@epilove/db/repositories/members` (pas d'export depuis `src/index.ts`, pour éviter les conflits).
- Règle « profil complet » retenue en attendant A : onboarding terminé (`status ≠ onboarding`) et au moins une photo approuvée.

### Questionnaire (PAC-01, DEC-05)

- Banque de 45 questions fr/en (`packages/db/src/seeds/questions.ts`, sections `values`, `lifestyle`, `campus`, `nerd`, `plans`), ajoutée à `pnpm db:seed` (upsert par slug). Aucune question sur la religion, la politique, la santé ou l'origine ; le tabac a été volontairement écarté (donnée de santé potentielle), l'alcool n'est abordé que par le style de soirée.
- `packages/core/src/matching/explain.ts` : les deux accords les plus pondérés et un désaccord sans enjeu (les questions « nerd » en priorité ; jamais une question importante pour l'un des deux), testé par propriétés.
- Procédures `questionnaire.get`, `questionnaire.answer` (upsert idempotent, options validées), `questionnaire.compatibility` (exige `canViewProfile`, sinon NOT_FOUND). Tests d'intégration sur PostgreSQL.
- Interface `(app)/campus/questionnaire` : introduction (pondération expliquée, confidentialité), une question par écran (réponse, réponses acceptées, importance en 5 niveaux avec explication), sauvegarde à chaque question, progression par section animée, clavier (1–4, Entrée), focus déplacé sur la question pour les lecteurs d'écran, écran de fin.

### Découverte (DEC-01 à DEC-06, DEC-11)

- `packages/core/src/discovery/rules.ts` : quotas de docs/01 (20 likes, 10 pour un compte de moins de 48 h, 1 coup de cœur avec commentaire obligatoire, 1 retour arrière par jour, commentaire ≤ 150 caractères), journée de campus en `Europe/Paris` (changements d'heure testés).
- `packages/core/src/discovery/ranking.ts` : score réciproque `R = √(p(A→B)·p(B→A))` (logistique à poids manuels : compatibilité, intérêts, complétude, activité, écart de promo ; probabilité 0,95 quand l'autre a déjà liké), bonus nouveaux / actifs / inter-écoles (réglage `crossSchoolBoost`), facteur d'exposition (plafond d'attention à 10 likes en attente, budget de 40 impressions par jour), diversification MMR pondérée par la récence, une carte sur quatre pour une personne qui t'a liké. Testé par propriétés.
- Le deck est recalculé à chaque appel (pas de cache Valkey) : chargement des membres découvrables, `canSee` + `isDeckCandidate` (passes masquées 45 jours, likes définitivement, critères éliminatoires), filtres, classement, puis cartes. Suffisant pour quelques milliers de membres ; cache à ajouter si la latence l'exige (noté pour un ADR).
- Like / coup de cœur / passer (`discovery.decide`) : transaction avec verrous consultatifs (paire puis quota du membre, toujours dans cet ordre), quota recompté dans la transaction, contenu liké vérifié (photo approuvée ou réponse de la cible), match créé si réciproque (paire ordonnée unique), événements outbox `like.received` / `match.created` et notifications in-app dans la même transaction. Idempotent. Test : 8 paires qui se likent simultanément créent exactement 8 matchs.
- Un compte restreint, en pause ou en onboarding ne peut pas liker ; une paire qui a « unmatché » reste séparée.
- Retour arrière (`discovery.undo`), likes reçus (`discovery.likesReceived`, filtrés par `canViewProfile`), profil complet (`discovery.profile`), ma carte (`discovery.me`), filtres (`discovery.filters` / `saveFilters`).
- Nouvelles tables (`packages/db/src/schema/discovery.ts`) : `impression` (exposition par jour), `discovery_filter` (filtres du deck, à sens unique ; la colonne `preferences.school_filter` de A n'est pas utilisée), `discovery_undo`.
- Interface : `(app)/decouvrir` (deck physique : inclinaison selon la vitesse, lancer, tampons, reflet holographique par école au pointeur et au gyroscope, préchargement des 3 cartes suivantes, clavier ← → ↑ Entrée et h / l, vibration, file de cartes rechargée automatiquement, états vide / chargement / hors ligne), tiroir de filtres, feuille de like ciblé (photo ou prompt, commentaire), `(app)/likes`, `(app)/membres/[id]` (photos et prompts alternés, compatibilité expliquée, intérêts communs, transition d'élément partagé depuis la carte via `<ViewTransition>`).

### Matchs (CHAT-01, CHAT-13)

- Écran « Liaison établie » : cartes qui se rapprochent, arc électrique animé, flash aux couleurs des deux écoles, annonce `aria-live`, focus sur « Écrire ».
- `matches.list` (matchs visibles uniquement : un blocage ou un contact masqué retire le match de la liste), `matches.unmatch` (idempotent, réservé aux participants, événement `match.closed`).
- `Relations.hasEndedMatch` : un unmatch ferme tout, comme un blocage (`canSee`, `canViewProfile`, `canMessage`), testé par propriétés.
- Menu de sécurité (profil, et bientôt conversation) : annuler le match, bloquer, signaler (motifs de `REPORT_REASONS`, précisions, « bloquer aussi » coché par défaut), en deux gestes. Message sobre tant que A renvoie NOT_IMPLEMENTED.

### Divers

- `packages/core/src/messaging/ids.ts` : génération et lecture d'UUIDv7 (messages envoyés par le client).
- Client API côté navigateur (`apps/web/lib/rencontre/api.client.ts`, TanStack Query via `@orpc/tanstack-query`) et côté serveur (`api.server.ts`, appel en mémoire de `apiApp` avec les cookies de la requête).

## Fichiers partagés modifiés

| Fichier | Modification |
|---|---|
| `package.json` (racine) | script `db:seed:dev` |
| `pnpm-workspace.yaml` | catalogue : `@orpc/tanstack-query`, `@tanstack/react-query` (5.104.0, la 5.104.1 a moins de 24 h), `aws4fetch`, `centrifuge`, `motion` (13.5.0, la 14.0.0 a moins de 24 h) ; `allowBuilds` : `protobufjs: false` (script d'information seulement, tiré par `centrifuge`) |
| `packages/db/package.json` | dépendance `@epilove/crypto`, devDependency `aws4fetch`, script `db:seed:dev`, exports `./repositories/*`, `./dev-seed` et `./testing` (fabriques de membres pour les tests d'intégration, identifiants aléatoires) |
| `apps/web/package.json` | dépendances `@epilove/contracts`, `@epilove/crypto`, `@epilove/media`, `@orpc/tanstack-query`, `@tanstack/react-query`, `centrifuge`, `motion` |
| `packages/contracts/src/index.ts`, `packages/api/src/router.ts` | modules `dev`, `discovery`, `matches`, `questionnaire` (ajouts) |
| `packages/api/src/app.ts` | intercepteur `onError` qui journalise la classe des erreurs inattendues (jamais le message, qui peut contenir des paramètres SQL) : sans lui, oRPC masquait silencieusement les 500 |
| `apps/web/i18n/messages.ts` | namespaces `campus`, `discovery`, `likes`, `matches`, `questionnaire` (ajouts) |
| `packages/core/src/index.ts` | `discovery/ranking`, `discovery/rules`, `matching/explain`, `messaging/ids`, `policies/profile-access` (ajouts) ; `sharedModes` exporté de `can-see.ts` |
| `packages/db/src/seeds/index.ts` | seed `questions` (ajout) |
| `infra/centrifugo/config.json` | `presence: true` sur l'espace `personal` (statut en ligne entre matchs) ; origines `127.0.0.1:3000` et `localhost/127.0.0.1:3100` (Playwright) |
| `.env.example` | section `# Session B` |
| `apps/worker/src/index.ts`, `apps/worker/src/env.ts`, `apps/worker/src/tasks/index.ts` | démarrage du relais de l'outbox, variables Centrifugo facultatives, tâche `outbox_purge` (ajouts) |
| `infra/scripts/cloud-docker.sh` | repli sur l'image Docker Hub `darthsim/imgproxy` (même version) quand le proxy de la session cloud bloque les téléchargements de ghcr.io |

## Variables d'environnement

- `CENTRIFUGO_WS_URL` (facultative, section « Session B » de `.env.example`) : URL WebSocket de Centrifugo vue par les navigateurs ; déduite de `CENTRIFUGO_URL` si absente.
- Le worker lit désormais `CENTRIFUGO_URL` et `CENTRIFUGO_HTTP_API_KEY` (facultatives : sans elles, le relais de l'outbox ne démarre pas).

## Migrations

- `0004_*` : table `chat_preference`, index `message (sender_id, created_at)` (quota anti-spam).
- `0003_*` : tables `impression`, `discovery_filter`, `discovery_undo` (jetable, à régénérer à la fusion).

## Mises à jour souhaitées dans CLAUDE.md / README / docs

- `CLAUDE.md`, section Commandes : ajouter `pnpm db:seed:dev` (membres fictifs, photos de synthèse, page `/dev`).

- `apps/web/AGENTS.md` et `apps/web/CLAUDE.md` sont générés par `next dev` (Next.js 16.3) et recommandent de les committer : ils renvoient vers la documentation embarquée dans `node_modules/next/dist/docs/`.

## Points d'intégration

- Les pages de B affichent un écran « connecte-toi » (`GateScreen`) sur UNAUTHORIZED, avec un lien vers `/dev` en développement et `/connexion` sinon : **à aligner sur la route de connexion de A**. Sur `FORBIDDEN profile_required`, lien vers `/onboarding`.
- Les pages de B enveloppent leurs segments dans `RencontreProviders` (TanStack Query + `MotionConfig reducedMotion="user"`) via leurs propres `layout.tsx` ; à l'intégration, on peut remonter ce provider dans `(app)/layout.tsx`.

- Les pages `/dev` et les clients API lisent le cookie de développement ; une fois Better Auth branché par A, `serverApi()` transmet déjà les cookies de la requête : rien à changer côté B.
- Remplacer les prompts et intérêts `dev-` par le catalogue de A (le seed de développement les réutilisera s'ils existent, ou on adaptera `content.ts`).
- Harmoniser la règle « profil complet » avec la complétude de A (PRO-05).

## ADR

- `docs/adr/0020-evenements-temps-reel-sans-donnees.md` : les événements Centrifugo ne transportent que des identifiants ; le contenu passe par l'API.

## Questions ouvertes

- Aucune pour l'instant.
