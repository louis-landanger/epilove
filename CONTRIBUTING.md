# Modifier Atomes, de l'idée au serveur de dev

Ce guide décrit le circuit complet d'une modification : préparer son poste, trouver le bon fichier, vérifier, committer, faire relire, puis mettre en ligne sur le serveur de développement partagé. Pour les interventions directement sur le serveur (accès SSH, déploiement, retour arrière, variables, base de données), voir [`infra/dev-host/EXPLOITATION.md`](infra/dev-host/EXPLOITATION.md).

Références : [`README.md`](README.md) (installation locale), [`CLAUDE.md`](CLAUDE.md) (toutes les commandes, invariants, conventions), [`docs/`](docs/) (le plan : lire le document concerné avant d'implémenter).

## 1. Le circuit en bref

1. Partir d'un `main` à jour et créer une branche.
2. Modifier, regarder le résultat en local (`pnpm dev`).
3. Vérifier : lint, types, tests (et end-to-end si un parcours change).
4. Committer au format Conventional Commits, en anglais.
5. Pousser la branche, ouvrir une pull request, attendre une CI verte et une relecture.
6. Fusionner dans `main`.
7. Déployer sur le serveur de dev : `bash /opt/atomes/infra/dev-host/update.sh`.

## 2. Préparer son poste (une seule fois)

Prérequis : Node 24 (`.node-version`), Corepack, Docker, [uv](https://docs.astral.sh/uv/) pour le solveur du Pacte.

```bash
git clone git@github.com:louis-landanger/epilove.git atomes && cd atomes
corepack enable
pnpm install              # installe aussi les hooks Git (lefthook)
cp .env.example .env      # valeurs de développement uniquement
pnpm services:up          # PostgreSQL, Valkey, Centrifugo, SeaweedFS, imgproxy, Mailpit
pnpm db:migrate && pnpm db:seed
pnpm db:seed:dev          # 400 membres fictifs avec photos et conversations
```

Dans une session Claude Code dans le cloud, démarrer Docker d'abord : `bash infra/scripts/cloud-docker.sh`.

## 3. Avant chaque modification

```bash
git switch main && git pull
git switch -c feat/DEC-02-commentaire-like   # type/IDENTIFIANT-description
pnpm install               # seulement si pnpm-lock.yaml a changé
pnpm services:up           # si Docker a été arrêté
pnpm db:migrate            # si de nouvelles migrations sont arrivées avec le pull
pnpm dev                   # app, back-office et worker
```

- **Nom de branche** : le type du commit (`feat`, `fix`, `docs`…), puis l'identifiant de la fonctionnalité quand il y en a un (`DEC-02`, `SAF-04`… définis dans [`docs/01-fonctionnalites.md`](docs/01-fonctionnalites.md)), puis quelques mots.
- **Lire le document concerné** dans `docs/` avant de coder : le comportement attendu, les textes et les règles y sont souvent déjà décrits.

## 4. Où modifier quoi

| Je veux… | Fichiers | Ensuite |
|---|---|---|
| Changer un texte de l'interface | `apps/web/messages/fr/<espace>.json` **et** `apps/web/messages/en/<espace>.json` (mêmes clés) | Retrouver la clé : `grep -rn "le texte" apps/web/messages/fr` |
| Retoucher la page d'accueil | `apps/web/components/acces/marketing/` : `hero.tsx` (et le match : `match/match-stage.tsx`, profils fictifs et matchs dans `match/people.ts`, leurs prompts dans `messages/*/home.json`), `manifesto.tsx`, `how-it-works.tsx`, `race-section.tsx`, `pact-section.tsx`, `safety-section.tsx`, `faq-section.tsx`, `site-header.tsx`, `site-footer.tsx` ; styles dans `marketing.css` ; animations au défilement dans `motion/choreography.ts` | L'ordre des sections est dans `apps/web/components/acces/marketing/landing.tsx` (commun à l'accueil et aux héros à l'étude) |
| Essayer un autre héros sans toucher à l'accueil | `apps/web/app/(marketing)/apercu/[variante]/page.tsx` : une entrée par héros à l'étude (`jeu` : le test de chimie, dans `apps/web/components/acces/marketing/jeu/`) ; le reste de la page est celui de l'accueil | Visible sur `/apercu/<variante>` (non indexée) ; pour l'adopter, le passer à `Landing` dans `apps/web/app/(marketing)/page.tsx` |
| Modifier les particules (atomes) de l'accueil | Formes et trajectoires : `packages/three/src/ion-field/formations.ts` ; ce que chaque section demande : `apps/web/components/acces/marketing/ion-field/journey.ts` ; cartes de profil de l'accueil (ou élément marqué `data-field-atom` d'un héros à l'étude) lues sur la page : `apps/web/components/acces/marketing/ion-field/ion-field-canvas.tsx` | En local, `?field=live` force le rendu même sur un rendu logiciel, et `&particles=8000` impose le nombre de particules (pour juger la densité d'un GPU plus rapide) |
| Changer une couleur, une police, un rayon, une ombre | `packages/tokens/src/tokens.ts` | `pnpm --filter @atomes/tokens generate` (régénère `theme.gen.css`, à committer) |
| Créer ou modifier un composant réutilisable | `packages/ui/src/primitives/` (boutons, champs, dialogues…) ou `packages/ui/src/app/` (avatar, pastille d'école…), et sa story dans `packages/ui/src/stories/` | `pnpm --filter @atomes/ui storybook`, puis `pnpm --filter @atomes/ui test:visual --update-snapshots` si le changement visuel est voulu |
| Modifier un écran de l'app | Pages : `apps/web/app/(app)/<route>/page.tsx` (découvrir, likes, messages, profil, réglages…), `(auth)/` (connexion, onboarding) ; composants : `apps/web/components/acces/` (vitrine, inscription, profil, réglages, sécurité) ou `apps/web/components/rencontre/` (découverte, messagerie, Pacte, vie de campus) | Next.js 16 diffère des versions connues : lire `apps/web/node_modules/next/dist/docs/` avant d'écrire du code |
| Modifier le back-office | `apps/admin/app/(staff)/` | Rôle nécessaire : `pnpm db:promote <email> moderator` (ou `admin`) |
| Ajouter ou modifier une route d'API | Contrat (schémas Zod) : `packages/contracts/src/<module>.ts` ; implémentation : `packages/api/src/modules/<module>.ts` ; branchement : `packages/api/src/router.ts` | Lectures de données personnelles uniquement via les politiques de `packages/core` (`canSee`, `canViewProfile`, `canMessage`…) |
| Changer une règle métier (éligibilité, matching, quotas) | `packages/core/src/` (sans dépendance à un framework) | Tests unitaires obligatoires à côté du code |
| Changer la base de données | `packages/db/src/schema/*.ts` | `pnpm db:generate` puis committer `packages/db/drizzle/` ; voir § 4.2 |
| Changer les données de référence (écoles, catalogues, questionnaire, Spots) | `packages/db/src/seeds/` | `pnpm db:seed` (idempotent) |
| Ajouter une tâche de fond ou planifiée | `apps/worker/src/tasks/<domaine>/`, déclarée dans `apps/worker/src/tasks/index.ts` (`taskList`, `crontab`) | `pnpm drop:run`, `pnpm pact:demo --reveal-in 60` pour tester le Drop et le Pacte |
| Ajouter une variable d'environnement | `.env.example` (documentée) | Voir § 4.3 : Turborepo et le serveur ne la voient pas tout seuls |
| Ajouter une dépendance | `pnpm --filter <paquet> add --save-catalog <dépendance>` | Une dépendance avec un script d'installation doit être revue puis ajoutée à `allowBuilds` |
| Prendre une décision structurante | Nouvel ADR à partir de `docs/adr/0000-template.md` | Même pull request que le code |

### 4.1 Textes de l'interface

- Chaque espace de textes existe en français et en anglais : `apps/web/messages/fr/home.json` et `apps/web/messages/en/home.json`, par exemple. Un test vérifie que les deux langues ont exactement les mêmes clés : ajouter une clé dans une seule langue fait échouer `pnpm test`.
- Ton : tutoiement, léger et inclusif, jamais graveleux ; les textes de sécurité et juridiques restent sobres ([`docs/02-design.md`](docs/02-design.md), section Ton éditorial).
- Les noms des écoles servent uniquement à décrire l'éligibilité : jamais de logo ni de charte graphique d'école.

### 4.2 Base de données

1. Modifier le schéma dans `packages/db/src/schema/`.
2. `pnpm db:generate` : écrit une migration SQL dans `packages/db/drizzle/`. La relire, puis la committer avec le schéma.
3. `pnpm db:migrate` pour l'appliquer en local.

Une migration doit rester compatible avec la version précédente du code : ajouter une colonne nullable ou avec une valeur par défaut, et ne supprimer une colonne qu'une fois plus aucun code ne la lit. La CI échoue si le schéma change sans migration. Le serveur de dev applique les migrations à chaque déploiement.

### 4.3 Variables d'environnement

1. L'ajouter dans `.env.example`, avec un commentaire et une valeur de développement si elle est obligatoire.
2. Turborepo fonctionne en mode strict : une variable lue par les tests doit figurer dans `passThroughEnv` de la tâche `test` de `turbo.json`, sinon elle est invisible pendant `pnpm test`. Les variables `NEXT_PUBLIC_*` sont intégrées au build.
3. **Le serveur de dev ne la reçoit pas automatiquement** : son `.env` est créé une seule fois. L'ajouter à la main avant ou juste après le déploiement ([`EXPLOITATION.md`, § 5](infra/dev-host/EXPLOITATION.md#5-variables-denvironnement)).
4. Jamais de secret réel dans Git.

## 5. Voir le résultat en local

| Adresse | Usage |
|---|---|
| http://localhost:3000 | L'app et la vitrine (`/en` pour les pages publiques en anglais) |
| http://localhost:3000/dev | Choisir un des 400 membres fictifs, sans se connecter |
| http://localhost:3001 | Back-office (donner un rôle d'abord : `pnpm db:promote <email> moderator` ou `admin`) |
| http://localhost:8025 | Mailpit : tous les e-mails envoyés, codes de connexion compris |
| http://localhost:6006 | Storybook du design system (`pnpm --filter @atomes/ui storybook`) |

- **Vérifier aussi** : l'affichage sur mobile (outils de développement du navigateur, puis un vrai téléphone via le serveur de dev), le clavier seul, le mode « mouvement réduit » du système, et l'anglais.
- **Sur un vrai téléphone** : déployer la branche sur le serveur de dev (§ 9) et ouvrir l'adresse du serveur.

## 6. Vérifier avant de pousser

| Commande | Quand |
|---|---|
| `pnpm lint` (ou `pnpm lint:fix` pour corriger) | Toujours ; le hook de commit corrige déjà le formatage des fichiers committés |
| `pnpm typecheck` | Toujours |
| `pnpm test` | Toujours (services démarrés : les tests de base de données relancent le seed de développement) |
| `pnpm build` | Si la configuration, les routes ou les dépendances changent |
| `pnpm test:e2e` | Si un parcours change (inscription, découverte, messagerie, accueil…) ; `PW_CHROMIUM_PATH` pour utiliser un Chromium déjà installé |
| `pnpm lighthouse` | Si l'accueil ou ses performances changent (budgets mobiles bloquants) |
| `pnpm --filter @atomes/ui test:visual` | Si un composant de `packages/ui` change |

**Toute correction de bug commence par un test qui le reproduit** : le test échoue avant la correction, passe après.

Les images de référence des tests visuels (`packages/ui/visual/__screenshots__/`) sont rendues par le Chromium de Playwright, celui de la CI : l'installer avec `pnpm --filter @atomes/ui exec playwright install chromium` pour comparer à l'identique. Avec une autre version de Chromium, le rendu du texte et de certaines couleurs varie de quelques pour cent. En cas d'écart, la CI fait foi : l'artefact `visual-diffs` du workflow Design system contient les images qu'elle a obtenues.

## 7. Committer

Format [Conventional Commits](https://www.conventionalcommits.org/), en anglais, imposé par le hook `commit-msg` :

```
type(portée): ce que fait le commit, à l'impératif

Pourquoi ce changement, ce qu'il corrige, ce qu'il faut savoir.
```

- Types acceptés : `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- Portée : le paquet ou l'app concernée, en minuscules (`web`, `api`, `db`, `core`, `worker`, `ui`, `infra`…).
- Exemples : `feat(web): add a comment field to targeted likes`, `fix(api): keep blocked members out of the Drop`.
- Un commit = un changement cohérent. Jamais de `.env` ni de secret.

## 8. Pousser et faire relire

```bash
git push -u origin feat/DEC-02-commentaire-like
```

Puis ouvrir une pull request sur GitHub vers `main`. Le modèle de description demande l'identifiant de la fonctionnalité, les changements, comment tester et une checklist (tests, téléphone réel, accessibilité, vie privée, textes, documentation).

Vérifications automatiques sur chaque pull request :

| Workflow | Contenu |
|---|---|
| CI › Lint, types, tests | Biome, TypeScript, tests unitaires et d'intégration, migrations conformes au schéma |
| CI › Build and end-to-end tests | Build de production, Playwright + axe sur l'app et le back-office |
| CI › Pact solver | Ruff et pytest du solveur Python |
| Lighthouse | Budgets de performance mobiles (sur une pull request, seulement si `apps/web`, `packages/ui`, `packages/three` ou `packages/tokens` changent) |
| Design system | Storybook et tests visuels (sur une pull request, seulement si `packages/ui` ou `packages/tokens` changent) |

Les mêmes workflows tournent à nouveau après chaque fusion dans `main`.

- Fusionner seulement quand tout est vert. Si un job échoue, ouvrir son journal sur GitHub et relancer la même commande en local pour reproduire.
- Les chemins sensibles (politiques d'accès, migrations, API, `infra/`, `.github/`) demandent la relecture de leur responsable (`.github/CODEOWNERS`).
- Un document devenu faux est corrigé dans la même pull request que le code qui l'a rendu faux.
- Pousser directement sur `main` reste possible pour une retouche minime, mais la CI ne la vérifie qu'après coup : à éviter dès que du code change.

## 9. Mettre en ligne sur le serveur de dev

Le serveur ne se met pas à jour tout seul. Une fois la pull request fusionnée :

```bash
ssh root@<adresse-du-serveur>
bash /opt/atomes/infra/dev-host/update.sh
```

Le script récupère `main`, installe les dépendances, reconstruit, applique les migrations et redémarre l'app, le back-office et le worker (quelques minutes). Ensuite, recharger le site sans le cache (Ctrl+Maj+R, ou Cmd+Maj+R sur Mac).

- **Tester une branche avant de la fusionner** : `bash /opt/atomes/infra/dev-host/update.sh feat/DEC-02-commentaire-like`. Toute l'équipe voit alors cette branche ; revenir à `main` avec `update.sh` sans argument.
- **Nouvelle variable d'environnement** : l'ajouter dans `/opt/atomes/.env` sur le serveur (§ 4.3).
- Accès, retour arrière, journaux et dépannage : [`infra/dev-host/EXPLOITATION.md`](infra/dev-host/EXPLOITATION.md).

## 10. Avec Claude Code

Claude Code lit `CLAUDE.md` à chaque session : commandes, invariants et conventions sont déjà connus.

1. Ouvrir une session sur le dépôt et décrire la modification en citant l'identifiant de la fonctionnalité ou le document concerné (« DEC-02 : ajoute un commentaire au like ciblé, voir docs/01-fonctionnalites.md »).
2. Pour un changement visuel, demander des captures d'écran sur ordinateur et sur mobile ; pour tout changement, demander que lint, types et tests passent avant le commit.
3. La session pousse sur sa propre branche (`claude/…`) : demander une pull request, relire le diff sur GitHub, fusionner quand la CI est verte.
4. Déployer sur le serveur de dev (§ 9), qui reste une étape manuelle.

## 11. Règles à ne jamais enfreindre

Le détail est dans [`CLAUDE.md`](CLAUDE.md#invariants-à-ne-jamais-enfreindre). En résumé :

- toute lecture de données liées à une personne passe par les politiques d'accès de `packages/core` (blocages, masquages, pauses, bannissements) ;
- aucune donnée personnelle dans les journaux, les erreurs ou l'analytique (ni email, ni prénom, ni message, ni préférence) ;
- les préférences de genre et d'orientation sont des données sensibles : consentement explicite séparé, jamais exportées ;
- corps de messages chiffrés, médias servis uniquement par URL signées et expirantes ;
- âge minimum 18 ans, contrôle bloquant ;
- likes, messages et signalements idempotents et soumis à des quotas ;
- le serveur de dev ne contient que des données fictives : pas de vraies inscriptions, pas de vraies photos.

## 12. En cas de souci

| Symptôme | Piste |
|---|---|
| `Cannot connect to the Docker daemon` | Démarrer Docker (Docker Desktop, ou `bash infra/scripts/cloud-docker.sh` dans le cloud), puis `pnpm services:up` |
| Erreurs de base de données après un `git pull` | `pnpm db:migrate`, puis `pnpm db:seed` |
| Base locale incohérente | `pnpm services:reset` (efface les données locales), puis `pnpm services:up`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm db:seed:dev` |
| `Cannot find module` après un `git pull` | `pnpm install` |
| Commit refusé : « Commit message must follow Conventional Commits » | Reprendre le message au format `type(portée): description` |
| `pnpm lint` en erreur | `pnpm lint:fix`, puis corriger à la main ce qui reste |
| Port 3000 ou 3001 déjà utilisé | Un ancien `pnpm dev` tourne encore : l'arrêter (Ctrl+C dans son terminal) |
| `pnpm test` échoue sur une variable manquante | Comparer `.env` avec `.env.example`, et vérifier `passThroughEnv` dans `turbo.json` (§ 4.3) |
| Une modification de couleur ne s'affiche pas | `pnpm --filter @atomes/tokens generate` |
