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
git clone https://github.com/louis-landanger/epilove.git /opt/atomes
```

Dépôt privé : une **clé de déploiement** en lecture seule.

```bash
ssh-keygen -t ed25519 -N "" -f /root/.ssh/atomes_deploy
cat /root/.ssh/atomes_deploy.pub
# GitHub → dépôt → Settings → Deploy keys → Add deploy key : coller la clé, sans « Allow write access ».
GIT_SSH_COMMAND="ssh -i /root/.ssh/atomes_deploy -o StrictHostKeyChecking=accept-new" \
  git clone git@github.com:louis-landanger/epilove.git /opt/atomes
git -C /opt/atomes config core.sshCommand "ssh -i /root/.ssh/atomes_deploy"
```

## 3. Installer

```bash
cd /opt/atomes
sudo TEAM_PASSWORD='un-mot-de-passe-long' bash infra/dev-host/setup.sh
```

Compter 10 à 15 minutes (Docker, Node 24, Caddy, uv, build de production, base de données, 400 membres fictifs). À la fin, le script affiche les adresses :

| Adresse | Rôle |
|---|---|
| `https://app.<IP-avec-tirets>.sslip.io` | L'app (identifiant `atomes` et le mot de passe d'équipe) |
| `https://app.….sslip.io/dev` | Choisir un membre fictif (Inès, Hugo, Sarah…) sans se connecter |
| `https://admin.….sslip.io` | Back-office |
| `https://mail.….sslip.io` | Mailpit : tous les e-mails envoyés (codes de connexion compris) arrivent ici, rien ne part vraiment |

Les adresses `sslip.io` pointent vers l'IP qu'elles contiennent : pas de nom de domaine à acheter, Caddy obtient les certificats tout seul. Pour un autre nom (par exemple un sous-domaine DuckDNS dont `*.` pointe vers la machine) : relancer le script avec `DOMAIN=atomes.duckdns.org`. Les adresses de `.env` suivent le domaine, le reste du fichier est gardé.

