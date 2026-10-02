# CLAUDE.md

Contexte pour les assistants de code travaillant sur ce dépôt.

## Le projet

Epilove (nom de code) : application de rencontre et d'amitié réservée aux étudiants vérifiés du campus IONIS de Lyon (EPITA, ESME, Sup'Biotech, ISG, IPSA). Le plan complet est dans `docs/` : **lire le document concerné avant d'implémenter une fonctionnalité**. Les fonctionnalités ont des identifiants stables (`DEC-02`, `SAF-04`…) définis dans `docs/01-fonctionnalites.md` ; les citer dans les issues, branches et PR.

Statut : phase 0, socle technique en place (sprint 0). La stack et l'organisation du monorepo sont décrites dans `docs/03-stack.md`, `docs/04-architecture.md` et `docs/adr/0001-socle-technique-sprint-0.md`.

## Commandes

Prérequis : Node 24 (`.node-version`), Corepack activé (`corepack enable`), Docker.

| Commande | Rôle |
|---|---|
| `pnpm install` | Installe les dépendances (et les hooks git lefthook) |
| `cp .env.example .env` | Variables locales (valeurs de développement uniquement) |
| `pnpm services:up` / `services:down` / `services:reset` | Services locaux Docker : PostgreSQL 18 + pgvector, Valkey, Centrifugo, SeaweedFS, imgproxy, Mailpit (http://localhost:8025) |
| `pnpm db:migrate` / `pnpm db:seed` | Migrations et données de référence (campus, écoles) |
| `pnpm db:generate` | Génère une migration après modification du schéma Drizzle (à committer) |
| `pnpm dev` | Web (http://localhost:3000) et worker en mode développement |
| `pnpm lint` / `pnpm lint:fix` | Biome (lint + formatage) |
| `pnpm typecheck` | TypeScript dans tous les paquets |
| `pnpm test` | Tests unitaires et d'intégration (les tests base de données demandent `DATABASE_URL` et les services démarrés) |
| `pnpm build` | Build de production |
| `pnpm test:e2e` | Playwright + axe sur le build (`PW_CHROMIUM_PATH` pour utiliser un Chromium déjà installé) |
| `pnpm --filter @epilove/tokens generate` | Régénère `theme.gen.css` après modification des jetons |

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
