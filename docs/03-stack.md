# 03 — Stack technique

> Versions vérifiées le **2 octobre 2026**. Toutes les versions sont **épinglées** dans le dépôt et mises à jour par Renovate ; ce tableau sert de point de départ, pas de vérité éternelle.

## Philosophie

1. **Un seul langage** : TypeScript de bout en bout (front, API, jobs, contrats partagés). Exception : le solveur du Pacte en Python, isolé.
2. **Peu de pièces, bien choisies.** Le bassin fait quelques milliers de personnes : un serveur européen bien configuré suffit. Pas de Kubernetes, pas de microservices. La qualité vient du soin, des tests et du design, pas de la complexité de l'infrastructure.
3. **Des briques open source et auto-hébergeables** pour tout ce qui touche aux données personnelles, avec des services gérés européens quand c'est plus raisonnable.
4. **Des contrats typés partagés** entre web, API, jobs et la future application mobile.
5. **Ambition maximale là où ça se voit** : le rendu, l'animation, la 3D, le temps réel.

## Vue d'ensemble

| Couche | Choix | Version (oct. 2026) |
|---|---|---|
| Monorepo | pnpm + Turborepo | pnpm 12.8, Turborepo 2.11 |
| Langage | TypeScript (strict) | 7.0 (compilateur natif) |
| Runtime | Node.js | 26 (LTS à partir de fin octobre 2026), 24 LTS en repli |
| Front | Next.js (App Router, React Compiler, Turbopack) | 16.3 |
| UI | React | 19.3 |
| Styles | Tailwind CSS + jetons en variables CSS | 4.3 |
| Primitives UI | shadcn/ui (Radix ou Base UI), restylées | — |
| Animation UI | Motion | 13.5 |
| Animation au défilement | GSAP (ScrollTrigger, SplitText) + Lenis | GSAP 3.15, Lenis 1.3 |
| 3D | three.js (WebGPURenderer + TSL, repli WebGL2) + React Three Fiber + drei | three r186, R3F 9.8 |
| Animations vectorielles | Rive (`@rive-app/react-webgl2`) | 4.36 |
| État serveur côté client | TanStack Query | 5.104 |
| État local | Zustand ; nuqs pour l'état dans l'URL | — |
| Formulaires | React Hook Form + Zod | Zod 4.6 |
| i18n | next-intl | 4.14 |
| PWA | Serwist (`@serwist/turbopack`) | 9.5 |
| API | Hono + oRPC (contrats, OpenAPI) | Hono 4.13, oRPC 1.15 |
| Authentification | Better Auth (email OTP, passkeys, admin) | 1.7 |
| Base de données | PostgreSQL + pgvector + pg_trgm | PostgreSQL 18.6, pgvector 0.8 |
| ORM | Drizzle ORM + drizzle-kit | 0.45 (v1 encore en RC) |
| Cache, limitation de débit | Valkey | 9.0 |
| Temps réel | Centrifugo (WebSocket, repli SSE / HTTP streaming) | 6.9 |
| Jobs et tâches planifiées | Graphile Worker | 0.18 |
| Stockage objet | Cloudflare R2 (juridiction UE) ; SeaweedFS en local | — |
| Images | imgproxy (URL signées, AVIF/WebP) + sharp dans les jobs | — |
| Emails | Brevo ou Scaleway TEM + React Email | — |
| Push | Web Push (VAPID) | — |
| IA locale | Modèles open source servis en interne (plongements, toxicité, nudité, visages) | — |
| IA générative | API Claude (`claude-opus-5-5` par défaut) | — |
| Cartes | MapLibre GL JS + tuiles Protomaps (PMTiles hébergées sur R2) | — |
| Visio (P2) | LiveKit | 1.13 |
| Analytique produit | PostHog (région UE) | — |
| Erreurs | Sentry (région UE) | — |
| Observabilité | OpenTelemetry → Grafana (Loki, Tempo, Prometheus) | — |
| Qualité | Biome, Vitest, Playwright, Storybook, Knip, Lighthouse CI, k6 | Biome 2.5, Vitest 5.0, Playwright 1.63, Storybook 10.6 |
| CI/CD | GitHub Actions + Coolify | Coolify v4 |
| Hébergement | VPS européen (Hetzner ou Scaleway) derrière Cloudflare | — |
| Mobile (P2) | Expo (React Native) | SDK 57 (58 en bêta) |

## Front-end

### Next.js 16.3 pour le site vitrine **et** l'application