**Machine sans adresse publique** (un ordinateur à la maison, joint par [Tailscale](https://tailscale.com)) : Let's Encrypt ne peut pas la joindre pour vérifier le nom. Faire pointer un nom DuckDNS vers son adresse Tailscale (`100.x.y.z`, à saisir sur la page du compte duckdns.org), puis :

```bash
sudo DOMAIN=atomes.duckdns.org CERTS=duckdns bash infra/dev-host/setup.sh
```

Le script demande le jeton DuckDNS (en haut de la page du compte) et le mot de passe d'équipe, sans les afficher. Caddy obtient alors un seul certificat `*.atomes.duckdns.org` par l'API de DuckDNS : les adresses sont les mêmes (`app.`, `admin.`, `mail.`…, sauf le nom nu), joignables seulement depuis les appareils du réseau Tailscale (un téléphone aussi, avec l'app Tailscale). Le jeton reste dans `/etc/caddy/duckdns.env` (lisible par root seul) et dans `infra/dev-host/generated/duckdns-token`, avec les autres secrets ; Caddy est figé (`apt-mark hold caddy`) pour garder le module DuckDNS.

**Machine sans adresse publique, site public** : un [tunnel Cloudflare](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/) (gratuit). La machine ouvre elle-même la connexion vers Cloudflare : rien à ouvrir sur la box, l'adresse IP de la maison reste cachée. Il faut un nom de domaine dont le DNS est géré par Cloudflare (offre gratuite : ajouter le domaine sur dash.cloudflare.com, puis remplacer ses serveurs DNS chez le registraire par ceux que Cloudflare indique). Ensuite :

```bash
sudo DOMAIN=exemple.fr CERTS=tunnel bash infra/dev-host/setup.sh
```

À la première exécution, le script affiche un lien : l'ouvrir dans n'importe quel navigateur, se connecter à Cloudflare et choisir le domaine. Il crée ensuite le tunnel `atomes` et six entrées DNS (`app.`, `admin.`, `mail.`, `ws.`, `media.`, `img.` du domaine ; le nom nu et les autres noms ne sont pas touchés). Il s'arrête sans rien écraser si l'un de ces noms est déjà utilisé. Cloudflare présente les certificats et transmet les visites par le tunnel à Caddy, qui n'écoute plus que sur la machine elle-même ; le mot de passe d'équipe protège toujours l'app, le back-office et Mailpit. Deux limites :

- `DOMAIN` est le domaine lui-même (`exemple.fr`), pas un sous-domaine : le certificat gratuit de Cloudflare ne couvre qu'un niveau (`app.exemple.fr`, pas `app.atomes.exemple.fr`).
- Cloudflare déchiffre le trafic avant de le passer au tunnel : acceptable pour des données fictives, c'est aussi le schéma prévu en production (ADR 003).

Les quotas par adresse IP lisent alors l'en-tête `cf-connecting-ip` (posé par Cloudflare) au lieu de `x-forwarded-for` ; le script règle `.env` en conséquence.

Options : `TEAM_USER` (identifiant, `atomes` par défaut), `SEED_DEV=0` (sans membres fictifs).

## 4. Au quotidien

Le guide complet (ajouter une clé SSH, déployer une branche, revenir en arrière, variables d'environnement, journaux, base de données, maintenance) est dans [`EXPLOITATION.md`](EXPLOITATION.md). L'essentiel :

```bash
sudo bash /opt/atomes/infra/dev-host/update.sh       # déployer le dernier main (ou : update.sh ma-branche)
journalctl -fu atomes-web                            # journaux (atomes-admin, atomes-worker, caddy)
sudo -u atomes bash -c 'cd /opt/atomes && pnpm db:promote prenom.nom@epita.fr moderator'
sudo -u atomes bash -c 'cd /opt/atomes && pnpm pact:demo --reveal-in 120'
```

- **Se connecter avec un vrai parcours** : saisir une adresse d'école sur `/connexion`, puis lire le code dans Mailpit. Aucune adresse n'est vérifiée pour de vrai : n'importe quelle adresse `@epita.fr` fonctionne.
- **Changer le mot de passe d'équipe** : `sudo TEAM_PASSWORD='…' bash infra/dev-host/setup.sh`.
- **Repartir de zéro** (données) : `docker compose -f infra/compose/compose.yaml -f infra/dev-host/compose.yaml --env-file infra/dev-host/generated/services.env down --volumes`, supprimer `infra/dev-host/generated/seeded`, relancer `setup.sh`.

## 5. Changer de machine

Les secrets sont dans `/opt/atomes/.env` et `infra/dev-host/generated/` (jamais dans Git). Pour garder les données :

```bash
cd /opt/atomes
docker compose -f infra/compose/compose.yaml exec -T postgres pg_dump -U atomes atomes > atomes.sql
```

puis, sur la nouvelle machine : étapes 1 à 3, copier `atomes.sql`, et `docker compose … exec -T postgres psql -U atomes atomes < atomes.sql`. Les photos des membres fictifs se régénèrent avec `pnpm db:seed:dev`. Le plus simple reste souvent de repartir de zéro.

## Ce que fait `setup.sh`

1. Installe Docker, Node 24 (Corepack, pnpm), Caddy, uv (solveur du Pacte), cloudflared avec `CERTS=tunnel` et, sous 6 Go de RAM, 4 Go de swap.
2. Pare-feu : SSH, 80 et 443 uniquement (SSH seul avec `CERTS=tunnel`). Les ports des services restent liés à `127.0.0.1`. Avec `CERTS=tunnel`, connexion à Cloudflare, tunnel et entrées DNS.
3. Génère des secrets propres à la machine (`infra/dev-host/generated/`, mode 700) et écrit `.env` à partir de `.env.example`. Les deux sont gardés aux exécutions suivantes ; seules les adresses de `.env` sont réécrites, pour suivre le domaine.
4. Démarre les services Docker avec ces secrets (`infra/dev-host/compose.yaml` remplace les valeurs de développement du compose local), construit l'app, migre et remplit la base.
5. Crée trois services systemd (`atomes-web`, `atomes-admin`, `atomes-worker`) qui redémarrent seuls, avec l'utilisateur `atomes`.
6. Configure Caddy : HTTPS pour `app`, `admin`, `mail`, `ws` (WebSocket de Centrifugo uniquement), `media` (envois présignés) et `img` (photos signées) ; mot de passe d'équipe devant l'app, le back-office et Mailpit. Le script remplace `/etc/caddy/Caddyfile` : si la machine en avait déjà un, écrit à la main (d'autres sites), il le met de côté dans `/etc/caddy/Caddyfile.before-atomes-<date>` et le signale. Caddy ne sert alors plus que les adresses d'Atomes.
7. Avec `CERTS=tunnel` : écrit `/etc/cloudflared/config.yml` (les six noms vers Caddy) et lance le service systemd `atomes-tunnel`.

## En cas de souci

| Symptôme | Piste |
|---|---|
| `git clone` : `connect to host github.com port 22: Connection timed out` | Port 22 sortant bloqué (hébergeur ou réseau) : passer par le port 443, `ssh://git@ssh.github.com:443/louis-landanger/epilove.git` au lieu de `git@github.com:louis-landanger/epilove.git` |
| Certificat refusé | `journalctl -u caddy` : limites de Let's Encrypt sur le domaine partagé `sslip.io` → passer à DuckDNS (`DOMAIN=…`) ; avec `CERTS=duckdns`, un jeton DuckDNS faux ou périmé (le saisir de nouveau : `sudo DUCKDNS_TOKEN='…' bash infra/dev-host/setup.sh`) |
| `Could not route app.… to the tunnel` | Une entrée DNS utilise déjà ce nom sur Cloudflare : la supprimer (DNS → Records), ou choisir un autre `DOMAIN` |
| Erreur Cloudflare 1033 ou 502 avec le tunnel | `journalctl -u atomes-tunnel` (le tunnel est-il connecté ?) ; `systemctl status caddy` |
| 502 sur l'app | `journalctl -u atomes-web` ; `systemctl status atomes-web` |
| Photos qui restent « en traitement » | `journalctl -u atomes-worker` |
| Messages qui n'arrivent pas en direct | `docker compose … logs centrifugo` ; `CENTRIFUGO_WS_URL` dans `.env` |
| Build : `ERR_SWC_NATIVE_CACHE`, `cache root has a parent writable by another user` | `@swc/core` refuse un cache dont un dossier parent est modifiable par un groupe (`namei -l /home/atomes`). Les scripts placent ce cache dans `/var/cache/atomes-swc` : relancer `setup.sh` à jour |
| Build interrompu (mémoire) | `free -h` : vérifier le swap, ou prendre une machine de 8 Go |
