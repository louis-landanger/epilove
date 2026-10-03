# Serveur de développement partagé

Une seule machine virtuelle fait tourner toute la stack, exactement comme sur un portable (services Docker, app, back-office, worker), derrière Caddy (HTTPS automatique) et un **mot de passe d'équipe**. Choix et limites : [ADR 0014](../../docs/adr/0014-serveur-de-developpement-partage.md).

> **Données fictives uniquement.** Ce serveur n'a ni les garanties d'hébergement ni les sauvegardes prévues pour de vrais étudiants (docs/08) : pas de vraie inscription, pas de vraies photos.

## 1. Créer la machine

N'importe quel hébergeur convient (UpCloud, Hetzner, DigitalOcean…) :

- **Ubuntu Server 24.04 LTS** ;
- **4 vCPU et 8 Go de RAM** conseillés (4 Go passent, le script ajoute alors 4 Go de swap pour les builds) ;
- une région en Europe (Francfort, Amsterdam, Paris…) ;
- ta **clé SSH** ajoutée à la création ;
- pas de pare-feu de l'hébergeur à configurer : le script n'ouvre que SSH (22), HTTP (80) et HTTPS (443).

Note l'adresse IP publique, puis connecte-toi : `ssh root@<IP>`.

## 2. Récupérer le code

Dépôt public :

```bash
git clone https://github.com/louis-landanger/epilove.git /opt/epilove
```

Dépôt privé : une **clé de déploiement** en lecture seule.

```bash
ssh-keygen -t ed25519 -N "" -f /root/.ssh/epilove_deploy
cat /root/.ssh/epilove_deploy.pub
# GitHub → dépôt → Settings → Deploy keys → Add deploy key : coller la clé, sans « Allow write access ».
GIT_SSH_COMMAND="ssh -i /root/.ssh/epilove_deploy -o StrictHostKeyChecking=accept-new" \
  git clone git@github.com:louis-landanger/epilove.git /opt/epilove
git -C /opt/epilove config core.sshCommand "ssh -i /root/.ssh/epilove_deploy"
```

## 3. Installer

```bash
cd /opt/epilove
sudo TEAM_PASSWORD='un-mot-de-passe-long' bash infra/dev-host/setup.sh
```

Compter 10 à 15 minutes (Docker, Node 24, Caddy, uv, build de production, base de données, 400 membres fictifs). À la fin, le script affiche les adresses :

| Adresse | Rôle |
|---|---|
| `https://app.<IP-avec-tirets>.sslip.io` | L'app (identifiant `epilove` et le mot de passe d'équipe) |
| `https://app.….sslip.io/dev` | Choisir un membre fictif (Inès, Hugo, Sarah…) sans se connecter |
| `https://admin.….sslip.io` | Back-office |
| `https://mail.….sslip.io` | Mailpit : tous les e-mails envoyés (codes de connexion compris) arrivent ici, rien ne part vraiment |

Les adresses `sslip.io` pointent vers l'IP qu'elles contiennent : pas de nom de domaine à acheter, Caddy obtient les certificats tout seul. Pour un autre nom (par exemple un sous-domaine DuckDNS dont `*.` pointe vers la machine) : `DOMAIN=epilove.duckdns.org`, puis supprimer `.env` et `infra/dev-host/generated/domain` avant de relancer le script.

Options : `TEAM_USER` (identifiant, `epilove` par défaut), `SEED_DEV=0` (sans membres fictifs).

## 4. Au quotidien

```bash
sudo bash /opt/epilove/infra/dev-host/update.sh       # déployer le dernier main (ou : update.sh ma-branche)
journalctl -fu epilove-web                            # journaux (epilove-admin, epilove-worker, caddy)
sudo -u epilove bash -c 'cd /opt/epilove && pnpm db:promote prenom.nom@epita.fr moderator'
sudo -u epilove bash -c 'cd /opt/epilove && pnpm pact:demo --reveal-in 120'
```

- **Se connecter avec un vrai parcours** : saisir une adresse d'école sur `/connexion`, puis lire le code dans Mailpit. Aucune adresse n'est vérifiée pour de vrai : n'importe quelle adresse `@epita.fr` fonctionne.
- **Changer le mot de passe d'équipe** : `sudo TEAM_PASSWORD='…' bash infra/dev-host/setup.sh`.
- **Repartir de zéro** (données) : `docker compose -f infra/compose/compose.yaml -f infra/dev-host/compose.yaml --env-file infra/dev-host/generated/services.env down --volumes`, supprimer `infra/dev-host/generated/seeded`, relancer `setup.sh`.

## 5. Changer de machine

Les secrets sont dans `/opt/epilove/.env` et `infra/dev-host/generated/` (jamais dans Git). Pour garder les données :

```bash
cd /opt/epilove
docker compose -f infra/compose/compose.yaml exec -T postgres pg_dump -U epilove epilove > epilove.sql
```

puis, sur la nouvelle machine : étapes 1 à 3, copier `epilove.sql`, et `docker compose … exec -T postgres psql -U epilove epilove < epilove.sql`. Les photos des membres fictifs se régénèrent avec `pnpm db:seed:dev`. Le plus simple reste souvent de repartir de zéro.

## Ce que fait `setup.sh`

1. Installe Docker, Node 24 (Corepack, pnpm), Caddy, uv (solveur du Pacte) et, sous 6 Go de RAM, 4 Go de swap.
2. Pare-feu : SSH, 80 et 443 uniquement. Les ports des services restent liés à `127.0.0.1`.
3. Génère des secrets propres à la machine (`infra/dev-host/generated/`, mode 700) et écrit `.env` à partir de `.env.example`. Les deux sont gardés aux exécutions suivantes.
4. Démarre les services Docker avec ces secrets (`infra/dev-host/compose.yaml` remplace les valeurs de développement du compose local), construit l'app, migre et remplit la base.
5. Crée trois services systemd (`epilove-web`, `epilove-admin`, `epilove-worker`) qui redémarrent seuls, avec l'utilisateur `epilove`.
6. Configure Caddy : HTTPS pour `app`, `admin`, `mail`, `ws` (WebSocket de Centrifugo uniquement), `media` (envois présignés) et `img` (photos signées) ; mot de passe d'équipe devant l'app, le back-office et Mailpit.

## En cas de souci

| Symptôme | Piste |
|---|---|
| Certificat refusé | `journalctl -u caddy` : limites de Let's Encrypt sur le domaine partagé `sslip.io` → passer à DuckDNS (`DOMAIN=…`) |
| 502 sur l'app | `journalctl -u epilove-web` ; `systemctl status epilove-web` |
| Photos qui restent « en traitement » | `journalctl -u epilove-worker` |
| Messages qui n'arrivent pas en direct | `docker compose … logs centrifugo` ; `CENTRIFUGO_WS_URL` dans `.env` |
| Build interrompu (mémoire) | `free -h` : vérifier le swap, ou prendre une machine de 8 Go |
