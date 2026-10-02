# CLAUDE.md

Contexte pour les assistants de code travaillant sur ce dépôt.

## Le projet

Epilove (nom de code) : application de rencontre et d'amitié réservée aux étudiants vérifiés du campus IONIS de Lyon (EPITA, ESME, Sup'Biotech, ISG, IPSA). Le plan complet est dans `docs/` : **lire le document concerné avant d'implémenter une fonctionnalité**. Les fonctionnalités ont des identifiants stables (`DEC-02`, `SAF-04`…) définis dans `docs/01-fonctionnalites.md` ; les citer dans les issues, branches et PR.

Statut : phase 0. La stack cible et l'organisation du monorepo sont décrites dans `docs/03-stack.md` et `docs/04-architecture.md`. Ajouter ici les commandes (installation, dev, tests, lint) dès que le monorepo est initialisé.

## Invariants à ne jamais enfreindre

- Toute lecture de données liées à une personne passe par les politiques d'accès de `packages/core` (`canSee`, `canViewProfile`, `canMessage`…). Pas de requête directe qui contourne les blocages, masquages, pauses ou bannissements.
- Aucune donnée personnelle dans les journaux, les erreurs ou l'analytique : ni email, ni prénom, ni message, ni préférence de genre ou d'orientation.
- Les préférences de genre et d'orientation sont des données sensibles (RGPD, article 9) : consentement explicite séparé, jamais exportées.
- Les corps de messages sont chiffrés côté application ; les médias sont servis uniquement via des URL signées et expirantes.
- Âge minimum 18 ans, contrôle bloquant.
- Les noms des écoles servent uniquement à décrire l'éligibilité ; jamais de logo ni de charte graphique d'école.
- Les mutations sensibles (like, message, signalement) sont idempotentes et soumises à des quotas.

## Conventions

- TypeScript strict partout ; code, identifiants et commits en anglais ; documentation et textes de l'interface en français (anglais en seconde langue).
- Conventional Commits.
- `packages/core` ne dépend d'aucun framework.
- Toute correction de bug commence par un test qui le reproduit.
- Textes de l'interface : tutoiement, ton léger et inclusif, jamais graveleux ; les textes de sécurité et juridiques restent sobres (voir `docs/02-design.md`, section Ton éditorial).
- Une décision structurante = un ADR dans `docs/adr/`.
