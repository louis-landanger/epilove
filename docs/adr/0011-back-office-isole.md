# ADR-0011 — Back-office isolé et vue pseudonymisée

- **Statut** : accepté
- **Date** : 2026-10-02
- **Auteurs** : session A

## Contexte

docs/04 prévoit un back-office « application séparée, sous-domaine séparé, derrière Cloudflare Access + passkeys ». docs/07 (A5) impose le moindre privilège : identifiants pseudonymisés, identité révélée seulement si nécessaire et de façon tracée, chaque action journalisée. Les modérateurs sont des étudiants bénévoles, donc aussi des membres de l'application.

## Options envisagées

1. **Pages `/admin` dans l'application web** — une seule session, mais le back-office partage le domaine, les cookies et la surface d'attaque de l'application publique.
2. **Application séparée qui réutilise la session de l'application** — nécessite des cookies partagés entre sous-domaines : une session membre volée ouvrirait le back-office.
3. **Application séparée avec ses propres sessions** — même base, mêmes contrats, mais authentification distincte.

## Décision

Option 3 : `apps/admin` (Next.js, port 3001) monte sa propre instance Better Auth (`createAuth` avec `allowSignUp: false`, sessions de 8 heures, cookie `epilove-staff`). Seuls les comptes existants peuvent se connecter ; la mise en page refuse tout rôle autre que `moderator` ou `admin`, et chaque procédure `admin.*` vérifie le rôle (`requireRole`). L'édition des catalogues est réservée aux `admin`.

Les membres apparaissent sous un pseudonyme stable (`M-7KQ2XA`, HMAC de l'identifiant) ; le prénom et l'adresse ne sont révélés que sur justification écrite, inscrite au journal d'audit. L'ouverture d'un signalement (déchiffrement des détails) est aussi journalisée. Les décisions exigent une règle de la charte et une motivation d'au moins 40 caractères, envoyée par email à la personne (DSA, art. 17) ; la personne qui a signalé est informée sans détail.

En production, le sous-domaine du back-office est placé derrière Cloudflare Access (en plus des sessions propres) ; un bannissement révoque aussi les sessions de l'application membre.

## Conséquences

- Aucune session membre ne donne accès au back-office, et inversement.
- Les rôles se donnent avec `pnpm db:promote <email> <rôle>` ; un modérateur doit d'abord s'inscrire sur l'application.
- L'interface du back-office est en français uniquement (outil interne).
- À revoir : passkey obligatoire pour le personnel (aujourd'hui proposée, pas imposée), récusation automatique d'un modérateur de la même promo que la personne signalée.
