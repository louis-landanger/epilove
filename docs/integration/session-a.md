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
| Mon profil | PRO-01 à PRO-05, PRO-11 | `/profil` rendu côté serveur (appel en processus de l'API) : aperçu « tel que les autres te voient » (photos et prompts intercalés, intérêts, langues), jauge de complétude et conseils, édition des photos (texte alternatif compris), des infos (prénom, genre, pronoms, cursus, promo, langues, intentions), des prompts et des intérêts. La date de naissance n'est pas modifiable | `packages/api/src/modules/profile.test.ts`, e2e `profile.spec.ts` |

| Sécurité | SAF-01, SAF-02 | Contrat `safety` implémenté : blocage idempotent et silencieux, liste des personnes bloquées, signalement dédupliqué sur 24 h, détails chiffrés (AES-256-GCM, `keyRing`), priorité `reportPriority`, masquage conservatoire (`profile.hidden_at`) immédiat en P1 et à partir de deux signalants indépendants en P2, journal d'audit, quotas (50 blocages et 20 signalements par jour). Dialogues réutilisables `BlockDialog` et `ReportDialog` dans `apps/web/components/acces/safety/safety-dialogs.tsx` | `packages/api/src/modules/safety.test.ts` |
| Réglages | SAF-03 à SAF-07 | `/reglages` : pause, incognito, masquage école et promo, modes avec consentement sensible (retrait = mode Amis et genres effacés), tranche d'âge, personnes masquées par email (empreinte HMAC + indice « ca…@epita.fr »), personnes bloquées, notifications discrètes, passkeys, appareils connectés révocables, déconnexion | API + e2e `settings.spec.ts` |
| Suppression de compte | SAF-14 | Statut `deleting` immédiat, identité copiée dans `identity_vault` (5 ans), sessions révoquées, page `/compte/supprime` ; job quotidien `accounts/purge` : comptes supprimés depuis 30 jours (photos du stockage comprises), coffre expiré, blocages « mineur » expirés, compte rendu chiffré dans l'audit | API, worker, e2e |
| Aide | SAF-15 | `/aide` : numéros d'urgence et d'écoute (liens `tel:`), signalements officiels (arretonslesviolences.gouv.fr, PHAROS), dispositifs VSS des écoles (sans lien tant qu'ils ne sont pas vérifiés), rappel des outils de l'application ; `/compte/suspendu` | e2e |

| Back-office | ADM-01 à ADM-03, ADM-05, ADM-06 | `apps/admin` (port 3001, ADR 0011) : connexion staff distincte, vue d'ensemble, file photos au clavier (A, R puis 1–8, J/K) avec email de refus, file des signalements par priorité, fiche membre pseudonymisée, révélation d'identité justifiée, décisions graduées motivées (modèles par règle, emails DSA art. 17, information du signalant), levée du masquage, journal d'audit, édition des prompts et intérêts (admin). Job horaire `accounts/lift-sanctions` | `packages/api/src/modules/admin.test.ts`, `apps/admin/e2e` |

| Vitrine et liste d'attente | ONB-01, PLT-02 | Landing : champ d'ions (`@epilove/three`, WebGPU + TSL, repli WebGL2, poster si mouvement réduit), titre cinétique, manifeste, étapes épinglées, course des écoles en éprouvettes (sondage 20 s), teaser du Pacte, sécurité, FAQ, pied de page géant ; liste d'attente avec parrainage (HMAC uniquement, Server Function sans JS) ; pages légales en brouillon sous `/legal/*` | e2e (desktop et mobile, axe avec et sans mouvement réduit) |
| Recours | ADM-04 | `/compte/recours` côté membre, file `/recours` côté back-office, réexamen par une autre personne | API + e2e |
| Mode partiels | SAF-08 | Pause programmée (1 jour à 2 mois), retour automatique (job horaire) | API, worker |
| Export | SAF-14 | Zip (`donnees.json` + photos) construit par le worker, email, téléchargement réservé au titulaire pendant 7 jours | API, worker, e2e |
| Re-vérification annuelle | ONB-09 | Échéance au 1er octobre de l'année universitaire suivante ; bannière dès le 1er septembre, rappel par email (job quotidien `accounts/reverification` 08:23), mise en pause automatique après l'échéance (`app_user.paused_for_reverification`), levée dès qu'un code reçu sur l'adresse d'école est validé (`/compte/verifier`) | `packages/core/src/accounts/onboarding.test.ts`, API, worker, e2e `account.spec.ts` |
| Connexion Forge ID | ONB-11 | Fournisseur OpenID Connect `forge-id` (plugin `genericOAuth` de Better Auth), désactivé tant que `FORGE_ID_*` est vide ; refus hors campus de Lyon ou sans adresse d'école ; badge « Campus vérifié » (`app_user.campus_verified_at`) | `packages/auth/src/forge-id.test.ts` |
| Mon son du moment | PRO-07 | Recherche dans le catalogue iTunes (côté serveur, sans cache ni compte), extrait de 30 s servi depuis les hôtes Apple validés, carte sur le profil | `packages/api/src/modules/profile.test.ts`, e2e |
| Carte de profil partageable | PRO-08 | `/profil/carte` (image générée par `next/og`, effet holographique côté client), sans nom de famille ni données sensibles | e2e |
| Easter eggs | COM-05 | 404 jouable (attrape les ions), code Konami, terminal caché `/terminal` | e2e `fun.spec.ts` |
| Limitation de débit générique | — | Plafond par membre (600 appels par minute) ou par IP (120 par minute) sur toutes les procédures `/rpc/*`, en plus des quotas métier ; réponse 429 avec `Retry-After` | `packages/api/src/app.test.ts`, `lib/client-ip.test.ts` |
| Anglais | PLT-04 | Langue résolue dans `proxy.ts` (préfixe `/en` des pages publiques, cookie `NEXT_LOCALE`, `Accept-Language`), `<html lang>` et métadonnées traduites, alternatives `hreflang`, sélecteur FR / EN (vitrine, connexion et onboarding, réglages) qui marche sans JavaScript, langue enregistrée sur le compte (`app_user.locale`) et reprise à chaque connexion, emails dans les deux langues (ADR 0012) | `packages/core/src/accounts/locale.test.ts`, `packages/email`, `packages/auth`, API, e2e `locale.spec.ts` |
| Tableaux de bord | ADM-09 | `/tableaux-de-bord` du back-office (7, 30 ou 90 jours) : couverture du campus, activation, rétention à 30 jours, actifs sur 7 jours, inscriptions par jour, écoles ; indicateurs de rencontre (North Star, taux de match, match → conversation, brassage) ; délais de traitement des signalements par priorité (médiane, 90ᵉ centile, part dans la cible de docs/07), files photos et recours, décisions ; santé technique (file de tâches, photos bloquées, exports, taille de la base). Agrégats uniquement. Dernière activité des membres (`app_user.last_active_at`) enregistrée au plus toutes les 15 minutes | `packages/api/src/modules/admin.test.ts`, `safety.test.ts`, `apps/admin/e2e` |
| Guide d'installation | PLT-01 | `/aide/installer` : onglets iPhone, Android et Ordinateur (détection automatique), illustration animée synchronisée avec les étapes (pause, choix d'une étape, mouvement réduit respecté), bouton « Installer » quand le navigateur expose `beforeinstallprompt`, rappel que les notifications iOS exigent l'app installée ; bandeau discret sur téléphone dans l'app (masquable, mémorisé dans le navigateur), liens depuis l'aide et les réglages | `components/acces/install/platform.test.ts`, e2e `install.spec.ts` |
| Vérification photo par geste | ONB-08 | `/profil/verification` : geste tiré au hasard (8 gestes, jamais deux fois le même), valable 15 minutes, selfie pris avec la caméra (aperçu en direct) ou l'appareil photo du téléphone, envoi présigné, ré-encodage par le worker (`media/process-selfie`, EXIF supprimé), file `/verifications` du back-office (selfie à côté des photos du profil, A / R au clavier, 4 motifs), badge « Photo vérifiée » (`app_user.photo_verified_at`), email de résultat. Comparaison à l'œil uniquement, sans reconnaissance faciale ; le selfie est supprimé dès la décision ; 3 essais par jour | `packages/core/src/profiles/verification.test.ts`, `packages/api/src/modules/verification.test.ts`, `apps/worker/src/tasks/media/process-selfie.test.ts`, e2e `verification.spec.ts` (fausse caméra Chromium) et `apps/admin/e2e` |
| Prompts vocaux | PRO-06 | Sur une réponse enregistrée : enregistrement de 30 s max (MediaRecorder, WebM/Opus ou MP4/AAC selon le navigateur), niveaux en direct, forme d'onde de 48 barres, réécoute, envoi présigné (1 Mo max), contrôle du vrai format par le worker (`media/process-voice`), lecture via `/api/voice/:id` signée HMAC et expirante (1 h, `Range` géré pour Safari), réenregistrement, suppression. La réponse écrite sert de transcription (accessibilité, modération) ; la colonne `transcript` reste réservée à une transcription automatique future. Modifier le texte garde le vocal ; changer de prompt le supprime | `packages/core`, `packages/media/src/audio.test.ts`, `packages/api/src/lib/voice-url.test.ts`, `profile.test.ts`, `apps/worker/src/tasks/media/process-voice.test.ts`, e2e `voice.spec.ts` (faux micro Chromium) |
| Verrouillage de l'application | SAF-13 | Réglage propre à l'appareil (rien côté serveur) : déverrouillage par passkey (vérification locale de l'utilisateur, bit UV contrôlé, sans nouvelle session) ou par code de 4 à 6 chiffres (PBKDF2 salé dans le navigateur, 5 essais puis déconnexion), verrouillage à l'ouverture d'un onglet et après 0, 1, 5 ou 15 minutes en arrière-plan (marge de 10 s), script inline avec nonce qui masque l'app avant le premier rendu | `components/acces/lock/lock-config.test.ts`, e2e `lock.spec.ts` |
| Filigrane dynamique | SAF-12 | Code propre au lecteur (« 7KQ2-XA9M », HMAC avec un contexte dédié, ni l'identifiant ni le pseudonyme de modération) répété en motif discret clair et sombre sur les photos : composants `WatermarkProvider` / `ViewerWatermark` / `Watermark` dans `@epilove/ui`, fournisseur dans la coquille de l'app (`account.watermark`) et dans le back-office (photos vues par le staff, avec le code du staff). Page `/filigrane` du back-office : retrouver le compte à l'origine d'une capture, avec justification journalisée | `packages/api/src/lib/watermark.test.ts`, `admin.test.ts`, `packages/ui/src/ui.test.tsx`, `apps/admin/e2e` |

## Pas encore fait

- Vitrine : JavaScript initial de `/` à 196 Ko gzip (budget 180 Ko, dont 185 Ko pour React, Next et next-intl) ; WebGPU non vérifié sur un vrai GPU ; effectifs par école estimés (à confirmer) ; pas de design sonore ni de préchargeur.
- Palier 3 : Storybook, design sonore de la vitrine, connexion Microsoft (ONB-10), Lighthouse CI.

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
| `packages/api/src/app.ts` | `createServerClient(dependencies, viewer)` : appel des procédures en processus depuis les composants serveur (`serverApi()` dans `apps/web/lib/server/api-app.ts`) |
| `packages/api/src/context.ts` | `services.keyRing` (chiffrement applicatif), `services.mailer`, `services.appUrl` |
| `packages/api/src/procedures.ts` | Ajout : `requireActiveMember` |
| `package.json` (racine) | Script `db:promote` |
| `apps/web/playwright.config.ts` | Second `webServer` : le worker tourne pendant les tests e2e (les photos sont réellement traitées) |
| `apps/web/i18n/messages.ts` | Ajout : namespace `onboarding` |
| `apps/web/next.config.ts` | `transpilePackages` : `@epilove/crypto`, `@epilove/media` ; `serverExternalPackages` : SDK S3 |
| `apps/web/proxy.ts` | CSP `connect-src` : origine du stockage objet (envoi direct des photos) |
| `pnpm-workspace.yaml` | Catalogue : `@aws-sdk/client-s3`, `@aws-sdk/s3-presigned-post`, `sharp`, `thumbhash` |
| `.env.example` | Section `# Session A` |
| `apps/web/app/layout.tsx` | `viewport.themeColor` aligné sur le jeton `ink` ; `app/manifest.ts` (à B) garde `#100e18` : à aligner à la fusion |
| `apps/web/playwright.config.ts` | `API_RATE_LIMIT_ANONYMOUS=100000` pour le serveur de test (la suite e2e partage une seule IP) ; `locale: "fr-FR"` par défaut (le navigateur envoie `Accept-Language`, qui choisit la langue) |
| `apps/web/i18n/request.ts` | La langue vient de l'en-tête `x-epilove-locale` posé par `proxy.ts` (ADR 0012) |
| `apps/web/app/layout.tsx` | `<html lang>` selon la langue, métadonnées traduites, `metadataBase` (`SITE_URL`) ; toutes les pages sont désormais rendues à la demande |
| `apps/web/next.config.ts` | `Permissions-Policy` : `camera=(self)` (selfie de vérification) et `microphone=(self)` (prompts vocaux), au lieu de `()` |
| `packages/contracts/src/index.ts`, `packages/api/src/router.ts` | Ajout : `verification` |
| `packages/media/package.json` | Export `./audio`, dépendance `@epilove/core` |
| `apps/web/app/(app)/layout.tsx` | Script inline (nonce) et `AppLock` du verrouillage ; la navigation et `#contenu` sont masqués sous `html[data-locked]`. Les pages de B héritent du verrouillage sans rien faire |
| `packages/media/src/storage.ts` | `presignUpload(…, maxBytes)` : plafond par appel (1 Mo pour les vocaux) |
| `apps/web/i18n/paths.ts` (nouveau) | `publicHref(locale, chemin)` et `publicAlternates` pour les liens vers les pages publiques |

## Variables d'environnement (section `# Session A`)

`EMAIL_FROM`, `APP_URL`, `AUTH_TRUSTED_ORIGINS`, `BETTER_AUTH_SECRET`, `PASSKEY_RP_ID`, `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `AUTH_IP_HEADERS`, `AUTH_TRUSTED_PROXIES`, `S3_PUBLIC_ENDPOINT`, `S3_REGION`, `ADMIN_URL`, `SITE_URL`, `FORGE_ID_DISCOVERY_URL`, `FORGE_ID_CLIENT_ID`, `FORGE_ID_CLIENT_SECRET`, `FORGE_ID_CAMPUS_CLAIM`, `FORGE_ID_CAMPUS_VALUE`, `FORGE_ID_GRADUATION_CLAIM`, `NEXT_PUBLIC_FORGE_ID_ENABLED`, `API_IP_HEADERS`.

Optionnelles (valeurs par défaut dans le code) : `API_RATE_LIMIT_MEMBER` (600), `API_RATE_LIMIT_ANONYMOUS` (120).

En développement et en test (`APP_ENV`), le bucket `S3_BUCKET` et sa règle CORS (origine `APP_URL`) sont créés automatiquement au premier envoi de photo.

## Dépendances ajoutées

`@aws-sdk/client-s3`, `@aws-sdk/s3-presigned-post`, `sharp` (binaires précompilés, aucun script d'installation), `thumbhash`, `fflate` (zip de l'export, worker) ; `motion` et `thumbhash` dans `apps/web` ; `three` et `@types/three` (`packages/three`, vitrine).

## Migrations

`0003_a_auth_and_identity_vault` à `0012_a_voice_prompts` (jetables, à régénérer à la fusion) : tables Better Auth, `identity_vault`, `onboarding_draft`, `signup_block`, `data_export`, colonne `photo.stage`, `profile.hidden_at`, `hidden_contact` (identifiant, indice), colonnes `app_user.deletion_requested_at`, `paused_until`, `email_proven_at`, `reverify_reminded_at`, `paused_for_reverification`, `campus_verified_at`, `locale`, `photo_verified_at`, table `photo_verification`, colonnes vocales de `prompt_answer` (`voice_stage`, `voice_content_type`, `voice_duration_ms`, `voice_peaks`).

## Pour la session B (coutures)

- **Membre complet** : un membre est découvrable quand `app_user.status` vaut `active` (ou `restricted`) **et** qu'il a une ligne `profile` **et** au moins une photo `stage = 'ready'` et `status = 'approved'`. Les photos restent `pending` jusqu'à la modération (back-office à venir).
- **Photos des autres** : `canViewPhoto(viewerId, photo)` (`packages/core/src/profiles/photos.ts`) puis `photoUrl()` ; ne jamais servir `storage_key` directement.
- **Préférences** : `preferences.modes` est déjà filtré par le consentement (`effectiveModes`). `interested_in` est une donnée sensible : jamais dans les journaux, l'analytique ni les exports.
- **Âge** : toujours calculé depuis `profile.birth_date` avec `ageOn` et la date du campus (`calendarDateIn(LYON_CAMPUS.timeZone, now)`).
- **Appels serveur** : `serverApi()` (`apps/web/lib/server/api-app.ts`) donne un client typé des procédures pour les composants serveur, avec le membre connecté comme `viewer`.
- **Profil découvrable** : `discoverableProfileSql(appUser.id)` (`@epilove/db/repositories/safety`) donne la condition SQL complète (profil présent, non masqué pour revue, au moins une photo prête et approuvée). `profile.hidden_at` non nul = profil retenu en attendant la modération.
- **Comptes** : `paused` (pause, SAF-05) et `deleting` ne doivent pas être découvrables ; une conversation reste lisible en pause. À la purge, la ligne `app_user` est supprimée : les tables de B doivent cascader (ou anonymiser), sauf les messages rattachés à un signalement ouvert.
- **Blocages** : table `block` (`blocker_id`, `blocked_id`) ; B ferme le match et la conversation au blocage (via `canMessage`).
- **Signaler / bloquer depuis B** : utiliser `BlockDialog` et `ReportDialog` (props `target: { userId, firstName }`, `context`, `contextRef`).
- **Comptes actifs** : `requireActiveMember` (`packages/api/src/procedures.ts`) refuse les comptes suspendus, bannis, en suppression ou en onboarding, même avec une session valide : à utiliser pour les likes, messages et autres actions sociales.
- **Quotas** : `withinQuota(services, nom, userId, limite, fenêtre)` (`packages/api/src/lib/quota.ts`).
- **Jobs** : `enqueueJob(tx, "tache", payload, { jobKey })` dans la transaction métier.
- **Badge « Campus vérifié »** : `app_user.campus_verified_at` non nul (connexion Forge ID) ; à afficher sur les cartes de découverte si souhaité.
- **Filigrane (SAF-12)** : dans chaque conteneur de photo d'un autre membre (deck, profil, likes, messages), ajouter `<ViewerWatermark />` (`@epilove/ui`) dans l'élément positionné (`relative`) qui contient l'image ; le code du lecteur est déjà fourni par `(app)/layout.tsx`.
- **Prompts vocaux** : `prompt_answer.text` reste toujours rempli (réponse écrite ou transcription du vocal), donc un affichage texte seul reste correct. Pour lire le vocal d'un autre membre : après `canViewProfile`, `signVoiceUrl(services, answerId)` (`packages/api/src/lib/voice-url.ts`) et le composant `VoicePlayer` (`apps/web/components/acces/profile/voice/voice-player.tsx`), uniquement si `voice_stage = 'ready'`. `replacePromptAnswers` conserve désormais les vocaux et renvoie les clés à supprimer.
- **Badge « Photo vérifiée »** : `app_user.photo_verified_at` non nul (ONB-08) ; à afficher sur les cartes et profils des autres. Un filtre « profils vérifiés seulement » est envisageable côté découverte.
- **Re-vérification** : un compte en pause pour re-vérification (`paused_for_reverification`) a le statut `paused` : il suit les mêmes règles de découvrabilité.
- **Activité** : `app_user.last_active_at` est mis à jour (au plus toutes les 15 minutes) par chaque appel de l'API depuis l'application membre (`trackActivity` dans `apps/web/lib/server/api-app.ts`). B peut s'en servir pour le classement ; l'afficher aux autres membres demanderait un réglage de confidentialité.
- **Tableaux de bord** : `packages/db/src/repositories/admin-metrics.ts` (`meetingMetrics`) lit les tables P0 `like_action`, `match` et `message` pour les indicateurs de rencontre : à vérifier si B change ces tables. La participation au Pacte reste à ajouter à la fusion.
- **PWA (B)** : le guide suppose un manifeste installable. À prévoir côté B : `start_url` vers `HOME_PATH` (`/decouvrir`) plutôt que `/`, un `id` stable, des icônes PNG 192 et 512 px (dont une `maskable`) et une `apple-touch-icon` 180 px, sans quoi l'icône iOS est une capture de la page. `listenForInstallPrompt` (`components/acces/install/install-prompt.ts`) appelle `preventDefault()` sur `beforeinstallprompt` : le bandeau de l'app remplace la mini-barre de Chrome.
- **Langue** : les pages de B reçoivent la langue sans rien faire (`useLocale`, `getTranslations`) ; chaque namespace de B doit exister en `fr` et en `en` (test `messages.test.ts`). Les emails et notifications de B s'écrivent dans `app_user.locale`. Les liens vers les pages publiques passent par `publicHref`.
- **Débit** : toutes les procédures passent déjà par le plafond générique ; les quotas métier de B (likes, messages) restent à poser avec `withinQuota`.

## Conventions ajoutées

- Textes français de l'interface : espace insécable avant `:`, `;`, `?`, `!` et à l'intérieur des guillemets « ». Dans les tests e2e, les expressions régulières utilisent `\s` à ces endroits (le texte avec chaîne simple est normalisé par Playwright).

## Mises à jour souhaitées (CLAUDE.md, README, docs)

- `CLAUDE.md`, tableau des commandes : ajouter `pnpm db:promote <email> <rôle>` et le back-office (http://localhost:3001) ; préciser que `pnpm db:migrate` crée aussi le schéma de Graphile Worker ; ajouter `pnpm --filter @epilove/worker dev` pour traiter les photos en local.
- `docs/04-architecture.md`, section 4.4 : l'envoi utilise un **formulaire POST présigné** (politique S3 : taille 1 o à 10 Mo, `Content-Type` et clé imposés) plutôt qu'une URL PUT ; voir l'ADR 0010.
- `docs/07-confiance-securite.md` : sessions stockées dans Valkey, révocation via `revokeAllSessions` ; en production, régler `AUTH_IP_HEADERS` et `API_IP_HEADERS` (par exemple `cf-connecting-ip`) et `AUTH_TRUSTED_PROXIES`, sinon les quotas par IP retombent sur un compteur partagé.

## Points d'intégration et questions ouvertes

- Les pages légales sont sous `/legal/*` (mentions légales, CGU, confidentialité, transparence), en brouillon « à valider par un juriste » avec des `[champs]` à compléter.
- Nouvelle variable `SITE_URL` (liens de parrainage), obligatoire hors développement et test.
- `HOME_PATH` vaut `/decouvrir` (page de B) : l'onboarding y redirige à la fin.
- Le client API du navigateur est dans `apps/web/components/acces/api-client.ts` ; si B en a un autre, les unifier dans `apps/web/lib/`.
- Ordre des étapes de l'onboarding : charte → prénom → naissance → genre → je cherche → qui je veux voir → photos → prompts → intérêts → campus. Le campus est en dernier (comme demandé dans le prompt de la session A), alors que docs/01 ne le place pas : à confirmer.
