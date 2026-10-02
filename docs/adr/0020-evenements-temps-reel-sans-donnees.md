# ADR-0020 — Événements temps réel sans données personnelles

- **Statut** : accepté
- **Date** : 2026-10-02
- **Auteurs** : session B (Rencontre)

## Contexte

La messagerie (CHAT-02) et les autres événements en direct (match, like reçu, lecture, saisie, révélation du Pacte) passent par Centrifugo (ADR 005 de docs/03). Centrifugo garde un historique court en mémoire sur les canaux personnels (100 événements, 5 minutes) pour rejouer les événements manqués après une coupure. Les corps de messages sont chiffrés côté application en base (docs/05, section 5) ; les publier en clair dans Centrifugo créerait une seconde copie, hors du contrôle d'accès de l'API, et les journaux ou l'historique de Centrifugo pourraient en contenir.

## Options envisagées

1. **Publier le message complet** (texte, prénom de l'expéditeur) : une requête de moins pour le destinataire, mais du texte en clair dans Centrifugo, un double chemin d'accès aux données et un risque de fuite si un canal était mal protégé.
2. **Publier uniquement des identifiants** (`message.created { matchId, messageId }`) : le client va chercher le contenu par l'API (`messaging.history` avec `after`), où les politiques `canMessage` s'appliquent à chaque lecture.

## Décision

Option 2. Les événements temps réel ne transportent que des identifiants et des booléens (`packages/realtime/src/events.ts`, schéma Zod partagé). Aucun corps de message, prénom, préférence ou contenu de profil ne transite par Centrifugo.

Publication :

- événements durables (match, message, lecture, like) : table `outbox` écrite dans la transaction métier, `pg_notify` délivré au commit, relais du worker qui publie sur `personal:#<userId>` avec une clé d'idempotence (l'identifiant de l'événement) ;
- événement éphémère « en train d'écrire » : publié directement par l'API, au mieux.

## Conséquences

- Plus facile : la récupération après coupure se fait par la même procédure que l'historique (`after` = dernier identifiant connu), que Centrifugo ait pu rejouer les événements ou non ; aucune donnée personnelle à purger dans Centrifugo.
- Plus coûteux : une requête API par nouveau message reçu (latence d'environ un aller-retour, compatible avec l'objectif p95 < 1 s de docs/11).
- Remise en cause si la latence mesurée dépasse l'objectif ou si la charge de la révélation du Pacte l'exige (on pourrait alors chiffrer de bout en bout le contenu publié).
