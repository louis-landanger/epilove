# ADR-0015 — « Atomes » remplace le nom de code « Epilove »

- **Statut** : accepté (nom provisoire jusqu'aux vérifications de marque)
- **Date** : 2026-10-04

## Contexte

« Epilove » renvoie à EPITA alors que quatre écoles sur cinq ne sont pas EPITA ([00 — Vision](../00-vision.md#nom-et-identité)). Le nom apparaissait dans l'interface, les e-mails, les paquets du monorepo (`@epilove/*`), la base de données, les cookies et l'infrastructure. La vision recommandait « Atomes » (« Trouve tes atomes crochus. »), concept déjà porté par le design.

## Options envisagées

1. **Changer seulement les textes visibles** : peu de fichiers touchés, mais deux noms coexistent durablement dans le code et la documentation.
2. **Tout renommer maintenant** : un seul nom partout, au prix d'un commit large et d'une réinitialisation des environnements locaux.
3. **Attendre le vote des ambassadeurs** : évite un second renommage si le vote choisit autre chose, mais le serveur de développement partagé et les captures d'écran circulent déjà avec « Epilove ».

## Décision

Option 2, en phase 0 tant qu'aucune donnée réelle n'existe : « Atomes » dans l'interface (mot-symbole `atomes.`), les e-mails, la documentation, les paquets (`@atomes/*`), la base (`atomes`), le préfixe des cookies, les en-têtes internes (`x-atomes-locale`), les clés de stockage du navigateur et l'infrastructure (`infra/compose`, `infra/dev-host`).

Restent inchangés : l'adresse du dépôt GitHub (à renommer dans GitHub, qui redirige l'ancienne adresse), les archives `docs/prompts/` et la mention historique d'« Epilove » dans la vision.

Le nom reste **provisoire** : les textes juridiques et le pied de page le disent, en attendant le vote des ambassadeurs et les vérifications INPI (classes 9, 38, 42, 45), domaines et réseaux sociaux.

## Conséquences

- Environnements locaux : le projet Docker s'appelle désormais `atomes` (nouveaux volumes, nouvelle base `atomes`). Reprendre `.env` depuis `.env.example`, puis `pnpm install`, `pnpm services:up`, `pnpm db:migrate`, `pnpm db:seed` et `pnpm db:seed:dev`. Les anciens conteneurs `epilove-*` peuvent être supprimés.
- Sessions, préférences de langue, verrouillage et réglages enregistrés dans le navigateur sous l'ancien nom sont perdus une fois : il suffit de se reconnecter.
- Le serveur de développement partagé se réinstalle (`/opt/atomes`, utilisateur et services `atomes`) ; ses données sont fictives.
- Aucun secret ni chiffrement ne dépend du nom : rien à faire tourner.
- Si le vote ou l'INPI imposent un autre nom, le même renommage se refait : chercher `atomes` sans distinction de casse.
