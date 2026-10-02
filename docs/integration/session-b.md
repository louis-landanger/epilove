# Notes de passation — Session B (Rencontre)

> Tenues à jour à chaque push. Branche : `claude/confident-ptolemy-8943zn`.

## État d'avancement

| Palier | Élément | État |
|---|---|---|
| 1 | Données de développement (`pnpm db:seed:dev`, page `/dev`) | ✅ fait et testé |
| 1 | Lecture des membres et politiques (`canViewProfile`, `canMessage`) | ✅ fait et testé |
| 1 | Questionnaire (PAC-01, DEC-05) | ✅ fait et testé (API) ; interface vérifiée à la main |
| 1 | Découverte (DEC-01 à DEC-06, DEC-11) | ✅ fait et testé (API, dont concurrence) ; interface vérifiée à la main |
| 1 | Matchs (CHAT-01, CHAT-13) | ✅ création, écran « Liaison établie », unmatch ; bloquer et signaler câblés sur le contrat `safety` (NOT_IMPLEMENTED côté A) |
| 1 | Messagerie temps réel (CHAT-02, CHAT-03) | ✅ fait et testé (API, relais, Playwright à deux navigateurs) |
| 1 | Notifications (NOT-01 à NOT-03) | ✅ fait et testé (API, worker, Playwright pour le service worker) ; push réel non testé en automatique (pas de service de push dans la session) |
| 2 | Proposer un date (CHAT-10) | ✅ fait et testé (cœur, API, Playwright à deux navigateurs) |
| 2 | Spots (IRL-02) | ✅ fait et testé (API) ; carte vérifiée à la main (sans fond de carte dans la session) |
| 2 | Relances douces (CHAT-09) | ✅ fait et testé (cœur, worker) |
| 2 | Stickers maison et GIF (CHAT-05) | ✅ fait et testé (API avec GIPHY simulé) ; GIPHY désactivé sans clé |
| 2 | Modifier / supprimer (CHAT-08), avertissement avant envoi (SAF-09), « Ce message te dérange ? » (SAF-10) | ✅ fait et testé (cœur, API, Playwright) |
| 2 | Photos, photo éphémère, flou explicite (CHAT-06) ; messages vocaux (CHAT-07) | ✅ fait et testé (API, worker, Playwright à deux navigateurs avec micro simulé) ; transcription non faite, classifieur d'images à brancher (SAF-11) |
| 2 | Question de la semaine (COM-01), indice inter-écoles (COM-02), statistiques du Pacte (PAC-04) | ✅ fait et testé (cœur dont propriété d'anonymat, API, Playwright, axe) |
| 2 | Kit sécurité date (IRL-03) | ✅ fait et testé (cœur, API, Playwright avec une personne de confiance sans compte, axe) |
| 2 | Événements (IRL-01) | ✅ fait et testé (cœur, API, Playwright à trois navigateurs, axe) ; pas d'image de couverture |
| 2 | Crush secret (DEC-08), seconde chance (DEC-09) | ✅ fait et testé (cœur, API, Playwright pour le crush réciproque) |
| 2 | Drop du soir (DEC-07) | ✅ fait et testé (cœur, worker, API) ; interface vérifiée à la main |
| 1 | Pacte (PAC-02, PAC-03) et onglet Campus | ✅ fait et testé (pytest, cœur, API, worker, Playwright à deux navigateurs) ; dry run à 3 000 membres mesuré |

## Ce qui est fait

### Données de développement

- `packages/db/src/dev-seed/` : 400 membres fictifs déterministes (graine fixe), répartis selon les ordres de grandeur de docs/00 (EPITA 90, ESME 95, IPSA 45, Sup'Biotech 70, ISG 100 ; part de femmes par école ; ~3 % de personnes non binaires). Les 5 personas de docs/00 (Inès, Hugo, Sarah, Malik, Camille) sont les membres 1 à 5, avec des histoires scénarisées (match Inès–Hugo avec conversation, Sarah très likée, Camille–Malik en mode Amis…).
- Identifiants reconnaissables : `de000000-0000-7000-8000-00000000xxxx`. Le script supprime puis recrée ces membres : il est idempotent (même état final à chaque exécution) et remet à zéro ce qui a été fait avec eux dans l'application.
- Photos de synthèse (dégradés, halos, orbites aux couleurs des écoles, jamais de visage) encodées en PNG par un encodeur maison (`photos.ts`, sans dépendance native) et téléversées dans `epilove-media` (bucket créé s'il manque) ; un second passage ne re-téléverse pas les images existantes. Premier passage ≈ 2 min.
- Prompts et intérêts préfixés `dev-` (catalogue de A pas encore fusionné), réponses au questionnaire tirées de 5 profils latents (compatibilités réalistes), likes, passes, matchs, conversations chiffrées (`@epilove/crypto`), blocages et contacts masqués.
- Refusé hors `APP_ENV=development|test`.
- Page `/dev` (404 hors développement) : choix du membre courant, stocké dans le cookie `epilove-dev-member` (non HttpOnly, volontairement) puis envoyé comme en-tête `x-dev-user-id`. Procédure `dev.members` (NOT_FOUND hors développement).

### Politiques et lecture des membres

- `packages/core/src/policies/profile-access.ts` : `canViewProfile` (soi, match, découverte, « t'a liké ») et `canMessage`, testées par propriétés (un blocage, un contact masqué, un bannissement, une suspension ou une suppression ferment tout ; un message implique un match actif et l'accès aux deux profils ; jamais de mineur).
- `Relations` gagne `hasActiveMatch(a, b)`.
- `packages/db/src/repositories/members.ts` : `loadMembers`, `loadMember`, `loadDiscoverableMembers` (pré-filtre SQL grossier, `canSee` fait le vrai travail), `loadRelations` (blocages, likes, matchs entre le viewer et une liste), `touchLastActive`. Exposé par le sous-chemin `@epilove/db/repositories/members` (pas d'export depuis `src/index.ts`, pour éviter les conflits).
- Règle « profil complet » retenue en attendant A : onboarding terminé (`status ≠ onboarding`) et au moins une photo approuvée.

### Questionnaire (PAC-01, DEC-05)

- Banque de 45 questions fr/en (`packages/db/src/seeds/questions.ts`, sections `values`, `lifestyle`, `campus`, `nerd`, `plans`), ajoutée à `pnpm db:seed` (upsert par slug). Aucune question sur la religion, la politique, la santé ou l'origine ; le tabac a été volontairement écarté (donnée de santé potentielle), l'alcool n'est abordé que par le style de soirée.
- `packages/core/src/matching/explain.ts` : les deux accords les plus pondérés et un désaccord sans enjeu (les questions « nerd » en priorité ; jamais une question importante pour l'un des deux), testé par propriétés.
- Procédures `questionnaire.get`, `questionnaire.answer` (upsert idempotent, options validées), `questionnaire.compatibility` (exige `canViewProfile`, sinon NOT_FOUND). Tests d'intégration sur PostgreSQL.
- Interface `(app)/campus/questionnaire` : introduction (pondération expliquée, confidentialité), une question par écran (réponse, réponses acceptées, importance en 5 niveaux avec explication), sauvegarde à chaque question, progression par section animée, clavier (1–4, Entrée), focus déplacé sur la question pour les lecteurs d'écran, écran de fin.

### Découverte (DEC-01 à DEC-06, DEC-11)

- `packages/core/src/discovery/rules.ts` : quotas de docs/01 (20 likes, 10 pour un compte de moins de 48 h, 1 coup de cœur avec commentaire obligatoire, 1 retour arrière par jour, commentaire ≤ 150 caractères), journée de campus en `Europe/Paris` (changements d'heure testés).
- `packages/core/src/discovery/ranking.ts` : score réciproque `R = √(p(A→B)·p(B→A))` (logistique à poids manuels : compatibilité, intérêts, complétude, activité, écart de promo ; probabilité 0,95 quand l'autre a déjà liké), bonus nouveaux / actifs / inter-écoles (réglage `crossSchoolBoost`), facteur d'exposition (plafond d'attention à 10 likes en attente, budget de 40 impressions par jour), diversification MMR pondérée par la récence, une carte sur quatre pour une personne qui t'a liké. Testé par propriétés.
- Le deck est recalculé à chaque appel (pas de cache Valkey) : chargement des membres découvrables, `canSee` + `isDeckCandidate` (passes masquées 45 jours, likes définitivement, critères éliminatoires), filtres, classement, puis cartes. Suffisant pour quelques milliers de membres ; cache à ajouter si la latence l'exige (noté pour un ADR).
- Like / coup de cœur / passer (`discovery.decide`) : transaction avec verrous consultatifs (paire puis quota du membre, toujours dans cet ordre), quota recompté dans la transaction, contenu liké vérifié (photo approuvée ou réponse de la cible), match créé si réciproque (paire ordonnée unique), événements outbox `like.received` / `match.created` et notifications in-app dans la même transaction. Idempotent. Test : 8 paires qui se likent simultanément créent exactement 8 matchs.
- Un compte restreint, en pause ou en onboarding ne peut pas liker ; une paire qui a « unmatché » reste séparée.
- Retour arrière (`discovery.undo`), likes reçus (`discovery.likesReceived`, filtrés par `canViewProfile`), profil complet (`discovery.profile`), ma carte (`discovery.me`), filtres (`discovery.filters` / `saveFilters`).
- Nouvelles tables (`packages/db/src/schema/discovery.ts`) : `impression` (exposition par jour), `discovery_filter` (filtres du deck, à sens unique ; la colonne `preferences.school_filter` de A n'est pas utilisée), `discovery_undo`.
- Interface : `(app)/decouvrir` (deck physique : inclinaison selon la vitesse, lancer, tampons, reflet holographique par école au pointeur et au gyroscope, préchargement des 3 cartes suivantes, clavier ← → ↑ Entrée et h / l, vibration, file de cartes rechargée automatiquement, états vide / chargement / hors ligne), tiroir de filtres, feuille de like ciblé (photo ou prompt, commentaire), `(app)/likes`, `(app)/membres/[id]` (photos et prompts alternés, compatibilité expliquée, intérêts communs, transition d'élément partagé depuis la carte via `<ViewTransition>`).

### Matchs (CHAT-01, CHAT-13)

- Écran « Liaison établie » : cartes qui se rapprochent, arc électrique animé, flash aux couleurs des deux écoles, annonce `aria-live`, focus sur « Écrire ».
- `matches.list` (matchs visibles uniquement : un blocage ou un contact masqué retire le match de la liste), `matches.unmatch` (idempotent, réservé aux participants, événement `match.closed`).
- `Relations.hasEndedMatch` : un unmatch ferme tout, comme un blocage (`canSee`, `canViewProfile`, `canMessage`), testé par propriétés.
- Menu de sécurité (profil, et bientôt conversation) : annuler le match, bloquer, signaler (motifs de `REPORT_REASONS`, précisions, « bloquer aussi » coché par défaut), en deux gestes. Message sobre tant que A renvoie NOT_IMPLEMENTED.

### Messagerie temps réel (CHAT-02, CHAT-03)

- `packages/realtime` : schéma Zod des événements (identifiants seulement, ADR 0020), jeton de connexion HS256, publication HTTP Centrifugo (`publish` avec clé d'idempotence, `presence_stats`).
- Outbox : `enqueue` (insertion + `pg_notify` délivré au commit), relais du worker (`apps/worker/src/tasks/outbox/relay.ts`, LISTEN + sondage de secours toutes les 5 s, `SKIP LOCKED`), purge quotidienne.
- Procédures `messaging.thread` (brise-glace tirés des intérêts communs, des prompts de l'autre et des réponses partagées ; statut en ligne et accusés de lecture seulement si les deux les partagent), `history` (`before` / `after`), `send` (UUIDv7 client, idempotent, corps chiffré, palier 1 de modération qui signale sans bloquer, 20 messages par minute, identifiant à ± 5 min de l'heure serveur), `read`, `react` (6 réactions), `typing` (publié directement, au mieux), `settings` / `saveSettings` ; `realtime.token`.
- Une conversation n'est accessible que si `canMessage` l'autorise et que le match est actif (sinon NOT_FOUND, sans dire pourquoi).
- Interface `(app)/messages` (vue scindée sur desktop, liste puis conversation sur mobile) : nouvelles liaisons en carrousel, conversations avec aperçu et non-lus, envoi optimiste, file d'envoi hors ligne en IndexedDB (`lib/rencontre/send-queue.ts`), rattrapage après reconnexion par l'API, indicateur de saisie en électrons en orbite, réponses citées, réactions (menu, double appui avec explosion, appui long sur mobile), « Vu », signalement d'un message, brise-glace, états hors ligne / reconnexion / conversation fermée.
- `RealtimeProvider` (`lib/rencontre/realtime.tsx`) : une connexion Centrifugo par onglet, canal personnel, signal `resync` après reconnexion ; monté dans `RencontreProviders`.
- Playwright (`apps/web/e2e/rencontre.spec.ts`) : deux membres créés en base, like avec commentaire depuis le profil, like retour depuis « Likes », écran de match, conversation en direct dans les deux sens, « Vu », axe sans violation sur les écrans de B. Le worker est démarré par Playwright (second `webServer`, santé sur `WORKER_HEALTH_PORT=3101`).

### Notifications (NOT-01 à NOT-03)

- `packages/notifications` : types et groupes de préférences (likes, matchs, messages, Drop, Pacte), contenu push discret par défaut (ni prénom ni contenu ; même non discret, jamais le texte d'un message), étiquette par conversation pour regrouper sur l'appareil, envoi Web Push VAPID (`web-push`), abonnements expirés (404/410) supprimés.
- Centre de notifications (`notifications.list` paginé sur (created_at, id), `unreadCount`, `markRead`), préférences par groupe et canal (table `notification_preference`, défauts : push oui, e-mail non), abonnements push (`subscribe` / `unsubscribe`, un endpoint appartient à un seul membre), clé publique VAPID (`pushConfig`).
- Envoi : le worker traite les notifications non poussées juste après chaque vidage de l'outbox (`afterDrain`), ignore celles de plus d'une heure, ne pousse pas si le membre est connecté (présence Centrifugo) et respecte ses préférences ; colonne `notification.pushed_at`. Le réglage « notifications discrètes » est lu dans `preferences.discreet_notifications` (table de A, SAF-06).
- PWA : service worker Serwist (`apps/web/service-worker/sw.ts`, servi par `app/serwist/[path]/route.ts`), qui ne met en cache que la coquille et les ressources statiques (jamais une page ni une réponse d'API : appareils prêtés), page `/hors-ligne`, gestion de `push` et `notificationclick` (chemins internes uniquement). Enregistré par `RencontreProviders` (`SerwistProvider`).
- Interface : `(app)/notifications` (historique, non-lus, tout marqué lu à l'ouverture, mise à jour en direct), `(app)/reglages/notifications` (activation du push sur l'appareil, demande de permission uniquement au clic, consigne iPhone « écran d'accueil », préférences par groupe et canal, réglages de conversation : accusés de lecture et statut en ligne).
- Le seed de développement crée aussi des notifications (likes reçus, matchs).

### Pacte (PAC-02, PAC-03) et onglet Campus

- Solveur Python `apps/pact-solver` (uv, Python 3.11, networkx 3.5, OR-Tools 9.14 en extra `cpsat`) : JSON sur l'entrée standard, paires sur la sortie standard, seuil, sparsification aux 50 meilleurs voisins, couplage de poids maximum sur graphe général (networkx) ou CP-SAT, vérification du couplage avant réponse, statistiques. 220 tests pytest (dont comparaison à une recherche exhaustive sur 150 graphes aléatoires), ruff. Voir `apps/pact-solver/README.md` pour les mesures.
- `packages/core/src/pact/` : phases d'une saison (`pactPhase`, `canJoinPact`, `canViewPactResult`, `canComputePact`), éligibilité d'une paire (`pactEligibleModes` : `canSee` dans les deux sens, incognito levé car participer vaut consentement, paires déjà matchées exclues), compatibilité compilée en tableaux typés (`fastCompatibility`, testée par propriétés contre `compatibility`), sparsification par tas (`BestNeighbours`, testée contre un tri naïf, idempotente), compatibilité par section pour le radar, rapport de contrôle qualité (aucun identifiant, groupes de moins de 10 non détaillés), horloge du compte à rebours (décalage serveur, gigue de 0 à 3 s).
- Base : `pact_season.report`, `computed_at`, `revealed_at` ; `pact_result.match_id` ; `PACT_STATUSES` déplacé dans `@epilove/core`. Dépôt `packages/db/src/repositories/pact.ts` (saison courante, participation sous verrou, enregistrement des résultats rejouable, révélation en une transaction idempotente). `loadRelationsAmong` dans `members.ts`. Outbox : entrées de diffusion (`channel: "broadcast:pact"`), ordre (created_at, id).
- Worker `apps/worker/src/tasks/pact/` : `pnpm pact:compute [--season slug] [--engine auto|networkx|cpsat] [--power 1|2]` (calcul et rapport), `pnpm pact:compute --synthetic 3000` (à blanc, rien n'est écrit), `pnpm pact:demo [--reveal-in 60] [--open]` (développement : saison « Démo » avec les membres fictifs, révélée dans N secondes, ou ouverte aux inscriptions). Tâches `pact_reveal_due` (cron chaque minute, planifie à la seconde près) et `pact_reveal` (revérifie les politiques, crée les matchs `pact`, notifie tous les participants, diffuse `pact.reveal` en premier).
- API `pact.current` (saison, phase, heure serveur, participation, nombre de participants, exigence de 30 réponses), `join` / `leave` (pendant l'ouverture seulement, modes du profil uniquement), `result` (après la révélation, participants seulement, profil revérifié : un blocage après la révélation masque le résultat), `liveCount` (présence Centrifugo sur `broadcast:pact`, mise en cache 5 s).
- Interface `(app)/campus/pacte` : inscription (modes, consentement explicite sur l'incognito, progression du questionnaire), compte à rebours sur l'horloge du serveur, compteur en direct, attente « le campus retient son souffle », séquence théâtrale (l'échantillon s'ouvre, flash aux couleurs des écoles, cartes en ressort, score qui défile, radar qui se déploie), écran sobre sans match, écran « pas participé ». `useBroadcast` dans `RealtimeProvider` (abonnement au canal de diffusion seulement pendant l'affichage). Mouvement réduit respecté.
- Onglet `(app)/campus` : hub (Pacte avec son état, questionnaire avec sa progression).
- Playwright `apps/web/e2e/pacte.spec.ts` : deux participants regardent le compte à rebours, la diffusion démarre la séquence sur les deux écrans, chacun voit l'autre ; axe sans violation au compte à rebours et au résultat. `/campus` et `/campus/pacte` ajoutés au contrôle axe des écrans de B.
- Mesures : séquence démarrée 830 ms après l'heure sur deux navigateurs (2 ms d'écart) ; dry run 3 000 membres en 2 min 30 s (détail dans le README du solveur).
- Chorégraphie faite avec Motion (déjà présent) plutôt que GSAP (docs/02 le suggère) : pas de dépendance supplémentaire pour une séquence de quelques secondes.

### Proposer un date (CHAT-10)

- `packages/core/src/messaging/date-proposal.ts` : règles (un lieu, entre 1 heure et 60 jours à l'avance, mot de 200 caractères), réponse par l'autre membre seulement, une fois, avant le date ; fichier calendrier RFC 5545 (`dateIcs` : échappement, pliage à 75 octets, titre neutre sans prénom), testés.
- Messages `date_proposal` (charge chiffrée : Spot ou lieu libre, heure, mot, statut). API `messaging.proposeDate` (avec `counterTo` pour « autre chose » : la proposition d'origine passe à « countered ») et `messaging.respondDate` (accepter, décliner). Le nom du Spot est résolu à la lecture (en français pour l'instant : l'historique ne porte pas de langue).
- Interface : bouton calendrier dans la zone de saisie, feuille (Spot ou autre lieu, date et heure, mot, rappel de sécurité), carte dans la conversation (statut, Accepter / Autre chose / Décliner), « Ajouter au calendrier » (.ics généré dans le navigateur).

### Spots (IRL-02)

- Table `spot` (`packages/db/src/schema/spots.ts`, migration 0011) et seed `packages/db/src/seeds/spots.ts` : 16 lieux publics réels autour du campus de Vaise et de la Presqu'île (places, parcs, berges, points de vue ; aucun commerce). **Coordonnées approximatives, à vérifier sur place avant le lancement.**
- API `campusLife.spots` (contrat `campus-life.ts`), page `(app)/campus/spots` : carte MapLibre (épingles numérotées, cadrage sur tous les lieux) et liste filtrable par type, entrée dans l'onglet Campus.
- Fond de carte : `NEXT_PUBLIC_MAP_STYLE_URL` (style auto-hébergé ou ouvert, à choisir au déploiement : OpenFreeMap, Protomaps…). Sans elle, fond uni. **À l'activation** : ajouter l'hôte des tuiles à la CSP (`connect-src`, `img-src`) et le mentionner dans la politique de confidentialité.
- Le worker de MapLibre 6 est servi par `app/(app)/campus/spots/maplibre/[file]/route.ts` (deux fichiers fixes du paquet) ; pour un déploiement `standalone`, ajouter `node_modules/maplibre-gl/dist/maplibre-gl-{worker,shared}.mjs` à `outputFileTracingIncludes`.

### Relances douces (CHAT-09)

- Les matchs n'expirent pas. Après 3 jours de silence (`packages/core/src/messaging/nudge.ts`), les deux membres reçoivent une notification discrète `chat_nudge` (groupe « Messages »), une seule fois par silence (colonne `match.nudged_at`, migration 0010), à 18 h heure du campus (tâche horaire `chat_nudge`, `apps/worker/src/tasks/messaging/nudge.ts`), seulement si `canMessage` l'autorise toujours.
- La conversation affiche « Ça fait quelques jours avec … Envie de relancer ? » qui ouvre les brise-glace (`thread.nudge`).

### Stickers et GIF (CHAT-05)

- 13 stickers maison (`packages/core/src/messaging/stickers.ts` pour les identifiants, dessins SVG dans `apps/web/components/rencontre/chat/stickers.tsx`) : atomes, liaison, étincelle, café, visages, et un sticker par école aux couleurs et glyphes de l'app (jamais un logo d'école).
- Nouveau type de message `sticker` (migration 0009) ; les messages non textuels gardent une petite charge JSON dans le corps chiffré (`chatMessage.attachment`). Aperçu de la liste des conversations par type (`lastMessage.kind`).
- GIF GIPHY derrière un drapeau : actif seulement si `GIPHY_API_KEY` est défini. Recherche relayée par l'API (seuls les mots cherchés partent chez GIPHY, jamais l'identité), GIF re-téléchargé par identifiant avant l'envoi (aucune URL arbitraire), hôtes `*.giphy.com` seulement, mention « Propulsé par GIPHY ». **À l'activation** : ajouter `media*.giphy.com` à la CSP `img-src` (A) et le mentionner dans la politique de confidentialité (les images sont chargées depuis GIPHY).
- Sélecteur dans la zone de saisie (onglets Stickers / GIF quand GIPHY est actif).
- Robustesse : un corps de message indéchiffrable (clé retirée) s'affiche vide au lieu de faire échouer toute la conversation.

### Modifier, supprimer, avertir (CHAT-08, SAF-09, SAF-10)

- Règles dans `packages/core/src/messaging/rules.ts` : modification (texte seulement) et suppression pour tout le monde par l'expéditeur, dans les 10 minutes (même fenêtre pour les deux : on ne réécrit pas un vieux message après un signalement) ; `needsSendWarning` (insulte) et `isPotentiallyOffensive` (insulte, cris).
- API `messaging.edit` (re-chiffrement, re-modération, mention « modifié ») et `messaging.remove` (garde de fenêtre refaite en SQL, réactions supprimées) ; `chatMessage.flagged` pour le destinataire.
- Un message supprimé disparaît pour les deux membres mais son corps chiffré est conservé 30 jours pour la modération (sinon un harceleur effacerait avant le signalement), puis effacé par la tâche quotidienne `message_purge` (`apps/worker/src/tasks/messaging/`). **À valider avec A** (signalements) et dans le registre RGPD.
- Interface : actions « Modifier » et « Supprimer pour tout le monde » dans le menu du message, bandeau de modification dans la zone de saisie, feuille « Tu es sûr·e de vouloir envoyer ça ? » (reformuler par défaut, ou envoyer quand même), lien « Ce message te dérange ? Signaler » sous un message signalé par le palier 1.

### Photos et messages vocaux (CHAT-06, CHAT-07)

- Stockage objet `@epilove/db/storage` (S3 compatible via `aws4fetch`, SeaweedFS en développement ; magasin en mémoire pour les tests) : clés `chat/<matchId>/<messageId>.<ext>`, jamais publiques. Photos servies par imgproxy (URL signée, 1 heure ; 1 minute pour une photo éphémère), vocaux par URL S3 présignée (1 heure).
- `packages/api/src/rencontre/media-files.ts` : reconnaissance du format par les octets (JPEG, PNG, WebP ; WebM, Ogg, MP4 audio ; jamais le type annoncé par le client), suppression des métadonnées (EXIF, XMP, ICC, commentaires, blocs texte PNG) avant stockage, classifieur d'images remplaçable (`setImageClassifier`).
- Le navigateur redessine déjà la photo sur un canvas (1 600 px au plus, JPEG) : EXIF et GPS ne quittent pas l'appareil ; le serveur les retire de nouveau.
- API `messaging.sendImage` (8 Mo, option éphémère), `sendVoice` (2 minutes, 64 barres de forme d'onde), `viewMedia` (photo éphémère : une seule ouverture par le destinataire, réservée atomiquement ; l'objet est effacé 2 minutes après). Un renvoi avec le même identifiant rend le message existant sans remplacer son média (sinon un second fichier contournerait le classifieur).
- Table `media_deletion` (file d'effacement) et tâche `media_purge` toutes les 5 minutes (`apps/worker/src/tasks/messaging/purge.ts`) : photos éphémères ouvertes, médias des messages supprimés purgés après 30 jours. Un échec d'effacement est retenté.
- Interface : bouton photo (aperçu, case « Éphémère : une seule ouverture »), bouton micro à la place d'« Envoyer » quand le champ est vide (enregistrement MediaRecorder 64 kbit/s, arrêt automatique à 2 minutes, écoute avant envoi), lecteur avec forme d'onde et vitesses 1×/1,5×/2×, photo floutée avec « Afficher quand même » et « Signaler » quand le classifieur la signale. Sur téléphone, les outils de la zone de saisie se replient derrière « + ».
- **Non fait** : transcription des vocaux (CHAT-07, accessibilité) ; classifieur réel (SAF-11, aujourd'hui aucun signalement : toutes les photos s'affichent nettes).

### Question de la semaine (COM-01), indice inter-écoles (COM-02), statistiques du Pacte (PAC-04)

- `packages/core/src/community/community.ts` : semaine ISO à l'heure du campus (`isoWeek`, `weekEndsAt`), rotation de la banque (`questionForWeek`), accord sur les questions récentes (`weeklyAgreement`), et les règles d'anonymat communes : `ANONYMITY_THRESHOLD = 10`, `anonymousResults` (une école n'apparaît qu'à partir de 10 réponses, et le total du campus n'est affiché que si ce qui est caché est nul ou d'au moins 10 : pas de déduction par soustraction ; testé par propriété), `crossSchoolIndex` (paires d'écoles différentes d'au moins 10 liaisons, sans total).
- Tables `weekly_question` (banque de 16 questions légères, seed `packages/db/src/seeds/weekly-questions.ts`, jamais de religion, politique, santé ou origine) et `weekly_answer` (une réponse par membre et par semaine, modifiable jusqu'au lundi). Dépôt `packages/db/src/repositories/campus-community.ts` (comptes par école, sans les comptes bannis, suspendus ou supprimés).
- La réponse « alimente la compatibilité » : signal `weeklyAgreement` dans le classement du deck (part de réponses identiques sur les 8 dernières semaines, au moins 2 en commun, poids léger centré sur 0,5 : neutre sans données).
- API `community.weekly`, `answerWeekly` (résultats seulement après avoir répondu), `crossSchool` (7 derniers jours, les deux modes ensemble), `pactStats` (dernière saison révélée : participants, liaisons, part inter-écoles à partir de 10 liaisons, et jusqu'à 5 « faits » sur les sections `campus`, `nerd` et `lifestyle` du questionnaire, jamais `values` ni `plans`).
- Interface : `(app)/campus/question` (réponse, barres pour le campus et par école aux couleurs de l'app), `(app)/campus/indice`, section « Le Pacte en chiffres » sous les résultats du Pacte, deux cartes dans l'onglet Campus. Données de développement : réponses des membres fictifs sur 8 semaines (Inès n'a pas répondu à celle de la semaine).

### Kit sécurité date (IRL-03)

- `packages/core/src/messaging/date-safety.ts` : règles (question 3 heures après le début, lien valable 24 heures après le début, 3 liens actifs par date, 10 par jour), état d'un lien, numéros d'urgence (112, 17, 114 par SMS, 3919, d'après SAF-15).
- Table `date_share` : un lien par personne de confiance, retrouvé par l'empreinte SHA-256 de son jeton (32 octets aléatoires) ; le jeton et les détails (prénoms, lieu, heure, coordonnées du Spot) sont chiffrés avec la clé des messages. Créer deux fois avec le même identifiant rend le même lien.
- API `dateSafety.share` (conversation ouverte et date accepté obligatoires), `kit`, `checkIn`, `revoke` (il suffit d'être l'auteur du lien : le kit reste utilisable après un blocage ou un unmatch, c'est justement là qu'il sert), et `shared`, **publique** (sans compte, `NOT_FOUND` dès que le lien a expiré ou a été arrêté).
- Tâche `date_check_in` toutes les 5 minutes : notification `date_check_in` (« Petite vérification : tout va bien ? » en push, sans mot « date » sur l'écran verrouillé), une seule par date même avec plusieurs liens.
- Interface : bouton « Kit sécurité » sur un date accepté (jusqu'à 24 heures après le début), feuille avec création, copie, partage natif et arrêt des liens, numéros d'urgence et lien vers `/aide` ; page du membre `(app)/messages/securite/[shareId]` (« Tout s'est bien passé ? », puis signalement et ressources si « Pas vraiment ») ; page publique `/partage/[token]` (non indexée, `referrer: no-referrer`) qui affiche la réponse.
- Ce que voit la personne de confiance : le prénom de la personne qui partage, le prénom du match, le lieu, l'heure et la réponse au check-in. Rien d'autre (ni photo, ni école, ni conversation).

### Événements (IRL-01)

- `packages/core/src/events/events.ts` : règles (titre, lieu, au plus un an à l'avance, 24 heures au plus, 3 heures par défaut sans heure de fin), `canOrganize` (rôles `organizer` et `admin`), `attendanceVisible` (réciprocité). `canUseApp` ajouté aux politiques (compte utilisable et majeur).
- Tables `event` (nom de l'asso affiché, jamais le nom de la personne qui publie ; `school_ids` vide = tout le campus ; lieu libre ou Spot, dont le nom devient le lieu) et `event_rsvp` (« J'y vais » / « Peut-être », partage avec ses matchs, désactivé par défaut). Dépôt `packages/db/src/repositories/campus-events.ts`.
- API `events.list` (à venir / mes événements ; un événement annulé reste visible pour qui avait répondu), `get` (avec les matchs qui y vont **seulement si la personne partage aussi sa réponse**, filtrés par `canViewProfile` : bloquer ou masquer fait disparaître), `rsvp` (idempotent, `null` pour retirer), `create`, `update`, `cancel` (notification `event_cancelled` aux personnes qui avaient répondu, nouveau groupe de préférences « Événements »).
- Le rôle d'organisateur est relu en base à chaque action (`roleOf`) plutôt que pris dans la session : un rôle retiré s'applique tout de suite, et le résolveur de développement ne connaît que `moderator` et `admin`.
- Interface `(app)/campus/evenements` (liste à venir / mes événements, détail avec réponse, partage, matchs présents, fichier `.ics`, édition et annulation pour l'organisateur, formulaire de création avec Spot ou lieu libre et écoles concernées). Carte « Événements » dans l'onglet Campus.
- Données de développement : Sarah (membre 3, ISG) est organisatrice et publie 6 événements fictifs (associations inventées) avec des réponses ; Inès et Hugo partagent leur venue au premier.
- **Non fait** : image de couverture (`cover_key` prévu, l'en-tête utilise un dégradé) ; signalement d'un événement (le contrat `safety.report` prévoit le contexte `event`, il faudra choisir qui est signalé : l'organisateur).

### Crush secret (DEC-08) et seconde chance (DEC-09)

- `packages/core/src/discovery/crush.ts` : règles (3 crushs actifs, 90 jours, 10 ajouts par 30 jours retraits compris, contre le sondage), indice affiché au membre (« a•••@epita.fr »), mode du match (`crushMatchMode` : mêmes règles que la découverte dans les deux sens, incognito levé comme pour un like réciproque, Love si possible sinon Amis).
- Table `secret_crush` (empreinte HMAC de l'adresse seulement, jamais l'adresse ; retrait logique pour compter les ajouts), dépôt `packages/db/src/repositories/discovery-crush.ts` : ajout sous double verrou consultatif (la paire d'empreintes, puis le quota) pour que deux crushs réciproques simultanés se trouvent, recherche du crush inverse, création du match `source = crush` (notifications et événements comme un match par like).
- API `discovery.crushes`, `addCrush` (même réponse que la personne soit inscrite ou non ; `matched` seulement si réciproque et autorisé par les politiques), `removeCrush`. Empreinte calculée par `packages/api/src/rencontre/email.ts` (`EMAIL_HMAC_SECRET`).
- Interface `(app)/likes/crush` (saisie, liste avec indice et échéance, retrait, texte de confidentialité sobre, écran « Liaison établie » si réciproque) et entrée depuis « Likes ».
- `packages/core/src/discovery/second-chance.ts` : un profil passé revient après 45 jours seulement s'il a changé depuis (photo approuvée, réponse à un prompt écrite ou modifiée) ; un like ne revient jamais. Appliqué au deck et au Drop (`lastSignificantChanges`), badge « Seconde chance » sur la carte (`deck.secondChance`).
- Fabrique de test : option `emailHmacSecret` et `testMemberEmail`.

### Drop du soir (DEC-07)

- `packages/core/src/discovery/drop.ts` : règles (5 profils, 10 apparitions au plus par profil et par jour, calcul à 20 h 30, publication à 21 h, 24 heures), heures du campus avec changement d'heure (`campusInstant`), jour du Drop visible (`dropDayAt`), affectation gloutonne sous contrainte de capacité (`assignDrops`, docs/06 section 8, version 1), testée par propriétés (taille, plafond, paires proposées seulement, maximalité).
- `packages/core/src/discovery/filter.ts` : filtres du deck (DEC-06) déplacés de l'API vers le cœur pour servir aussi au Drop (`matchesDeckFilter`).
- Table `drop_run` (un calcul par jour : réservé, calculé, publié ; statistiques agrégées) et index sur `drop.day`. Dépôt `packages/db/src/repositories/discovery-drop.ts`.
- Worker `apps/worker/src/tasks/drop/` : tâche `drop_tick` chaque minute (le crontab n'a pas de fuseau : l'heure du campus est vérifiée dans la tâche), calcul (politiques d'accès, historique, critères éliminatoires, filtres du membre, score réciproque, 40 meilleurs candidats par membre, affectation), publication à 21 h (notification `drop_ready`, événement `drop.ready`), idempotent et rattrapable. `pnpm drop:run [--day] [--no-publish]` en développement : 371 Drops en 0,8 s sur les 400 membres fictifs.
- API `discovery.drop` (profils non encore décidés et toujours visibles, revérifiés à la lecture ; heure du prochain Drop ; impressions `drop`). Les profils du Drop en cours sont exclus du deck.
- Interface : en-tête « Le Drop » dans Découvrir (compte à rebours, puis les cinq profils en bande horizontale vers leur profil ; mise à jour en direct sur `drop.ready`).

### Divers

- `packages/core/src/messaging/ids.ts` : génération et lecture d'UUIDv7 (messages envoyés par le client).
- Client API côté navigateur (`apps/web/lib/rencontre/api.client.ts`, TanStack Query via `@orpc/tanstack-query`) et côté serveur (`api.server.ts`, appel en mémoire de `apiApp` avec les cookies de la requête).

## Fichiers partagés modifiés

| Fichier | Modification |
|---|---|
| `package.json` (racine) | scripts `db:seed:dev`, `pact:compute`, `pact:demo`, `drop:run` |
| `pnpm-workspace.yaml` | catalogue : `maplibre-gl` (6.11.2), `@serwist/turbopack`, `serwist`, `esbuild` (0.28.2, pair de Serwist), `web-push`, `@types/web-push`, `@orpc/tanstack-query`, `@tanstack/react-query` (5.104.0, la 5.104.1 a moins de 24 h), `aws4fetch`, `centrifuge`, `motion` (13.5.0, la 14.0.0 a moins de 24 h) ; `allowBuilds` : `protobufjs: false` (script d'information seulement, tiré par `centrifuge`) |
| `packages/db/package.json` | dépendances `@epilove/crypto` et `aws4fetch` (stockage des médias de conversation), script `db:seed:dev`, exports `./repositories/*`, `./dev-seed`, `./storage` et `./testing` (fabriques de membres pour les tests d'intégration, identifiants aléatoires) |
| `apps/web/package.json` | dépendances `maplibre-gl`, `@epilove/contracts`, `@epilove/crypto`, `@epilove/media`, `@orpc/tanstack-query`, `@tanstack/react-query`, `centrifuge`, `motion` |
| `packages/contracts/src/index.ts`, `packages/api/src/router.ts` | modules `campusLife`, `community`, `dateSafety`, `dev`, `discovery`, `events`, `matches`, `messaging`, `notifications`, `pact`, `questionnaire`, `realtime` (ajouts) |
| `packages/api/src/app.ts` | intercepteur `onError` qui journalise la classe des erreurs inattendues (jamais le message, qui peut contenir des paramètres SQL) : sans lui, oRPC masquait silencieusement les 500 |
| `apps/web/i18n/messages.ts` | namespaces `campus`, `chat`, `discovery`, `events`, `likes`, `matches`, `notifications`, `pact`, `questionnaire`, `spots` (ajouts) |
| `packages/core/src/index.ts` | `community/community`, `discovery/crush`, `discovery/drop`, `discovery/filter`, `discovery/ranking`, `discovery/second-chance`, `discovery/rules`, `events/events`, `matching/explain`, `messaging/date-safety`, `messaging/ids`, `pact/*`, `policies/profile-access` (ajouts) ; `sharedModes` exporté de `can-see.ts` |
| `packages/db/src/seeds/index.ts` | seeds `questions`, `spots`, `weekly-questions` (ajouts) |
| `packages/db/src/schema/index.ts` | `community`, `date-safety`, `events`, `spots` (ajouts) |
| `infra/centrifugo/config.json` | `presence: true` sur l'espace `personal` (statut en ligne entre matchs) ; origines `127.0.0.1:3000` et `localhost/127.0.0.1:3100` (Playwright) |
| `.env.example` | section `# Session B` |
| `apps/worker/src/index.ts`, `apps/worker/src/env.ts`, `apps/worker/src/tasks/index.ts` | démarrage du relais de l'outbox, variables Centrifugo facultatives, point de santé facultatif (`WORKER_HEALTH_PORT`), tâches `outbox_purge`, `pact_reveal`, `pact_reveal_due`, `drop_tick`, `message_purge`, `media_purge`, `date_check_in`, `chat_nudge` (ajouts) |
| `apps/worker/package.json` | dépendance `@epilove/core`, scripts `pact:compute`, `pact:demo`, `drop:run` |
| `turbo.json` | `ENCRYPTION_KEYS`, `ENCRYPTION_CURRENT_KEY_ID` et `EMAIL_HMAC_SECRET` transmis aux tests : le test du dépôt `members` ré-exécute le seed de développement, qui chiffrait sinon les messages fictifs avec la clé de test, illisibles ensuite par `pnpm dev` |
| `.github/workflows/ci.yml` | job `pact-solver` (uv installé par `pipx`, ruff, pytest) : les tests Python ne passent pas par `pnpm test`, faute d'`uv` dans le job `quality` |
| `apps/web/playwright.config.ts` | chargement de `../../.env` (les scénarios de B créent leurs membres en base) et second `webServer` pour le worker |
| `apps/web/next.config.ts` | `transpilePackages` : `@epilove/crypto`, `@epilove/media`, `@epilove/realtime` ; `serverExternalPackages` : `esbuild`, `esbuild-wasm` (Serwist) ; `Permissions-Policy` avec `microphone=(self)` sur `/messages/*` seulement (messages vocaux), le reste du site garde `microphone=()` |
| `apps/web/tsconfig.json`, `apps/web/package.json` | `service-worker/` exclu du tsconfig principal et vérifié par son propre tsconfig (lib WebWorker) dans `typecheck` |
| `infra/scripts/cloud-docker.sh` | repli sur l'image Docker Hub `darthsim/imgproxy` (même version) quand le proxy de la session cloud bloque les téléchargements de ghcr.io |

## Variables d'environnement

- `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET` (existantes) servent aussi aux médias de conversation ; `S3_REGION` facultative (`eu-west-1` par défaut). Les URL présignées des vocaux pointent vers `S3_ENDPOINT` : en production, il doit être joignable par les navigateurs (sinon prévoir un point d'accès public distinct). Sans S3 configuré, l'API garde les médias en mémoire (tests seulement).

- `GIPHY_API_KEY` (facultative, API) : active les GIF (CHAT-05). Absente : stickers seulement.

- `PACT_SOLVER_COMMAND`, `PACT_SOLVER_DIRECTORY` (facultatives, worker) : commande et dossier du solveur du Pacte dans un conteneur (par défaut `uv run --frozen --extra cpsat python -m pact_solver` depuis `apps/pact-solver`).

- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (section « Session B » de `.env.example`, paire de développement) : Web Push. Facultatives pour le worker et l'API (sans elles : centre de notifications seulement).
- `CENTRIFUGO_WS_URL` (facultative, section « Session B » de `.env.example`) : URL WebSocket de Centrifugo vue par les navigateurs ; déduite de `CENTRIFUGO_URL` si absente.
- Le worker lit désormais `CENTRIFUGO_URL` et `CENTRIFUGO_HTTP_API_KEY` (facultatives : sans elles, le relais de l'outbox ne démarre pas).

## Migrations

- `0015_*` : tables `weekly_question` et `weekly_answer`.
- `0014_*` : table `date_share`.
- `0013_*` : tables `event` et `event_rsvp`.
- `0012_*` : table `media_deletion`.
- `0011_*` : table `spot`.
- `0010_*` : colonne `match.nudged_at`.
- `0009_*` : type de message `sticker`.
- `0008_*` : table `secret_crush`.
- `0007_*` : table `drop_run`, index `drop (day)`.
- `0006_*` : `pact_season.report`, `computed_at`, `revealed_at` ; `pact_result.match_id` (+ index `(season_id, user_high)`).

- `0005_*` : colonne `notification.pushed_at` (+ index partiel), table `notification_preference`.
- `0004_*` : table `chat_preference`, index `message (sender_id, created_at)` (quota anti-spam).
- `0003_*` : tables `impression`, `discovery_filter`, `discovery_undo` (jetable, à régénérer à la fusion).

## Mises à jour souhaitées dans CLAUDE.md / README / docs

- docs/03 (PWA) : le service worker ne met en cache ni pages ni réponses d'API, par choix de confidentialité (appareils partagés).
- Les réglages « accusés de lecture » et « statut en ligne » sont dans `(app)/reglages/notifications` (périmètre de B) ; A peut préférer les déplacer dans la confidentialité.

- `CLAUDE.md`, section Commandes : ajouter `pnpm db:seed:dev` (membres fictifs, photos de synthèse, page `/dev`), `pnpm pact:compute` et `pnpm pact:demo --reveal-in 60` (le worker doit tourner), et l'installation de `uv` pour le solveur.
- docs/06, section 9 : le solveur par défaut reste networkx (CP-SAT n'a pas prouvé l'optimum en 5 minutes sur des scores de questionnaire) ; le Pacte lève l'incognito pour la paire (participer vaut consentement, dit à l'inscription).
- `pnpm test` relance le seed de développement (test d'intégration de `members.ts`) : la participation à un Pacte de démonstration est alors effacée ; relancer `pnpm pact:demo`.

- `apps/web/AGENTS.md` et `apps/web/CLAUDE.md` sont générés par `next dev` (Next.js 16.3) et recommandent de les committer : ils renvoient vers la documentation embarquée dans `node_modules/next/dist/docs/`.

## Points d'intégration

- Les pages de B affichent un écran « connecte-toi » (`GateScreen`) sur UNAUTHORIZED, avec un lien vers `/dev` en développement et `/connexion` sinon : **à aligner sur la route de connexion de A**. Sur `FORBIDDEN profile_required`, lien vers `/onboarding`.
- Les pages de B enveloppent leurs segments dans `RencontreProviders` (TanStack Query + `MotionConfig reducedMotion="user"`) via leurs propres `layout.tsx` ; à l'intégration, on peut remonter ce provider dans `(app)/layout.tsx`.

- Les pages `/dev` et les clients API lisent le cookie de développement ; une fois Better Auth branché par A, `serverApi()` transmet déjà les cookies de la requête : rien à changer côté B.
- Remplacer les prompts et intérêts `dev-` par le catalogue de A (le seed de développement les réutilisera s'ils existent, ou on adaptera `content.ts`).
- Harmoniser la règle « profil complet » avec la complétude de A (PRO-05).
- `RencontreProviders` enregistre le service worker (PWA, push) : à remonter dans le layout racine à l'intégration pour couvrir toute l'app.
- `RencontreProviders` monte une connexion temps réel par section ; à l'intégration, le remonter dans `(app)/layout.tsx` pour garder une seule connexion entre les onglets.
- Administration du Pacte (ADM-07, A) : créer et ouvrir les saisons (`pact_season`, statut `open`), lancer `pnpm pact:compute` et lire `pact_season.report` ; la révélation est automatique à `reveal_at` une fois la saison `computed`.
- Le worker doit disposer de Python et du solveur (`apps/pact-solver`) dans son conteneur, ou d'un conteneur dédié pour `pact:compute`.
- CSP (A, `proxy.ts`) : autoriser l'hôte d'imgproxy dans `img-src` (photos de conversation, déjà le cas des photos de profil), l'hôte S3 public dans `media-src` (URL présignées des vocaux) et `blob:` dans `img-src` et `media-src` (aperçus locaux avant envoi).
- Suppression de compte (A) : effacer aussi les médias de conversation (préfixe `chat/<matchId>/` des matchs du membre), par exemple en les mettant dans `media_deletion`.
- Modération (SAF-11, A) : brancher le vrai classifieur via `setImageClassifier` ; les photos signalées portent le drapeau `explicit_image` dans `message.moderation`.
- `proxy.ts` (A) : la route `/partage/*` doit rester **publique** (personne de confiance sans compte) ; c'est la seule page de B hors connexion.
- Rôle `organizer` (IRL-01) : l'espace organisateurs du back-office (ADM-08) attribue ce rôle aux comptes des BDE ; l'app lit `app_user.role`.
- Le menu de sécurité d'une conversation et le signalement d'un message appellent `safety.block` / `safety.report` (contexte `message`, `contextRef` = id du message) : à vérifier avec l'implémentation de A (copie chiffrée des messages précédents comme preuve).

## ADR

- `docs/adr/0020-evenements-temps-reel-sans-donnees.md` : les événements Centrifugo ne transportent que des identifiants ; le contenu passe par l'API.
- `docs/adr/0021-solveur-du-pacte.md` : solveur Python ponctuel (JSON sur stdin/stdout) appelé par le worker, règles et graphe en TypeScript, révélation par l'outbox.

## Questions ouvertes

- Aucune pour l'instant.
