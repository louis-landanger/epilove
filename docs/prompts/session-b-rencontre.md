# Prompt — Session B (Rencontre)

À coller tel quel dans une nouvelle session **Claude Code cloud** ouverte sur le dépôt `louis-landanger/epilove`, branche de base `main`. Le compte GitHub utilisé doit avoir accès en écriture au dépôt.

````text
Tu travailles sur Epilove (nom de code) : l'application de rencontre et d'amitié réservée aux étudiants vérifiés du campus IONIS de Lyon (EPITA, ESME, Sup'Biotech, ISG, IPSA). Tu es la **session B — Rencontre**. Une autre session cloud (A — Accès) code en parallèle sur une autre branche ; une session d'intégration fusionnera ensuite les deux. Objectif : faire avancer le produit le plus loin possible, avec un niveau de finition professionnel.

## Règles de collaboration (non négociables)

- Travaille et pousse uniquement sur la branche de développement assignée à cette session (`git push -u origin <ta-branche>`). Pas de pull request, pas de push sur `main`.
- `docs/sessions-paralleles.md` définit ton périmètre et **qui possède quel fichier**. Tu ne modifies jamais un fichier possédé par la session A. Les fichiers partagés (agrégateurs, catalogue pnpm, `.env.example`, `apps/web/i18n/messages.ts`…) se modifient en ajout seulement, selon les règles du document.
- La session A construit le design system (`packages/ui`), la navigation, l'authentification et l'implémentation du contrat `safety`. Toi :
  - tu construis tes composants dans `apps/web/components/rencontre/` avec Tailwind et `@epilove/tokens` ;
  - tu t'authentifies en développement avec l'en-tête `x-dev-user-id` (`DEV_AUTH=1`) ;
  - tu appelles `safety.block` / `safety.report` (provisoirement `NOT_IMPLEMENTED`), avec une gestion d'erreur propre.
- Migrations : génère-les normalement (`pnpm db:generate`) ; tout ce qui vient après `0002_p0_schema` sera régénéré à la fusion.
- Tiens à jour `docs/integration/session-b.md` à chaque push : nom de ta branche, ce qui est fait et testé, ce qui ne l'est pas, fichiers partagés modifiés, nouvelles variables d'environnement, dépendances et migrations, mises à jour souhaitées dans `CLAUDE.md` / README / docs, points d'intégration, questions ouvertes. Tes ADR sont numérotés à partir de `0020`.
- Ne modifie pas `CLAUDE.md`, le README ni `docs/0*.md` : note les changements souhaités dans tes notes de passation.

## À lire avant de coder

`CLAUDE.md`, `docs/sessions-paralleles.md`, puis `docs/00-vision.md`, `docs/01-fonctionnalites.md` (identifiants DEC, CHAT, PAC, NOT, IRL, COM), `docs/02-design.md`, `docs/04-architecture.md` (flux like → match, message, temps réel, révélation), `docs/05-donnees.md`, `docs/06-matching.md` (en entier), `docs/07-confiance-securite.md`, `docs/adr/0001-socle-technique-sprint-0.md`. Puis le socle déjà en place :
- `packages/core` : `canSee`, `isDeckCandidate`, compatibilité, `reportPriority` ;
- `packages/db/src/schema` : tes tables (questionnaire, discovery, messaging, notifications, pact, outbox) et celles de A, en lecture ;
- `packages/api` : contexte `viewer`, `requireViewer`, modules ;
- `packages/contracts`, `packages/crypto`, `packages/media`, `apps/web/i18n`, `infra/centrifugo/config.json`.

Les versions sont récentes (Next.js 16.3, React 19.3, TypeScript 7, pnpm 12, Tailwind 4.3, Drizzle 0.45, oRPC 1.15, Zod 4, Vitest 5, Playwright 1.63, Centrifugo 6.9, Graphile Worker 0.18, Motion 13, three.js r186) : vérifie chaque API dans la documentation de la version installée (`node_modules`, sites officiels, Context7 si disponible) avant d'écrire du code.

## Mise en route (session cloud)

1. Le hook de démarrage installe Node 24 et les dépendances. Vérifie : `node -v` (v24), `pnpm -v` (12).
2. `bash infra/scripts/cloud-docker.sh`, puis `pnpm services:up`, `pnpm db:migrate`, `pnpm db:seed`.
3. État initial vert : `pnpm lint`, `pnpm typecheck`, `pnpm test`. Playwright utilise le Chromium préinstallé via `PW_CHROMIUM_PATH`.

## Ton périmètre, en trois paliers

Termine un palier avant de passer au suivant. Dans chaque palier, suis l'ordre.

### Palier 1 — indispensable

1. **Données de développement** (en premier : tout le reste en dépend). Script `pnpm db:seed:dev` dans `packages/db/src/dev-seed/`, déterministe (graine fixe) et idempotent.
   - 400 membres fictifs crédibles, répartis entre les 5 écoles et les genres selon les ordres de grandeur de docs/00.
   - Préférences variées et photos synthétiques générées par code (dégradés et formes abstraites, jamais de visages réels), téléversées dans le bucket local `epilove-media` (à créer s'il manque) et approuvées.
   - Prompts (en préfixe `dev-` tant que le catalogue de A n'est pas fusionné), réponses au questionnaire cohérentes (profils latents), likes, matchs et conversations simulés.
   - Page de développement `apps/web/app/dev/` (404 hors `APP_ENV=development|test`) pour choisir le membre courant (cookie qui alimente l'en-tête de développement).
2. **Lecture des membres et politiques** :
   - repositories dans `packages/db/src/repositories/` pour construire les `Member` et les `Relations` (lecture seule des tables de A) ;
   - `canViewProfile` et `canMessage` dans `packages/core/src/policies/`, testées par propriétés comme `canSee` (un blocage, un unmatch ou un bannissement ferment tout).
3. **Questionnaire** (PAC-01, DEC-05) :
   - banque de 45 questions fr/en en seed (`packages/db/src/seeds/questions.ts`), sections de docs/06, aucune donnée sensible ;
   - interface une question par écran : sa réponse, les réponses acceptées, l'importance, avec une explication claire de la pondération ;
   - sauvegarde continue, progression animée ;
   - compatibilité et explications (deux accords pondérés, un désaccord humoristique).
4. **Découverte** (DEC-01 à DEC-06, DEC-11) :
   - génération de candidats en SQL, puis classement de docs/06 : score réciproque heuristique, équité d'exposition et plafond d'attention, bonus inter-écoles, diversification MMR, intercalage des likes reçus, impressions enregistrées ;
   - deck : cartes physiques (inclinaison selon la vitesse, lancer, tampons), reflet holographique par école au pointeur et au gyroscope, préchargement des 3 cartes suivantes ;
   - clavier : ← passer, → liker, ↑ coup de cœur, Entrée profil, et `h` / `l` façon vim ; vibration Android ;
   - like ciblé sur une photo ou un prompt avec commentaire, coup de cœur, passer, retour arrière ;
   - quotas de docs/01 appliqués côté serveur, mutations idempotentes ;
   - page Likes reçus, tiroir de filtres ;
   - profil d'un autre membre `(app)/membres/[id]` avec transition d'élément partagé depuis la carte (View Transitions).
5. **Matchs** (CHAT-01, CHAT-13) :
   - transaction like réciproque → match (paire ordonnée unique), événements outbox ;
   - écran « Liaison établie » (arc électrique, flash aux couleurs des deux écoles, annonce `aria-live`) ;
   - unmatch, bloquer et signaler depuis le profil et la conversation via le contrat `safety`.
6. **Messagerie temps réel** (CHAT-02, CHAT-03).
   - `packages/realtime` : jeton de connexion Centrifugo signé (procédure `realtime.token`), noms de canaux, publication HTTP ; relais de l'outbox dans le worker.
   - Interface : liste et conversation, vue scindée sur desktop.
   - Envoi optimiste avec UUIDv7 client et idempotence ; corps chiffrés via `@epilove/crypto`.
   - Lectures (désactivables), indicateur de saisie, réactions, réponses citées, brise-glace tirés des deux profils.
   - Récupération après coupure, file d'envoi hors ligne (IndexedDB).
7. **Notifications** (NOT-01 à NOT-03) :
   - Web Push (VAPID, `packages/notifications`), service worker avec Serwist (`@serwist/turbopack`) et manifeste PWA ;
   - centre de notifications ;
   - préférences `(app)/reglages/notifications`, contenu discret par défaut, regroupement.
8. **Pacte** (PAC-02, PAC-03).
   - Saisons et participation.
   - Solveur Python `apps/pact-solver` : couplage de poids maximum sur graphe général avec `networkx`, seuil, sparsification aux 50 meilleurs voisins, tests, benchmark sur 3 000 membres synthétiques, repli OR-Tools CP-SAT si trop lent. Scripts `pnpm pact:compute` et rapport de contrôle qualité.
   - Page `(app)/campus/pacte` : compte à rebours, nombre de personnes connectées en direct (présence Centrifugo), diffusion synchronisée de la révélation, séquence théâtrale, graphique radar de compatibilité. Création des matchs `source = pact` à la révélation.
   - Onglet Campus `(app)/campus` comme hub.

### Palier 2 — important

- DEC-07 Drop du soir : job à 20 h 30 avec affectation sous contrainte de capacité (glouton, docs/06), notification à 21 h, en-tête avec compte à rebours dans Découvrir.
- DEC-08 crush secret par email (empreintes HMAC, 3 maximum), DEC-09 seconde chance.
- Messagerie :
  - CHAT-05 stickers maison aux couleurs des écoles (GIPHY derrière un flag) ;
  - CHAT-06 photos avec option vue unique et floutage derrière une interface de classifieur (implémentation simple d'abord) ;
  - CHAT-07 messages vocaux (MediaRecorder, forme d'onde, vitesse) ;
  - CHAT-08 modifier et supprimer (10 min) ;
  - CHAT-09 relances douces (job) ;
  - CHAT-10 proposition de date avec fichier `.ics`.
- SAF-09 avertissement avant envoi et SAF-10 « Ce message te dérange ? », avec un palier de règles local (docs/07, A6).
- IRL-01 événements : rôle organisateur, « J'y vais », partage avec ses matchs réciproque et facultatif.
- IRL-02 Spots : carte MapLibre stylée et liste de lieux publics réels autour du campus de Vaise et de la Presqu'île (parcs, places, berges : pas de commerces inventés).
- IRL-03 kit sécurité date : lien de partage temporaire avec une personne de confiance, vérification après le date.
- COM-01 question de la semaine, COM-02 indice inter-écoles (agrégats, jamais en dessous de 10 personnes), PAC-04 statistiques du Pacte.
- NOT-04 heures calmes, NOT-05 résumé hebdomadaire par email (SMTP).

### Palier 3 — bonus

- COM-03 Wrapped au format story exportable (`next/og`), COM-04 badges discrets.
- CHAT-11 mini-jeux, IRL-04 Flash (QR dynamique renouvelé toutes les 30 s), IRL-05 statut « Dispo », DEC-10 mode à l'aveugle.
- CHAT-04 brise-glace par IA via l'API Claude :
  - derrière un flag, désactivé sans `ANTHROPIC_API_KEY` et sans consentement de la personne ;
  - modèle `claude-opus-5-5`, effort `low`, sortie structurée, gestion de `stop_reason: "refusal"` ;
  - aucun prénom ni donnée sensible transmis ; tests avec un client simulé.
- Tests de charge k6 : 3 000 connexions temps réel et pic de la révélation.

## Qualité attendue

- Invariants de `CLAUDE.md` respectés partout. En particulier : toute lecture de membre passe par `canSee` / `canViewProfile` / `canMessage`, et aucun message ni préférence n'apparaît dans les journaux.
- Tests :
  - `packages/core` (unitaires et par propriétés pour classement, quotas, politiques) ;
  - procédures d'API contre PostgreSQL : like réciproque concurrent qui ne crée qu'un match, idempotence des messages ;
  - solveur Python avec pytest ;
  - Playwright avec deux navigateurs : deux membres qui se likent, matchent et discutent en temps réel ; axe sans violation.
- Mobile d'abord, accessible au clavier, `prefers-reduced-motion` respecté, textes en français selon le ton éditorial de docs/02 (namespaces i18n `discovery`, `likes`, `matches`, `chat`, `questionnaire`, `pact`, `campus`, `notifications`, `events`, `spots`).
- Design au niveau de docs/02, sections 3 et 4 (moments signature 3 à 7) : chaque écran a ses états vide, chargement, erreur et hors ligne.

## Méthode

- Travaille en autonomie, sans t'arrêter pour poser des questions : personne ne pourra y répondre. Si une décision n'est pas couverte par la documentation, choisis l'option la plus sûre et la plus cohérente avec elle, puis note-la dans tes notes de passation (ou dans un ADR si elle est structurante).
- Commits petits et fréquents au format Conventional Commits. Avant chaque push : `pnpm lint`, `pnpm typecheck`, `pnpm test`, et les tests Playwright concernés.
- Pousse après chaque fonctionnalité terminée et mets les notes de passation à jour.
- Ne t'arrête pas tant qu'il reste des éléments dans les paliers. Mieux vaut des fonctionnalités terminées et testées qu'un périmètre bâclé : ce qui reste va dans les notes.
````
