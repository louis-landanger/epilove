# Epilove

> Nom de code. Application de rencontre **et** d'amitié réservée aux étudiantes et étudiants vérifiés du campus IONIS de Lyon : **EPITA, ESME, Sup'Biotech, ISG, IPSA**.

**Statut : phase 0 (cadrage), octobre 2026.** Le plan complet est dans [`docs/`](docs/) et le socle technique du sprint 0 est en place (monorepo, CI, environnement local). Voir la [roadmap](docs/09-roadmap.md#sprint-0--les-dix-premières-actions).

*Projet étudiant indépendant, non affilié à IONIS Education Group ni aux écoles citées.*

## L'essentiel en 30 secondes

- **Une communauté fermée et vérifiée** : inscription uniquement avec l'email de son école. Une adresse = une personne = un compte.
- **Discret par défaut** : prénom seul, possibilité de se masquer de son école, de sa promo ou de personnes précises, notifications neutres.
- **Des rituels plutôt que du swipe infini** : like ciblé avec commentaire, *Drop* de 5 profils chaque soir à 21 h, et **le Pacte** : un grand matching unique révélé à tout le campus au même moment.
- **Ancré dans la vraie vie** : événements des BDE, lieux de rendez-vous lyonnais, kit de sécurité pour les dates.
- **Gratuit, sans abonnement**, financé par des partenariats.
- **Un design de niveau Awwwards** : champ de particules en WebGPU, cartes holographiques aux couleurs des écoles, transitions fluides, tout en restant rapide et accessible.
- **Lancement : jeudi 11 février 2027, 20 h**, avec la révélation du premier Pacte.

## Le plan

| # | Document | Contenu |
|---|---|---|
| 00 | [Vision produit](docs/00-vision.md) | Constat, taille du bassin, proposition, personas, principes, positionnement, nom, indicateurs |
| 01 | [Fonctionnalités](docs/01-fonctionnalites.md) | Catalogue priorisé (P0 → R&D), règles et quotas, parcours, idées écartées |
| 02 | [Design](docs/02-design.md) | Concept « atomes crochus », identité, motion design, moments signature, landing, design system, accessibilité, performance |
| 03 | [Stack technique](docs/03-stack.md) | Choix et versions vérifiées, services tiers, décisions d'architecture |
| 04 | [Architecture](docs/04-architecture.md) | Schéma, monorepo, domaine, flux principaux, temps réel, conventions d'API |
| 05 | [Données](docs/05-donnees.md) | Modèle, classification, chiffrement, index, rétention |
| 06 | [Matching](docs/06-matching.md) | Éligibilité, compatibilité, score réciproque, équité, Drop, Pacte |
| 07 | [Confiance et sécurité](docs/07-confiance-securite.md) | Modération, équipe, paliers automatiques, sécurité applicative, incidents |
| 08 | [Juridique et RGPD](docs/08-juridique-rgpd.md) | Association, données sensibles, AIPD, conservation, DSA, relations avec les écoles |
| 09 | [Roadmap](docs/09-roadmap.md) | Phases, jalons, go/no-go, lignes de coupe, capacité, équipe, sprint 0 |
| 10 | [Lancement](docs/10-lancement.md) | Course des écoles, ambassadeurs, partenariats, réseaux, entonnoir, crise |
| 11 | [Qualité et exploitation](docs/11-qualite-ops.md) | Tests, CI/CD, observabilité, analytique, sauvegardes, runbooks, coûts |

## La stack en une ligne

TypeScript partout · monorepo pnpm + Turborepo · Next.js 16 + React 19 · Tailwind CSS 4 · Motion, GSAP, Lenis, three.js (WebGPU) et Rive · Hono + oRPC · Better Auth · PostgreSQL 18 + pgvector + Drizzle · Centrifugo · Graphile Worker · Valkey · Cloudflare R2 + imgproxy · un VPS européen avec Coolify derrière Cloudflare. Détails et justifications dans [03 — Stack](docs/03-stack.md).

## Décisions ouvertes

| Décision | Recommandation | Échéance |
|---|---|---|
| Nom public | « Atomes » (signature : « Trouve tes atomes crochus. »), vote des ambassadeurs, vérifications INPI et domaines | Fin octobre 2026 |
| Extension aux autres écoles IONIS de Lyon (site de Jean Macé : Epitech, ISEG, e-artsup…) | Lancer avec les cinq écoles, prendre contact dès la phase 0, et étendre pour le Pacte si la liste d'attente reste sous 600 inscrits mi-décembre | Mi-décembre 2026 |
| Structure juridique | Association loi 1901 inter-écoles dédiée | Octobre 2026 |
| Hébergeur | Hetzner (prix) ou Scaleway (hébergement en France) | Phase 0 |
| Masquage de la promo activé par défaut | À trancher par un test utilisateur | Phase 1 |
| Deck ouvert le soir du lancement ou une semaine après | Selon l'avancement, décidé au go/no-go | 9 février 2027 |
| Usage de l'API Claude (modération ambiguë, brise-glace) et choix du modèle | Défaut `claude-opus-5-5`, modèle plus léger seulement après évaluation | Phase 2 |

## Démarrer en local

Prérequis : Node 24 (voir `.node-version`), Corepack (`corepack enable`), Docker.

```bash
pnpm install
cp .env.example .env
pnpm services:up          # PostgreSQL, Valkey, Centrifugo, SeaweedFS, imgproxy, Mailpit
pnpm db:migrate && pnpm db:seed
pnpm dev                  # http://localhost:3000
```

Vérifications : `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`. Toutes les commandes sont décrites dans [`CLAUDE.md`](CLAUDE.md#commandes).

| Dossier | Contenu |
|---|---|
| `apps/web` | Next.js 16 : site, application, API montée sous `/api` |
| `apps/worker` | Jobs et tâches planifiées (Graphile Worker) |
| `packages/core` | Domaine sans framework : écoles et emails, âge, politique de visibilité `canSee`, compatibilité |
| `packages/db` | Schéma Drizzle, migrations, seed |
| `packages/contracts` | Contrats oRPC et schémas Zod partagés, client typé |
| `packages/api` | Routeur Hono + oRPC |
| `packages/tokens` | Jetons de design (source TypeScript, thème Tailwind généré) |
| `packages/config` | Configurations TypeScript partagées |
| `infra/` | Services locaux (Docker Compose), configuration Centrifugo et SeaweedFS |

## Contribuer

Le plan est une proposition : ouvrez une issue ou une pull request pour le discuter. Les décisions structurantes sont consignées dans [`docs/adr/`](docs/adr/0000-template.md). Les vulnérabilités se signalent en privé (voir [SECURITY.md](SECURITY.md)).
