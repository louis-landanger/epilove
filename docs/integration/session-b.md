# Notes de passation — Session B (Rencontre)

> Tenues à jour à chaque push. Branche : `claude/confident-ptolemy-8943zn`.

## État d'avancement

| Palier | Élément | État |
|---|---|---|
| 1 | Données de développement (`pnpm db:seed:dev`, page `/dev`) | ✅ fait et testé |
| 1 | Lecture des membres et politiques (`canViewProfile`, `canMessage`) | ✅ fait et testé |
| 1 | Questionnaire | ⏳ banque de 45 questions en seed ; interface à faire |
| 1 | Découverte | ⏳ |
| 1 | Matchs | ⏳ |
| 1 | Messagerie temps réel | ⏳ |
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

### Divers

- `packages/core/src/messaging/ids.ts` : génération et lecture d'UUIDv7 (messages envoyés par le client).
- Client API côté navigateur (`apps/web/lib/rencontre/api.client.ts`, TanStack Query via `@orpc/tanstack-query`) et côté serveur (`api.server.ts`, appel en mémoire de `apiApp` avec les cookies de la requête).

## Fichiers partagés modifiés

| Fichier | Modification |
|---|---|
| `package.json` (racine) | script `db:seed:dev` |
| `pnpm-workspace.yaml` | catalogue : `@orpc/tanstack-query`, `@tanstack/react-query` (5.104.0, la 5.104.1 a moins de 24 h), `aws4fetch`, `centrifuge`, `motion` (13.5.0, la 14.0.0 a moins de 24 h) ; `allowBuilds` : `protobufjs: false` (script d'information seulement, tiré par `centrifuge`) |
| `packages/db/package.json` | dépendance `@epilove/crypto`, devDependency `aws4fetch`, script `db:seed:dev`, exports `./repositories/*` et `./dev-seed` |
| `apps/web/package.json` | dépendances `@epilove/contracts`, `@epilove/crypto`, `@epilove/media`, `@orpc/tanstack-query`, `@tanstack/react-query`, `centrifuge`, `motion` |
| `packages/contracts/src/index.ts`, `packages/api/src/router.ts` | module `dev` (ajout d'une ligne) |
| `packages/core/src/index.ts` | `messaging/ids`, `policies/profile-access` (ajout) |
| `packages/db/src/seeds/index.ts` | seed `questions` (ajout) |
| `infra/scripts/cloud-docker.sh` | repli sur l'image Docker Hub `darthsim/imgproxy` (même version) quand le proxy de la session cloud bloque les téléchargements de ghcr.io |

## Variables d'environnement

Aucune nouvelle pour l'instant (le seed utilise `S3_*`, `ENCRYPTION_*`, `EMAIL_HMAC_SECRET`, déjà présentes).

## Migrations

Aucune pour l'instant.

## Mises à jour souhaitées dans CLAUDE.md / README / docs

- `CLAUDE.md`, section Commandes : ajouter `pnpm db:seed:dev` (membres fictifs, photos de synthèse, page `/dev`).

## Points d'intégration

- Les pages `/dev` et les clients API lisent le cookie de développement ; une fois Better Auth branché par A, `serverApi()` transmet déjà les cookies de la requête : rien à changer côté B.
- Remplacer les prompts et intérêts `dev-` par le catalogue de A (le seed de développement les réutilisera s'ils existent, ou on adaptera `content.ts`).
- Harmoniser la règle « profil complet » avec la complétude de A (PRO-05).

## Questions ouvertes

- Aucune pour l'instant.
