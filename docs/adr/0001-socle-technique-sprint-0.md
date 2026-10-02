# ADR-0001 — Socle technique du sprint 0

- **Statut** : accepté
- **Date** : 2026-10-02

## Contexte

Le sprint 0 initialise le monorepo décrit dans [03 — Stack](../03-stack.md) et [04 — Architecture](../04-architecture.md). Plusieurs outils ont changé de version majeure en 2026 (pnpm 12, TypeScript 7, Node 26 pas encore LTS) : il faut fixer ce qui est réellement utilisé et vérifier que les briques fonctionnent ensemble.

## Décisions

1. **Node.js 24 LTS** (`.node-version`) au démarrage. Node 26 ne devient LTS qu'à la fin octobre 2026 : on passera à 26 à ce moment-là, dans une pull request dédiée.
2. **pnpm 12 via Corepack** (`packageManager` dans `package.json`), avec :
   - un **catalogue** (`pnpm-workspace.yaml`) pour aligner les versions partagées entre paquets ;
   - des **versions exactes** (`savePrefix: ""`), mises à jour par Renovate ;
   - `minimumReleaseAge: 1440` : une version publiée depuis moins de 24 h est refusée (protection contre les paquets compromis, vérifiée dès l'installation de `@types/node`) ;
   - une **liste blanche des scripts d'installation** (`allowBuilds`) : toute nouvelle dépendance qui exécute un script doit être revue.
3. **TypeScript 7** (compilateur natif). Vérifié : `tsc` et la vérification de types de `next build` (Next.js 16.3) fonctionnent.
4. **Biome seul pour le lint et le formatage**, avec les domaines React, Next et test. L'ajout d'ESLint et de `eslint-plugin-react-hooks` (règles du React Compiler) est reporté : `typescript-eslint` s'appuie sur l'API programmatique de TypeScript, qui n'est pas encore stable en v7.
5. **Paquets internes consommés en TypeScript source**, sans étape de build : `transpilePackages` pour Next.js, `tsx` pour le worker et les scripts, Vitest pour les tests.
6. **API montée dans Next.js** sous `/api` (Hono + oRPC), conformément à l'architecture.
7. **Extensions PostgreSQL** (`vector`, `pg_trgm`) créées par une migration Drizzle personnalisée, pour que la production et le local aient exactement le même schéma.
8. **Images Docker épinglées** sur une version majeure ou mineure dans `infra/compose/compose.yaml`.

## Conséquences

- Les commandes du dépôt sont stables et documentées dans `CLAUDE.md` et le README.
- La CI rejoue exactement les vérifications locales (Biome, types, tests avec PostgreSQL, build, Playwright + axe).
- À surveiller : support de TypeScript 7 par `typescript-eslint` (pour ajouter les règles du React Compiler), passage à Node 26 LTS, Drizzle v1 stable.
