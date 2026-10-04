# Développement en deux sessions parallèles

> **Archive.** Les deux sessions ont été fusionnées dans `main` le 3 octobre 2026 (voir [`integration/fusion.md`](integration/fusion.md)) : la propriété des fichiers ci-dessous ne s'applique plus, le développement continue sur `main`. Le document reste pour l'historique des choix.

> Organisation temporaire : deux sessions de développement travaillent en même temps sur deux branches, puis une session d'intégration fusionne le tout. Ce document fixe **qui possède quoi** pour que les deux branches se fusionnent sans douleur.

## Branches

Chaque session est une session **Claude Code cloud** lancée sur la branche de base `main`, depuis un compte différent, avec le prompt correspondant :

| Session | Prompt | Thème |
|---|---|---|
| **A — Accès** | [`docs/prompts/session-a-acces.md`](prompts/session-a-acces.md) | Vitrine, inscription, profil, réglages, confiance, back-office, design system |
| **B — Rencontre** | [`docs/prompts/session-b-rencontre.md`](prompts/session-b-rencontre.md) | Questionnaire, découverte, matchs, messagerie, notifications, Pacte, vie de campus |

Chaque session pousse sur la branche de développement que la plateforme lui assigne et en indique le nom dans ses notes de passation. Les deux partent du même socle commun : schéma de base P0, contexte d'authentification de l'API, paquets `crypto` et `media`, contrat `safety`, i18n.

## Périmètre

### Session A — Accès

