# Prompt — Session A (Accès)

À coller tel quel dans une nouvelle session **Claude Code cloud** ouverte sur le dépôt `louis-landanger/epilove`, branche de base `main`. Le compte GitHub utilisé doit avoir accès en écriture au dépôt.

````text
Tu travailles sur Epilove (nom de code) : l'application de rencontre et d'amitié réservée aux étudiants vérifiés du campus IONIS de Lyon (EPITA, ESME, Sup'Biotech, ISG, IPSA). Tu es la **session A — Accès**. Une autre session cloud (B — Rencontre) code en parallèle sur une autre branche ; une session d'intégration fusionnera ensuite les deux. Objectif : faire avancer le produit le plus loin possible, avec un niveau de finition professionnel.

## Règles de collaboration (non négociables)

- Travaille et pousse uniquement sur la branche de développement assignée à cette session (`git push -u origin <ta-branche>`). Pas de pull request, pas de push sur `main`.
- `docs/sessions-paralleles.md` définit ton périmètre et **qui possède quel fichier**. Tu ne modifies jamais un fichier possédé par la session B. Les fichiers partagés (agrégateurs, catalogue pnpm, `.env.example`, `apps/web/i18n/messages.ts`…) se modifient en ajout seulement, selon les règles du document.
- Migrations : génère-les normalement (`pnpm db:generate`) ; tout ce qui vient après `0002_p0_schema` sera régénéré à la fusion.
- Tiens à jour `docs/integration/session-a.md` à chaque push : nom de ta branche, ce qui est fait et testé, ce qui ne l'est pas, fichiers partagés modifiés, nouvelles variables d'environnement, dépendances et migrations, mises à jour souhaitées dans `CLAUDE.md` / README / docs, points d'intégration, questions ouvertes. Tes ADR sont numérotés à partir de `0010`.
- Ne modifie pas `CLAUDE.md`, le README ni `docs/0*.md` : note les changements souhaités dans tes notes de passation.

## À lire avant de coder

`CLAUDE.md`, `docs/sessions-paralleles.md`, puis `docs/00-vision.md`, `docs/01-fonctionnalites.md` (identifiants ONB, PRO, SAF, ADM, PLT, COM), `docs/02-design.md`, `docs/04-architecture.md`, `docs/05-donnees.md`, `docs/07-confiance-securite.md`, `docs/08-juridique-rgpd.md`, `docs/adr/0001-socle-technique-sprint-0.md`. Puis le socle déjà en place : `packages/core`, `packages/db/src/schema`, `packages/api` (contexte `viewer`, `requireViewer`, `requireRole`, modules), `packages/contracts` (dont `safety`), `packages/crypto`, `packages/media`, `apps/web/i18n`.

Les versions sont récentes (Next.js 16.3, React 19.3, TypeScript 7, pnpm 12, Tailwind 4.3, Better Auth 1.7, Drizzle 0.45, oRPC 1.15, Zod 4, Vitest 5, Playwright 1.63, three.js r186, Motion 13, GSAP 3.15) : vérifie chaque API dans la documentation de la version installée (`node_modules`, sites officiels, Context7 si disponible) avant d'écrire du code.

## Mise en route (session cloud)

1. Le hook de démarrage installe Node 24 et les dépendances. Vérifie : `node -v` (v24), `pnpm -v` (12).
2. `bash infra/scripts/cloud-docker.sh`, puis `pnpm services:up`, `pnpm db:migrate`, `pnpm db:seed`. Emails : Mailpit (http://localhost:8025, API `/api/v1/messages`).
3. État initial vert : `pnpm lint`, `pnpm typecheck`, `pnpm test`. Playwright utilise le Chromium préinstallé via `PW_CHROMIUM_PATH`.

## Ton périmètre, en trois paliers

Termine un palier avant de passer au suivant. Dans chaque palier, suis l'ordre.

### Palier 1 — indispensable

1. **Design system et coquille** (en premier : la session B affichera ses pages dedans).
   - `packages/ui` : primitives accessibles restylées selon docs/02 (bouton, bouton icône, champ, zone de texte, sélecteur, case, interrupteur, curseur double pour l'âge, tiroir, dialogue, toast, avatar, chip d'école avec glyphe, badge, onglets, état vide, squelette, indicateur de chargement), variantes et états documentés, jetons de `@epilove/tokens` uniquement.
   - `apps/web/app/(app)/layout.tsx` : garde de session (redirection vers la connexion), barre d'onglets mobile et navigation latérale desktop à 5 onglets (Découvrir `/decouvrir`, Likes `/likes`, Messages `/messages`, Campus `/campus`, Profil `/profil`) avec pastilles de non-lus prévues, transitions entre onglets.
   - Namespaces i18n `nav`, `common`, puis un namespace par fonctionnalité (`auth`, `onboarding`, `profile`, `settings`, `safety`, `help`, `marketing`, `waitlist`, `legal`).
2. **Authentification** (ONB-02, ONB-03, ONB-07, ONB-12) dans `packages/auth` avec Better Auth.
   - Code à 6 chiffres par email (10 min, 5 essais, limites par IP et par adresse, stockées dans Valkey), uniquement pour les domaines d'école via `parseSchoolEmail` (adresse canonique, `+tag` retiré), `emailHmac` calculé à la création.
   - Passkeys, plugin admin, sessions révocables (liste des appareils), Cloudflare Turnstile (désactivé en développement).
   - Tables Better Auth dans `packages/db/src/schema/auth.ts`, modèle utilisateur mappé sur `app_user` (déjà compatible).
   - Résolveur de session dans `apps/web/lib/server/api-app.ts` (le résolveur de développement reste derrière `DEV_AUTH=1` et `APP_ENV=development|test`).
   - `apps/web/proxy.ts` : redirections d'authentification et Content-Security-Policy avec nonce.
   - Emails transactionnels (SMTP, Mailpit en local) avec gabarits soignés, version texte comprise.
   - Pages connexion, saisie du code (collage, renvoi avec délai), gestion d'erreurs claires.
3. **Onboarding** (ONB-04 à ONB-06) : date de naissance avec contrôle 18+ bloquant (`isAdult`), charte en trois écrans, consentement séparé et explicite aux données sensibles (sans lui : mode Amis uniquement), étapes prénom → naissance → genre et pronoms → je cherche → qui je veux voir → photos → prompts → intérêts → campus et promo, sauvegarde à chaque étape et reprise, barre de progression animée.
4. **Profil** (PRO-01 à PRO-05) : mon profil en aperçu « tel que les autres te voient » et en édition directe.
   - Photos : recadrage et compression côté navigateur, réordonnancement par glisser-déposer, URL présignée vers le stockage S3 (SeaweedFS en local, crée le bucket `epilove-media` s'il manque), job worker (type réel, ré-encodage sharp, suppression EXIF, tailles, thumbhash), statut `pending` jusqu'à modération, affichage via `photoUrl` de `@epilove/media`.
   - Catalogues en seed (`packages/db/src/seeds/catalog-*.ts`) : environ 40 prompts campus (fr/en, inspirés de docs/01) et 80 centres d'intérêt classés par catégorie.
   - Complétude et conseils actionnables.
5. **Réglages et sécurité** (SAF-01 à SAF-06, SAF-14, SAF-15).
   - Implémente le contrat `safety` (block, unblock, report) avec `reportPriority`, détails chiffrés via `@epilove/crypto`, masquage immédiat pour les signalements P1, journal d'audit.
   - Masquer son école, sa promo, des personnes par email (empreintes HMAC), pause, notifications discrètes.
   - Suppression de compte : statut `deleting`, coffre légal (`identity_vault` à créer dans tes tables) puis purge par job.
   - Page d'aide : ressources d'urgence et dispositifs VSS des écoles.
6. **Back-office** `apps/admin` (nouvelle app Next.js, port 3001, rôles `moderator` et `admin`).
   - Files de modération des photos et des signalements, raccourcis clavier.
   - Actions graduées avec motivation obligatoire (modèles de motivations, DSA article 17) et notification de la personne concernée.
   - Vue utilisateur minimale et pseudonymisée (révélation de l'identité tracée), journal d'audit consultable, CRUD des catalogues prompts et intérêts.
7. **Vitrine** `apps/web/app/(marketing)`, au niveau des sites primés sur Awwwards (docs/02, sections 4 et 5).
   - Champ d'ions : three.js `WebGPURenderer` + TSL, repli WebGL2, curseur chargé, condensation en logo au défilement, qualité adaptative, rendu suspendu hors écran, image fixe si `prefers-reduced-motion`.
   - Titre cinétique, manifeste révélé au défilement, « comment ça marche » épinglé.
   - Course des écoles en éprouvettes, au pourcentage de l'effectif, en temps réel.
   - Pacte en teaser avec compte à rebours, section sécurité sobre, FAQ, pied de page géant.
   - Liste d'attente avec parrainage (`waitlist_entry`, aucune adresse en clair).
   - Pages légales en brouillon marqué « à valider » d'après docs/08 : mentions légales, CGU, confidentialité, transparence du classement.
   - Budgets de performance de docs/02 vérifiés avec Lighthouse.

### Palier 2 — important

- ONB-08 vérification photo par geste : capture selfie, file de revue dans l'admin, badge.
- ONB-09 re-vérification annuelle (job planifié et parcours).
- ONB-11 connexion Forge ID (OpenID Connect générique, désactivée sans configuration).
- PRO-06 prompts vocaux (enregistrement, forme d'onde, transcription prévue).
- PRO-07 « Mon son du moment » via l'API iTunes Search (extrait de 30 s, attribution et lien obligatoires, pas de cache).
- PRO-08 carte de profil holographique partageable (image générée avec `next/og`, contenu choisi par la personne).
- PRO-11 texte alternatif des photos.
- SAF-07 mode incognito, SAF-08 mode partiels (pause programmée), SAF-14 export des données (JSON + médias, job asynchrone, lien expirant).
- ADM-04 recours (réexamen par un autre modérateur), ADM-09 tableaux de bord (indicateurs agrégés, délais de modération).
- PLT-01 guide d'installation PWA animé, différent pour iOS et Android.
- PLT-04 anglais : routage par locale et sélecteur de langue.
- Limitation de débit générique (Valkey) pour toutes les procédures sensibles.
- COM-05 : page 404 jouable, Konami code, message dans la console, mode terminal caché `/terminal`.

### Palier 3 — bonus

- SAF-12 filigrane dynamique des photos, SAF-13 verrouillage de l'application.
- Storybook pour `packages/ui` avec tests visuels.
- Design sonore de la vitrine (interrupteur, désactivé par défaut).
- ONB-10 connexion Microsoft restreinte aux tenants des écoles (exploration, désactivée par défaut).
- Lighthouse CI avec budgets bloquants.

## Qualité attendue

- Invariants de `CLAUDE.md` respectés partout (politiques d'accès, aucune donnée personnelle dans les journaux, données sensibles, 18+, noms d'écoles).
- Tests :
  - logique pure dans `packages/core` (unitaires, par propriétés pour les règles de sécurité) ;
  - procédures d'API contre PostgreSQL ;
  - Playwright : inscription → code lu dans Mailpit → onboarding → profil, signalement et blocage, back-office ;
  - axe sans violation.
- Mobile d'abord, accessible au clavier, `prefers-reduced-motion` respecté, textes en français selon le ton éditorial de docs/02 (anglais via i18n).
- Design au niveau de docs/02 : chaque écran a ses états vide, chargement, erreur et hors ligne.

## Méthode

- Travaille en autonomie, sans t'arrêter pour poser des questions : personne ne pourra y répondre. Si une décision n'est pas couverte par la documentation, choisis l'option la plus sûre et la plus cohérente avec elle, puis note-la dans tes notes de passation (ou dans un ADR si elle est structurante).
- Commits petits et fréquents au format Conventional Commits. Avant chaque push : `pnpm lint`, `pnpm typecheck`, `pnpm test`, et les tests Playwright concernés.
- Pousse après chaque fonctionnalité terminée et mets les notes de passation à jour.
- Ne t'arrête pas tant qu'il reste des éléments dans les paliers. Mieux vaut des fonctionnalités terminées et testées qu'un périmètre bâclé : ce qui reste va dans les notes.
````