- **App Router et React Server Components** : le site vitrine est servi statiquement (SEO, partage), les écrans de l'application chargent leurs données côté serveur puis deviennent interactifs.
- **React Compiler** activé (`reactCompiler: true`, stable) : mémoïsation automatique, moins de `useMemo` manuels.
- **Turbopack** par défaut pour le développement et la construction.
- **Cache Components** (`cacheComponents: true` + `'use cache'`) pour les contenus publics (compteurs de la liste d'attente, pages légales).
- **`proxy.ts`** (remplaçant de `middleware.ts` en v16) pour la redirection d'authentification et la négociation de langue (next-intl).
- **`<ViewTransition>`** de React 19.3, utilisable dans l'App Router sans option expérimentale, pour les transitions carte → profil.
- `next/og` pour générer les images de partage (cartes de profil, Wrapped).

Groupes de routes :

```
apps/web/app/
├── (marketing)/     site vitrine, Pacte, FAQ, pages légales, transparence
├── (auth)/          connexion, vérification, onboarding
├── (app)/           découvrir, likes, messages, campus, profil, réglages
└── api/[[...route]]/ API Hono montée dans Next.js (voir architecture)
```

### Animation et 3D : qui fait quoi

| Besoin | Outil | Pourquoi |
|---|---|---|
| Gestes, ressorts, mises en page animées, deck | **Motion 13** | API déclarative React, `layoutId`, glisser avec vélocité ; `AnimateView` s'appuie sur les View Transitions de React |
| Chorégraphies longues au défilement, découpage de texte | **GSAP 3.15** | Tous les plugins (SplitText, ScrollTrigger…) sont gratuits, y compris en usage commercial. Licence propriétaire : interdiction de créer un outil concurrent de Webflow, sans impact pour nous |
| Défilement adouci | **Lenis 1.3** | Site vitrine uniquement ; respecte la préférence « réduire les animations » |
| Particules, verre, liquide | **three.js r186 + R3F 9.8** | `WebGPURenderer` avec repli automatique en WebGL2 ; shaders écrits en TSL pour cibler les deux. R3F v10 (WebGPU natif) est encore en alpha : rester en v9 |
| Icônes et illustrations interactives | **Rive** | Machines à états, fichiers légers, rendu WebGL2 |

**Compatibilité navigateurs à surveiller** (amélioration progressive obligatoire) :

| Fonctionnalité | État en octobre 2026 | Repli |
|---|---|---|
| WebGPU | Chrome/Edge, Android, Safari 26 ; Firefox sous Windows et macOS Apple Silicon ; pas Firefox Linux/Android | WebGL2 (automatique avec three.js) |
| View Transitions même document | Tous les navigateurs majeurs | — |
| View Transitions entre documents | Chrome, Safari ; pas Firefox | Inutile : l'application est une SPA côté navigation |
| Animations CSS liées au défilement | Chrome, Safari 26 ; Firefox derrière un drapeau | GSAP ScrollTrigger ou Motion |
| Web Push iOS | iOS 16.4+, application ajoutée à l'écran d'accueil ; Declarative Web Push depuis iOS 18.4 | Email, notifications in-app |

### PWA

- **Serwist** avec `@serwist/turbopack` (l'intégration historique `@serwist/next` dépend de webpack).
- Coquille de l'application en cache, page hors ligne, file d'envoi des messages en IndexedDB.
- Manifeste complet (icônes, couleurs, raccourcis, `display: standalone`), écran de démarrage iOS.

## Back-end

### API : Hono + oRPC, montée dans Next.js

- Les **contrats** (procédures, schémas Zod 4 d'entrée et de sortie) vivent dans `packages/contracts`, partagés par le web, l'API et la future application mobile.
- L'API (procédures oRPC sur Hono) est **montée dans Next.js** sous `/api` pour la v1 : un seul déploiement, même origine (cookies simples, pas de CORS). Elle reste un module indépendant (`packages/api`) qu'on peut extraire en service autonome si besoin.
- oRPC génère une spécification **OpenAPI** (documentation interne, client mobile, tests).
- Les composants serveur appellent directement les services du domaine (`packages/core`), sans passer par HTTP.

### Authentification : Better Auth 1.7

- Plugin **email OTP** (cœur) avec une liste blanche de domaines par école, vérifiée côté serveur.
- **Passkeys** (paquet `@better-auth/passkey`, version alignée sur `better-auth`).
- Plugin **admin** : rôles, bannissement, révocation de sessions.
- Sessions en base, limitation de débit intégrée, Turnstile devant les routes d'inscription.
- Contexte : l'équipe de Better Auth maintient aussi Auth.js depuis septembre 2025 (correctifs de sécurité uniquement), et a rejoint Vercel en juillet 2026. La bibliothèque reste open source et auto-hébergée chez nous.
- Option P1 : connexion OpenID Connect avec **Forge ID** (EPITA) via le plugin générique OAuth/OIDC.

### Données : PostgreSQL 18 + Drizzle

- **PostgreSQL 18** : `uuidv7()` natif (identifiants triables dans le temps, parfaits pour les messages), entrées-sorties asynchrones.
- **pgvector** pour les plongements (index HNSW), **pg_trgm** pour la recherche floue du back-office.
- **Drizzle ORM 0.45** : SQL explicite et typé, idéal pour les requêtes de candidats du matching. La v1 est en release candidate : rester sur 0.45 et migrer quand la v1 sera stable.
- Migrations versionnées (drizzle-kit), toujours compatibles avec la version précédente du code (motif *expand / contract*).

### Temps réel : Centrifugo 6.9

- Serveur temps réel open source (Go), un binaire, très économe.
- Les clients se connectent avec un **jeton JWT** émis par notre API ; chaque utilisateur est abonné côté serveur à son canal personnel.
- **Historique et récupération** : après une coupure réseau, le client récupère les événements manqués.
- **Présence**, **replis automatiques** (SSE, HTTP streaming) si un réseau bloque les WebSockets.
- Notre API publie via l'API HTTP de Centrifugo, après validation et écriture en base.

### Jobs : Graphile Worker 0.18

- File de tâches dans PostgreSQL : **un job peut être ajouté dans la même transaction que l'écriture métier** (pas de job perdu, pas de job orphelin).
- Tâches planifiées (crontab) : Drop du soir, nettoyage et rétention, résumés hebdomadaires, re-vérification annuelle.
- Nécessite Node 22.18 ou plus récent.

### Médias

- **Cloudflare R2** en juridiction UE : pas de frais de sortie, URL présignées pour le téléversement direct.
- **imgproxy** : redimensionnement à la volée, AVIF/WebP, **URL signées** (pas d'énumération, pas de lien direct permanent).
- **sharp** dans les jobs : validation, ré-encodage, suppression des métadonnées, aperçu thumbhash.
- En local : **SeaweedFS** (Apache-2.0) compatible S3. MinIO Community Edition n'est plus maintenue depuis février 2026.

### Emails

- **Brevo** ou **Scaleway Transactional Email** (sociétés françaises), gabarits **React Email**.
- Sous-domaine d'envoi dédié, SPF, DKIM 2048 bits aligné, DMARC avec rapports, montée progressive vers `quarantine`.
- **Codes plutôt que liens magiques** : les protections Microsoft 365 des écoles ouvrent automatiquement les liens et consommeraient les jetons.
- Test de délivrabilité vers les **cinq domaines d'école** dès la phase 0 (voir la [roadmap](09-roadmap.md)).

### Intelligence artificielle

| Usage | Approche | Données |
|---|---|---|
| Plongements des prompts et intérêts | Modèle multilingue open source (famille e5 / bge), servi en interne (ONNX Runtime ou conteneur dédié) | Restent chez nous |
| Toxicité des messages | Classifieur multilingue open source, servi en interne | Restent chez nous |
| Images explicites, présence d'un visage | Classifieurs open source servis en interne | Restent chez nous |
| Cas de modération ambigus, pré-tri des signalements | API Claude, `claude-opus-5-5` par défaut, effort `low`, sorties structurées, API Batch pour le non-urgent, gestion de `stop_reason: "refusal"` | Extraits minimisés et pseudonymisés |
| Brise-glace personnalisés (facultatif) | API Claude | Prompts des deux profils, sans prénom |

Le choix d'un modèle plus léger (Claude Sonnet 5.5 ou Haiku 4.5) pour réduire les coûts se fera après mesure sur un jeu d'évaluation, pas a priori.

## Qualité et outillage

| Besoin | Outil | Remarque |
|---|---|---|
| Formatage et lint | **Biome 2.5** | + règles React Hooks / React Compiler via `eslint-plugin-react-hooks` dans une configuration ESLint minimale |
| Typage | **TypeScript 7** | Compilateur natif, ~10× plus rapide. Pas encore d'API programmatique stable : garder TypeScript 6 (`@typescript/typescript6`) pour les outils qui en dépendent |
| Tests unitaires et d'intégration | **Vitest 5** | Testcontainers pour PostgreSQL ; fast-check pour les tests par propriétés |
| Tests de bout en bout | **Playwright 1.63** | Scénarios à plusieurs navigateurs (deux utilisateurs qui matchent et discutent), axe pour l'accessibilité |
| Composants | **Storybook 10** | Documentation et tests visuels |
| Code mort | **Knip** | — |
| Performance | **Lighthouse CI** | Budgets bloquants |
| Charge | **k6** | WebSocket et pic de la révélation du Pacte |
| Dépendances | **Renovate** | Regroupement hebdomadaire |
| Sécurité | CodeQL, Gitleaks, Trivy, OWASP ZAP | Voir [07](07-confiance-securite.md) |
| Conventions | Conventional Commits, lefthook | — |

## Infrastructure

- **Production** : un VPS européen (4 vCPU, 16 Go de RAM, NVMe) chez **Hetzner** (meilleur rapport prix/performance) ou **Scaleway** (si « hébergé en France » compte pour la communication). Un second VPS plus petit pour la préproduction.
- **Coolify v4** : déploiements depuis GitHub, environnements de prévisualisation par pull request, gestion des conteneurs, sauvegardes.
- **Cloudflare** devant : DNS, CDN, WAF, Turnstile, R2, **Cloudflare Access** pour protéger le back-office.
- **Sauvegardes** PostgreSQL continues (archivage WAL) chiffrées vers R2, restauration testée chaque mois.
- **Secrets** : gestionnaire dédié (Infisical) ou variables chiffrées de Coolify ; jamais dans Git.

## Services tiers

| Service | Usage | Contraintes connues (octobre 2026) |
|---|---|---|
| Apple iTunes Search API | « Mon son du moment » (extraits de 30 s) | Sans clé, ~20 appels/min ; lecture en streaming uniquement, pas de mise en cache, attribution et lien vers le store obligatoires |
| Deezer (API simple) | Alternative pour la recherche musicale | Recherche sans authentification fonctionnelle ; création de nouvelles applications OAuth fermée |
| Spotify | **Écarté** | Depuis 2025-2026, quota étendu réservé aux organisations de plus de 250 000 utilisateurs actifs ; mode développement limité à 5 utilisateurs |
| GIPHY | GIF dans les messages (P1) | Clé bêta gratuite (100 appels/h) ; clé de production soumise à validation et payante |
| Tenor (Google) | **Écarté** | API fermée le 30 juin 2026 |
| Steam Web API | Profil joueur (P2, facultatif) | Données récupérées uniquement à la demande de l'utilisateur |
| Riot Games API | Profil joueur (P2, facultatif) | Clé de production soumise à validation (prototype, domaine, CGU, politique de confidentialité) |

Pour les GIF, l'alternative la plus robuste est une **bibliothèque de stickers maison** aux couleurs des écoles, complétée par GIPHY si la clé de production est obtenue.

## Décisions d'architecture (ADR)

Chaque décision structurante est consignée dans `docs/adr/` (modèle : [0000-template.md](adr/0000-template.md)). Décisions initiales :

| # | Décision | Alternatives écartées | Raison principale |
|---|---|---|---|
| 001 | Monorepo pnpm + Turborepo | Nx, dépôts séparés | Simple, rapide, partage de contrats et de jetons |
| 002 | Next.js pour vitrine et application | TanStack Start, SvelteKit, Astro + SPA Vite | Un seul framework, écosystème React (R3F, Motion, Rive), SEO et images de partage, familiarité de l'équipe |
| 003 | VPS européen + Coolify | Vercel + services gérés ; Supabase ; Cloudflare Workers + Durable Objects | Coût fixe et bas, données en UE, WebSocket et jobs longs sans contorsion. Contrepartie : exploitation à notre charge (atténuée par Coolify, sauvegardes, supervision) |
| 004 | PostgreSQL + Drizzle | Convex, Supabase, Prisma | Données relationnelles avec contraintes fortes, requêtes de matching en SQL explicite, compétence transférable |
| 005 | Centrifugo | Socket.IO, Ably, Pusher, Supabase Realtime, SSE maison | Récupération d'historique, présence, replis réseau, scalable, open source, sans code à maintenir |
| 006 | Better Auth | Clerk, Auth.js, Supabase Auth | Auto-hébergé, plugins OTP / passkeys / admin, données chez nous |
| 007 | oRPC | tRPC, REST manuel | Contrats partagés + OpenAPI pour le mobile |
| 008 | Graphile Worker | BullMQ, Inngest, Trigger.dev | Transactions communes avec les écritures métier, pas d'infrastructure en plus |
| 009 | Pas de chiffrement de bout en bout en v1 | Protocole Signal, MLS | Incompatible avec une modération efficace des signalements et complexe en multi-appareils sur le web. Compensé par le chiffrement applicatif au repos et des accès stricts. À réévaluer |
| 010 | PWA d'abord, Expo ensuite | Expo dès le départ, Capacitor | Une seule base de code pour le lancement ; le natif seulement si l'usage le justifie |
| 011 | IA locale d'abord, LLM en dernier palier | LLM sur chaque message | Coût, confidentialité, latence |
| 012 | Pacte calculé en Python | TypeScript | Écosystème de graphes et d'optimisation (networkx, OR-Tools) |

## Application mobile (P2)

Si l'usage le justifie (notifications plus fiables, présence sur les stores) : **Expo** (SDK 57 stable ; SDK 58 en bêta), Expo Router, Reanimated, Gesture Handler, Skia. Réutilisation de `packages/contracts`, `packages/core` (logique pure) et `packages/tokens`. Publication sur les stores avec les exigences de modération des contenus générés par les utilisateurs (signalement, blocage, filtrage), déjà couvertes.
