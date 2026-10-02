# ADR-0012 — Routage des langues (français, anglais)

- **Statut** : accepté
- **Date** : 2026-10-02
- **Auteurs** : session A

## Contexte

PLT-04 demande une interface en anglais pour les étudiantes et étudiants internationaux. Les messages sont déjà séparés par langue (`apps/web/messages/<langue>/<namespace>.json`) et tous les textes passent par next-intl. Il reste à choisir comment une requête connaît sa langue.

Contraintes : la vitrine et les pages légales doivent avoir une URL par langue (partage, `hreflang`) ; les pages de l'application appartiennent aux deux sessions de développement et ne doivent pas être déplacées ; la langue doit suivre la personne d'un appareil à l'autre et décider de la langue des emails (code de connexion compris, envoyé avant toute session).

## Options envisagées

1. **Segment `[locale]` pour toute l'application** (`app/[locale]/…`) — la solution standard de next-intl, mais elle déplace toutes les pages, y compris celles de la session B, et casse la fusion.
2. **Plusieurs layouts racines** (un par groupe de routes, `[locale]` pour la vitrine seulement) — garde la vitrine statique, mais supprime `app/layout.tsx`, demande `global-not-found` (expérimental) et provoque un rechargement complet entre la vitrine et l'application.
3. **Résolution dans `proxy.ts`, transmise par un en-tête** — un seul layout racine, rendu à la demande.

## Décision

Option 3.

- `proxy.ts` résout la langue de chaque page : préfixe d'URL (`/en/…`, réécrit vers la page sans préfixe), puis cookie `NEXT_LOCALE` (choix explicite), puis `Accept-Language`, puis le français. Il la transmet dans l'en-tête de requête `x-epilove-locale`, lu par `i18n/request.ts`.
- Les pages publiques traduites (`/`, `/legal/*`) ont une URL par langue : français sans préfixe, anglais sous `/en`. Une personne dont la langue préférée est l'anglais est redirigée (307, `Vary: Cookie, Accept-Language`) ; `/fr/…` redirige vers l'URL sans préfixe. Ces pages déclarent leurs alternatives `hreflang`.
- Les pages de l'application n'ont pas de préfixe : leur langue vient du cookie ou du navigateur.
- Le sélecteur FR / EN est un formulaire avec une Server Action : il pose le cookie (un an, `HttpOnly`, choix explicite donc nécessaire au service), enregistre `app_user.locale` pour un membre connecté, puis recharge la page dans la nouvelle langue. Il fonctionne sans JavaScript.
- Le client Better Auth envoie la langue de la page (`x-epilove-locale`) : le code de connexion part dans cette langue, et un nouveau compte la reçoit. À chaque connexion, le cookie reprend la langue du compte.
- Les emails (code, liste d'attente, modération, export, re-vérification) sont rédigés dans les deux langues et envoyés dans la langue du compte.

## Conséquences

- Toutes les pages sont rendues à la demande, vitrine comprise : le classement de la course reste servi depuis un cache de 30 secondes côté serveur. Si le temps de réponse de la vitrine devient un problème, l'option 2 pourra être reprise après la fusion des deux sessions.
- Les liens entre pages publiques passent par `publicHref(locale, chemin)` (`apps/web/i18n/paths.ts`) pour garder la langue.
- Le back-office reste en français (ADR 0011).
- Les catalogues de prompts et d'intérêts sont déjà bilingues ; les textes saisis par les membres ne sont pas traduits.
