# Notes de passation — session A (Accès)

- **Branche** : `claude/eloquent-noether-dza0e1`
- **Dernière mise à jour** : 2026-10-02

## Fait et testé

| Domaine | Identifiants | État | Tests |
|---|---|---|---|
| Design system `packages/ui` | — | Primitives (bouton, champ, zone de texte, cases, interrupteur, curseur double, OTP, dialogue, toast, menu d'actions, badge, squelette, état vide, barre de progression), chip d'école, avatar | `packages/ui/src/ui.test.tsx` |
| Coquille de l'app | — | `(app)/layout.tsx` : garde de session, navigation 5 onglets (mobile et desktop), lien d'évitement | e2e `auth.spec.ts` |
| Authentification | ONB-02, ONB-03, ONB-07 | Better Auth : code à 6 chiffres (haché, 10 min, 5 essais), domaines d'école via `parseSchoolEmail`, quotas par adresse et par IP (Valkey), passkeys, plugin admin, Turnstile optionnel, sessions dans Valkey | `packages/auth/src/*.test.ts`, e2e |
| Onboarding | ONB-04, ONB-05, ONB-06, ONB-12 | Charte en 3 écrans, prénom, date de naissance (18+ bloquant), genre et pronoms, modes et intentions, consentement séparé aux données sensibles (refus = mode Amis), genres recherchés et tranche d'âge, photos, 3 prompts, intérêts, campus et promo (déclarations obligatoires), récapitulatif, activation, proposition de passkey. Sauvegarde à chaque étape et reprise | `packages/core/src/accounts/onboarding.test.ts`, `packages/api/src/modules/onboarding.test.ts`, e2e `onboarding.spec.ts` (parcours complet, refus du consentement, mineur) |
| Mineurs | ONB-04 | Une date de naissance de moins de 18 ans supprime le compte, révoque les sessions et bloque l'empreinte HMAC de l'adresse jusqu'aux 18 ans (`signup_block`) | API + e2e + `auth.test.ts` |
| Photos | PRO-01 (partiel) | Recadrage 4:5 et compression dans le navigateur, formulaire POST présigné vers une clé de quarantaine (taille, type et clé imposés par la politique S3), confirmation, job `media/process-photo` (décodage réel, rotation EXIF, ré-encodage WebP, métadonnées supprimées, 2048 px max, thumbhash), purge horaire des envois abandonnés, réordonnancement, suppression (minimum 2 une fois le profil actif), URL imgproxy signées | `packages/media`, `apps/worker`, API, e2e |
| Catalogues | PRO-02, PRO-04 | 40 prompts et 82 centres d'intérêt (fr/en), seeds idempotents | `pnpm db:seed` |

## Pas encore fait

- Mon profil (aperçu « tel que les autres te voient », édition directe), complétude affichée (PRO-05 : la fonction `profileCompleteness` existe), texte alternatif des photos (PRO-11).
- Implémentation du contrat `safety`, réglages de confidentialité, pause, suppression de compte, page d'aide.
- Back-office `apps/admin`.
- Vitrine, liste d'attente et pages légales (en cours, branche de travail séparée, fusionnée dans cette branche à la fin).
- Paliers 2 et 3.

## Fichiers partagés modifiés

| Fichier | Modification |
|---|---|
| `packages/core/src/index.ts` | Ajout : `accounts/onboarding`, `profiles/completeness`, `profiles/photos`, `profiles/rules` |
| `packages/contracts/src/index.ts` | Ajout : `media`, `onboarding`, `profile` |
| `packages/api/src/router.ts` | Ajout : `media`, `onboarding`, `profile` |
| `packages/api/src/context.ts`, `app.ts` | **`ApiContext.services`** (stockage, imgproxy, limiteur de débit, révocation des sessions, secret HMAC, horloge) ; `createApp({ services })` est optionnel et retombe sur `defaultServices()` construit depuis l'environnement. B peut s'en servir pour ses quotas (`services.limiter`) |
| `packages/db/src/index.ts` | Ajout : `export * from "./jobs"` (`enqueueJob` : ajout d'un job Graphile Worker dans la transaction métier) |
| `packages/db/package.json` | Export `./repositories/*` (dépôts importés par `@epilove/db/repositories/<nom>`), dépendance `graphile-worker` |
| `packages/db/src/migrations.ts`, `migrate.ts` | `pnpm db:migrate` crée aussi le schéma `graphile_worker` (`runJobQueueSchemaMigrations`) pour que l'API puisse enfiler des jobs avant le premier démarrage du worker |
| `packages/db/src/schema/profiles.ts` | `INTENTIONS` et `MAX_PHOTOS` viennent de `@epilove/core` (réexportés) ; colonne `photo.stage` ; contrainte sur `profile.languages` |
| `apps/worker/src/tasks/index.ts` | Ajout : `...mediaTasks()` et `mediaCrontab` |
| `apps/web/i18n/messages.ts` | Ajout : namespace `onboarding` |
| `apps/web/next.config.ts` | `transpilePackages` : `@epilove/crypto`, `@epilove/media` ; `serverExternalPackages` : SDK S3 |
| `apps/web/proxy.ts` | CSP `connect-src` : origine du stockage objet (envoi direct des photos) |
| `pnpm-workspace.yaml` | Catalogue : `@aws-sdk/client-s3`, `@aws-sdk/s3-presigned-post`, `sharp`, `thumbhash` |
| `.env.example` | Section `# Session A` |

## Variables d'environnement (section `# Session A`)

`EMAIL_FROM`, `APP_URL`, `AUTH_TRUSTED_ORIGINS`, `BETTER_AUTH_SECRET`, `PASSKEY_RP_ID`, `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `AUTH_IP_HEADERS`, `AUTH_TRUSTED_PROXIES`, `S3_PUBLIC_ENDPOINT`, `S3_REGION`.

En développement et en test (`APP_ENV`), le bucket `S3_BUCKET` et sa règle CORS (origine `APP_URL`) sont créés automatiquement au premier envoi de photo.

## Dépendances ajoutées

`@aws-sdk/client-s3`, `@aws-sdk/s3-presigned-post`, `sharp` (binaires précompilés, aucun script d'installation), `thumbhash` ; `motion` et `thumbhash` dans `apps/web`.

## Migrations

`0003_a_auth_and_identity_vault`, `0004_a_onboarding` (jetables, à régénérer à la fusion) : tables Better Auth, `identity_vault`, `onboarding_draft`, `signup_block`, colonne `photo.stage`.

## Pour la session B (coutures)

- **Membre complet** : un membre est découvrable quand `app_user.status` vaut `active` (ou `restricted`) **et** qu'il a une ligne `profile` **et** au moins une photo `stage = 'ready'` et `status = 'approved'`. Les photos restent `pending` jusqu'à la modération (back-office à venir).
- **Photos des autres** : `canViewPhoto(viewerId, photo)` (`packages/core/src/profiles/photos.ts`) puis `photoUrl()` ; ne jamais servir `storage_key` directement.
- **Préférences** : `preferences.modes` est déjà filtré par le consentement (`effectiveModes`). `interested_in` est une donnée sensible : jamais dans les journaux, l'analytique ni les exports.
- **Âge** : toujours calculé depuis `profile.birth_date` avec `ageOn` et la date du campus (`calendarDateIn(LYON_CAMPUS.timeZone, now)`).
- **Quotas** : `withinQuota(services, nom, userId, limite, fenêtre)` (`packages/api/src/lib/quota.ts`).
- **Jobs** : `enqueueJob(tx, "tache", payload, { jobKey })` dans la transaction métier.

## Mises à jour souhaitées (CLAUDE.md, README, docs)

- `CLAUDE.md`, tableau des commandes : préciser que `pnpm db:migrate` crée aussi le schéma de Graphile Worker ; ajouter `pnpm --filter @epilove/worker dev` pour traiter les photos en local.
- `docs/04-architecture.md`, section 4.4 : l'envoi utilise un **formulaire POST présigné** (politique S3 : taille 1 o à 10 Mo, `Content-Type` et clé imposés) plutôt qu'une URL PUT ; voir l'ADR 0010.
- `docs/07-confiance-securite.md` : sessions stockées dans Valkey, révocation via `revokeAllSessions` ; en production, régler `AUTH_IP_HEADERS` (par exemple `cf-connecting-ip`) et `AUTH_TRUSTED_PROXIES`, sinon les quotas par IP retombent sur un compteur partagé.

## Points d'intégration et questions ouvertes

- Les liens de la charte pointent vers `/cgu` et `/confidentialite` : à aligner avec les chemins des pages légales.
- `HOME_PATH` vaut `/decouvrir` (page de B) : l'onboarding y redirige à la fin.
- Le client API du navigateur est dans `apps/web/components/acces/api-client.ts` ; si B en a un autre, les unifier dans `apps/web/lib/`.
- Ordre des étapes de l'onboarding : charte → prénom → naissance → genre → je cherche → qui je veux voir → photos → prompts → intérêts → campus. Le campus est en dernier (comme demandé dans le prompt de la session A), alors que docs/01 ne le place pas : à confirmer.
