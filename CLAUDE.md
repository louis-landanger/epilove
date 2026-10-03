# CLAUDE.md

Contexte pour les assistants de code travaillant sur ce dépôt.

## Le projet

Epilove (nom de code) : application de rencontre et d'amitié réservée aux étudiants vérifiés du campus IONIS de Lyon (EPITA, ESME, Sup'Biotech, ISG, IPSA). Le plan complet est dans `docs/` : **lire le document concerné avant d'implémenter une fonctionnalité**. Les fonctionnalités ont des identifiants stables (`DEC-02`, `SAF-04`…) définis dans `docs/01-fonctionnalites.md` ; les citer dans les issues, branches et PR.

Statut : phase 0, paliers 1 à 3 des sessions A (Accès) et B (Rencontre) fusionnés dans `main` le 3 octobre 2026 ; le développement continue sur `main`. La stack et l'organisation du monorepo sont décrites dans `docs/03-stack.md`, `docs/04-architecture.md` et `docs/adr/0001-socle-technique-sprint-0.md`. Ce que chaque session a livré, ses choix et ses questions ouvertes : `docs/integration/` (`session-a.md`, `session-b.md`, `fusion.md`).

Organisation du code de l'app web : `apps/web/components/acces/` (vitrine, inscription, profil, réglages, sécurité) et `apps/web/components/rencontre/` (découverte, messagerie, Pacte, vie de campus) ; les composants réutilisables vont dans le design system `packages/ui` (catalogue Storybook).

## Commandes

Prérequis : Node 24 (`.node-version`), Corepack activé (`corepack enable`), Docker, [uv](https://docs.astral.sh/uv/) pour le solveur du Pacte (`apps/pact-solver`, Python).

| Commande | Rôle |
|---|---|
| `pnpm install` | Installe les dépendances (et les hooks git lefthook) |
| `cp .env.example .env` | Variables locales (valeurs de développement uniquement) |
| `bash infra/scripts/cloud-docker.sh` | Session cloud uniquement : démarre Docker et récupère les images via un miroir (Docker Hub limite les téléchargements anonymes) |
| `pnpm services:up` / `services:down` / `services:reset` | Services locaux Docker : PostgreSQL 18 + pgvector, Valkey, Centrifugo, SeaweedFS, imgproxy, Mailpit (http://localhost:8025) |
| `pnpm db:migrate` / `pnpm db:seed` | Migrations (y compris le schéma de Graphile Worker) et données de référence (campus, écoles, catalogues, questionnaire, Spots) |
| `pnpm db:seed:dev` | Données de développement : 400 membres fictifs (photos de synthèse, conversations), choix du membre courant sur http://localhost:3000/dev ; idempotent, refusé hors développement et test |
| `pnpm db:promote <email> <rôle>` | Donne un rôle du back-office à un compte existant |
| `pnpm db:generate` | Génère une migration après modification du schéma Drizzle (à committer) |
| `pnpm dev` | App (http://localhost:3000), back-office (http://localhost:3001) et worker (photos, vocaux, notifications, Drop, Pacte) en mode développement |
| `pnpm lint` / `pnpm lint:fix` | Biome (lint + formatage) |
| `pnpm typecheck` | TypeScript dans tous les paquets |
| `pnpm test` | Tests unitaires et d'intégration (les tests base de données demandent `DATABASE_URL` et les services démarrés ; ils relancent le seed de développement) |
| `pnpm build` | Build de production |
| `pnpm test:e2e` | Playwright + axe sur le build, app et back-office (`PW_CHROMIUM_PATH` pour utiliser un Chromium déjà installé) |
| `pnpm lighthouse` | Budgets Lighthouse (mobile) sur le build de l'app |
| `pnpm --filter @epilove/ui storybook` / `test:visual` | Catalogue du design system (http://localhost:6006) et tests visuels (`--update-snapshots` après un changement voulu) |
| `pnpm --filter @epilove/tokens generate` | Régénère `theme.gen.css` après modification des jetons |
| `pnpm pact:compute` / `pnpm pact:demo --reveal-in 60` | Calcule une saison du Pacte (solveur Python) / prépare une saison de démonstration révélée dans 60 s (le worker doit tourner) |
| `pnpm drop:run` | Lance le Drop du soir sans attendre 21 h |
| `sudo bash infra/dev-host/setup.sh` / `update.sh` | Serveur de développement partagé : toute la stack sur une VM Ubuntu, derrière HTTPS et un mot de passe d'équipe (voir `infra/dev-host/README.md`, ADR 0014) |
| `infra/load/run.sh 3000 180` | Test de charge k6 de la révélation du Pacte (app compilée, worker et services lancés ; voir `infra/load/README.md`) |

Nouvelles dépendances : `pnpm --filter <paquet> add --save-catalog <dépendance>` (versions partagées dans le catalogue de `pnpm-workspace.yaml`) ; les paquets internes s'ajoutent en `workspace:*`. Une dépendance qui exécute un script d'installation doit être revue puis ajoutée à `allowBuilds`.

## Invariants à ne jamais enfreindre

- Toute lecture de données liées à une personne passe par les politiques d'accès de `packages/core` (`canSee`, `canViewProfile`, `canMessage`…). Pas de requête directe qui contourne les blocages, masquages, pauses ou bannissements.
- Aucune donnée personnelle dans les journaux, les erreurs ou l'analytique : ni email, ni prénom, ni message, ni préférence de genre ou d'orientation.
- Les préférences de genre et d'orientation sont des données sensibles (RGPD, article 9) : consentement explicite séparé, jamais exportées.
- Les corps de messages sont chiffrés côté application ; les médias sont servis uniquement via des URL signées et expirantes.
- Âge minimum 18 ans, contrôle bloquant.
- Les noms des écoles servent uniquement à décrire l'éligibilité ; jamais de logo ni de charte graphique d'école.
- Les mutations sensibles (like, message, signalement) sont idempotentes et soumises à des quotas.

## Conventions

- Les outils sont récents (versions d'octobre 2026, souvent plus récentes que les connaissances des modèles) : lire la documentation de la version installée avant de modifier leur configuration (par exemple `node_modules/turbo/docs`, notes de version de Next.js 16, pnpm 12, TypeScript 7).
- TypeScript strict partout ; code, identifiants et commits en anglais ; documentation et textes de l'interface en français (anglais en seconde langue).
- Conventional Commits.
- `packages/core` ne dépend d'aucun framework.
- Toute correction de bug commence par un test qui le reproduit.
- Textes de l'interface : tutoiement, ton léger et inclusif, jamais graveleux ; les textes de sécurité et juridiques restent sobres (voir `docs/02-design.md`, section Ton éditorial).
- Une décision structurante = un ADR dans `docs/adr/`.
