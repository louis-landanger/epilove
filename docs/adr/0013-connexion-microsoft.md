# ADR-0013 — Connexion Microsoft restreinte aux tenants des écoles (exploration)

- **Statut** : exploration (désactivée par défaut)
- **Date** : 2026-10-02
- **Auteurs** : session A

## Contexte

ONB-10 : les cinq écoles utilisent chacune un tenant Microsoft 365. Un bouton « Continuer avec Microsoft » éviterait le code par email quand des filtres anti-spam ou des scanners de liens retiennent nos messages. Ce n'est pas la voie principale : le code par email reste la seule méthode garantie.

## Points examinés

1. **Qui peut se connecter** : une application multi-tenant Entra ID accepte n'importe quelle organisation. Il faut donc filtrer nous-mêmes sur le `tid` (identifiant du tenant) présent dans le jeton d'identité, en plus du domaine de l'adresse.
2. **Consentement** : depuis 2020, la plupart des tenants interdisent le consentement des utilisateurs aux applications d'éditeurs non vérifiés. Il faudra (a) faire vérifier l'éditeur (compte Microsoft Partner de l'association) et (b) obtenir, école par école, un consentement administrateur ou l'ouverture du consentement utilisateur pour nos seules permissions.
3. **Données** : seuls les claims OpenID Connect sont demandés (`openid`, `email`, `profile`) : ni Microsoft Graph, ni photo de profil, ni `offline_access`. Les comptes de travail portent souvent l'adresse dans `preferred_username` plutôt que `email`.
4. **Re-vérification annuelle** (ONB-09) : une connexion réussie depuis le tenant d'une école prouve que le compte de messagerie existe encore ; elle vaut donc preuve, comme un code.

## Décision

Implémentation complète mais **désactivée tant qu'elle n'est pas configurée** :

- fournisseur `microsoft` de Better Auth, point de terminaison `organizations` (comptes professionnels et scolaires uniquement), portées OIDC minimales, sans photo ;
- refus si le `tid` n'est pas dans `MICROSOFT_ALLOWED_TENANTS` (identifiants des tenants des cinq écoles) ou si l'adresse n'est pas une adresse d'école éligible (`parseSchoolEmail`) ;
- sans liste de tenants explicite, le fournisseur reste éteint même avec des identifiants d'application ;
- le bouton n'apparaît que si `NEXT_PUBLIC_MICROSOFT_ENABLED=1` ; une connexion réussie compte comme preuve de l'adresse (ONB-09).

## Pour l'activer

1. Créer l'application dans Entra ID (multi-tenant), URI de redirection `<APP_URL>/api/auth/callback/microsoft`.
2. Faire vérifier l'éditeur.
3. Pour chaque école : obtenir l'identifiant du tenant et l'accord de la DSI (consentement administrateur ou politique de consentement utilisateur).
4. Renseigner `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_ALLOWED_TENANTS`, puis `NEXT_PUBLIC_MICROSOFT_ENABLED=1`.

## Conséquences

- Aucune donnée supplémentaire n'est stockée : le compte Better Auth lié (`auth_account`) contient l'identifiant Microsoft et les jetons de la session OAuth.
- Si une école refuse, ses étudiantes et étudiants gardent le code par email ; le refus d'un tenant non listé est explicite (`MICROSOFT_TENANT_NOT_ALLOWED`).
- À revoir à l'activation : les messages d'erreur de retour OAuth côté interface (aujourd'hui génériques).