| Domaine | Identifiants | Contenu |
|---|---|---|
| Vitrine et liste d'attente | ONB-01, PLT-02 | Landing complète (docs/02, sections 4 et 5) : champ d'ions WebGPU/WebGL2, course des écoles en éprouvettes, Pacte en teaser, FAQ, sécurité ; liste d'attente avec parrainage |
| Authentification | ONB-02, ONB-03, ONB-07, ONB-12 | Better Auth : code à 6 chiffres par email (Mailpit en local), domaines d'école, passkeys, plugin admin, limites de débit ; résolveur de session branché dans `apps/web/lib/server/api-app.ts` (le résolveur de développement reste derrière `DEV_AUTH=1`) |
| Onboarding | ONB-04 à ONB-06 | Majorité, charte, consentement séparé aux données sensibles, parcours en 3 minutes |
| Profil | PRO-01 à PRO-05 | Mon profil (aperçu et édition), photos (upload présigné, job de traitement : type réel, ré-encodage, EXIF supprimé, thumbhash), prompts, intérêts, complétude |
| Réglages et sécurité | SAF-01 à SAF-06, SAF-14, SAF-15 | Bloquer, signaler, masquer école / promo / personnes, pause, notifications discrètes, suppression de compte, page d'aide ; **implémentation du contrat `safety`** |
| Back-office | ADM-01 à ADM-03, ADM-05, ADM-06 | Nouvelle app `apps/admin` : files photos et signalements, actions motivées, journal d'audit, catalogues prompts et intérêts |
| Design system | — | `packages/ui` (primitives et composants de l'app), coquille de l'app `(app)/layout.tsx` avec la navigation à 5 onglets, `proxy.ts` (garde de session, CSP avec nonce) |
| Paliers 2 et 3 | ONB-08 à ONB-11, PRO-06 à PRO-11, SAF-07, SAF-08, SAF-12 à SAF-14, ADM-04, ADM-09, PLT-01, PLT-04, COM-05 | Voir le prompt de la session A |

### Session B — Rencontre

| Domaine | Identifiants | Contenu |
|---|---|---|
| Lecture des membres | — | Chargement des `Member` et `Relations` depuis la base (lecture seule des tables de A), application de `canSee` ; ajout de `canViewProfile` et `canMessage` dans `packages/core` |
| Questionnaire | PAC-01, DEC-05 | Banque de ~45 questions (fr/en), interface de réponse, compatibilité et explications |
| Découverte | DEC-01 à DEC-07 | Deck (cartes physiques, reflet holographique, clavier), like ciblé avec commentaire, likes reçus, filtres, quotas, classement (docs/06), Drop du soir (job) ; profil d'un autre membre |
| Matchs et messagerie | CHAT-01 à CHAT-03, CHAT-13 | Création des matchs, écran « Liaison établie », messagerie temps réel (Centrifugo, outbox, récupération), corps chiffrés, lectures, réactions, brise-glace ; bloquer et signaler via le contrat `safety` |
| Notifications | NOT-01 à NOT-03 | Web Push (service worker), centre de notifications, préférences de notification |
| Pacte | PAC-02, PAC-03 | Saisons, solveur Python (`apps/pact-solver`), page de révélation (compte à rebours, présence, diffusion) |
| Données de développement | — | `pnpm db:seed:dev` : quelques centaines de membres fictifs crédibles (profils, préférences, photos de synthèse, réponses au questionnaire) et page `/dev` de choix du membre courant |
| Paliers 2 et 3 | DEC-07 à DEC-10, CHAT-04 à CHAT-11, SAF-09 à SAF-11, IRL-01 à IRL-05, PAC-04, COM-01 à COM-04, NOT-04 à NOT-06 | Voir le prompt de la session B |

## Propriété des fichiers

Une session **ne modifie pas** les fichiers possédés par l'autre. Les fichiers marqués « partagé » suivent les règles de la section suivante.

| Chemin | A | B |
|---|---|---|
| `apps/web/app/(marketing)/**`, `apps/web/app/(auth)/**` | ✅ | |
| `apps/web/app/(app)/layout.tsx`, `onboarding/**`, `profil/**`, `reglages/**` (sauf `reglages/notifications/**`), `aide/**` | ✅ | |
| `apps/web/app/(app)/decouvrir/**`, `likes/**`, `messages/**`, `membres/**`, `campus/**`, `notifications/**`, `reglages/notifications/**` | | ✅ |
| `apps/web/app/api/auth/**`, `apps/web/proxy.ts`, `apps/web/lib/server/api-app.ts` | ✅ | |
| `apps/web/components/acces/**` | ✅ | |
| `apps/web/components/rencontre/**`, service worker et configuration PWA | | ✅ |
| `apps/web/app/not-found.tsx`, `apps/web/app/terminal/**` | ✅ | |
| `apps/web/app/dev/**` (développement uniquement) | | ✅ |
| Namespaces i18n `apps/web/messages/*/{common,nav,home,marketing,waitlist,auth,onboarding,profile,settings,safety,help,legal}.json` | ✅ | |
| Namespaces i18n `apps/web/messages/*/{discovery,likes,matches,chat,questionnaire,pact,campus,notifications,events,spots}.json` | | ✅ |
| `apps/admin/**` | ✅ | |
| `apps/pact-solver/**` | | ✅ |
| `apps/worker/src/tasks/media/**`, `tasks/accounts/**` | ✅ | |
| `apps/worker/src/tasks/drop/**`, `tasks/outbox/**`, `tasks/notifications/**`, `tasks/pact/**` | | ✅ |
| `packages/auth/**`, `packages/ui/**`, `packages/three/**` (nouveaux) | ✅ | |
| `packages/realtime/**`, `packages/notifications/**` (nouveaux) | | ✅ |
| `packages/media/**` (étendre : upload, traitement) | ✅ | lecture |
| `packages/crypto/**` | lecture | lecture |
| `packages/core/src/{accounts,profiles,safety}/**` | ✅ | |
| `packages/core/src/{policies,matching,discovery,messaging,pact,questionnaire}/**` | | ✅ |
| `packages/db/src/schema/{users,profiles,safety}.ts` et nouveaux fichiers de A (`auth.ts`…) | ✅ | lecture |
| `packages/db/src/schema/{questionnaire,discovery,messaging,notifications,pact,outbox}.ts` et nouveaux fichiers de B (`events.ts`, `spots.ts`, `community.ts`…) | | ✅ |
| `packages/db/src/repositories/{accounts,profiles,safety,waitlist,admin}*.ts` | ✅ | lecture |
| `packages/db/src/repositories/{members,discovery,matches,messaging,questionnaire,pact,notifications,campus}*.ts` | | ✅ |
| `packages/db/src/seeds/{catalog-*}.ts` (prompts, intérêts) | ✅ | |
| `packages/db/src/seeds/questions.ts`, `packages/db/src/seeds/spots.ts`, `packages/db/src/dev-seed/**` | | ✅ |
| `packages/contracts/src/{waitlist,onboarding,profile,media,preferences,safety,account,admin}.ts` | ✅ | |
| `packages/contracts/src/{questionnaire,discovery,matches,messaging,notifications,pact,realtime,campus-life,dev}.ts` | | ✅ |
| `packages/api/src/modules/*` : même découpage que les contrats | | |

Le design system (`packages/ui`) appartient à A. En attendant la fusion, B construit ses composants dans `apps/web/components/rencontre/` avec Tailwind et les jetons de `@atomes/tokens` ; l'harmonisation se fera à l'intégration.

## Fichiers partagés : règles

| Fichier | Règle |
|---|---|
| Agrégateurs : `apps/web/i18n/messages.ts`, `packages/contracts/src/index.ts`, `packages/api/src/router.ts`, `packages/core/src/index.ts`, `packages/db/src/schema/index.ts`, `packages/db/src/seeds/index.ts`, `apps/worker/src/tasks/index.ts` | Ajout seulement : une ligne par module, ordre alphabétique, ne jamais réordonner ni supprimer les lignes existantes |
| `pnpm-workspace.yaml` (catalogue), `package.json` | Ajout seulement. `pnpm-lock.yaml` sera régénéré à la fusion |
| `.env.example` | Ajouter ses variables dans une section commentée `# Session A` ou `# Session B` à la fin du fichier |
| Migrations `packages/db/drizzle/**` | Générer et committer normalement (`pnpm db:generate`). **Toutes les migrations postérieures à `0002_p0_schema` sont jetables** : l'intégration les supprime et en régénère une seule à partir du schéma fusionné |
| `apps/web/next.config.ts`, `turbo.json`, `.github/workflows/ci.yml` | Modifications minimales, expliquées dans les notes de passation |
| `CLAUDE.md`, `README.md`, `docs/0*.md` | Ne pas modifier : noter les mises à jour souhaitées dans les notes de passation |
| ADR | A numérote à partir de `0010`, B à partir de `0020` |

## Coutures entre les deux sessions

| Couture | Fourni par | Utilisé par |
|---|---|---|
| Contrat `safety` (`block`, `unblock`, `report`) : déjà défini, implémentation provisoire `NOT_IMPLEMENTED` | A implémente | B appelle depuis le profil, le deck et la messagerie |
| `ApiContext.viewer` et `requireViewer` / `requireRole` (`packages/api/src/procedures.ts`) | Socle commun ; A branche Better Auth | A et B protègent leurs procédures |
| `photoUrl()` (`packages/media`) : URL imgproxy signées et expirantes | Socle commun | A et B pour afficher les photos |
| `encryptText` / `decryptText`, `emailHmac` (`packages/crypto`) | Socle commun | A (détails des signalements, emails), B (messages) |
| Tables de A (`app_user`, `profile`, `preferences`, `photo`, `prompt_answer`, `block`, `hidden_contact`) | A | B en lecture seule pour construire les `Member` |
| `(app)/layout.tsx` (navigation, garde de session) | A | B y place ses pages |

En développement, B s'authentifie avec l'en-tête `x-dev-user-id` (`DEV_AUTH=1`) et des membres créés par `pnpm db:seed:dev`.

## Notes de passation

Chaque session tient à jour `docs/integration/session-a.md` ou `docs/integration/session-b.md` :

- ce qui est fait, testé, et ce qui ne l'est pas ;
- les modifications apportées aux fichiers partagés ;
- les nouvelles variables d'environnement, dépendances et migrations ;
- les mises à jour souhaitées dans `CLAUDE.md`, le README et la documentation ;
- les points d'intégration à faire et les questions ouvertes.

## Fusion

1. Fusion de A puis de B dans la branche d'intégration.
2. Suppression des migrations postérieures à `0002`, régénération d'une migration unique, régénération de `pnpm-lock.yaml`.
3. Résolution des agrégateurs (union), branchement des coutures (Better Auth, `safety`, navigation).
4. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e` au vert, puis mise à jour de `CLAUDE.md` et du README.
