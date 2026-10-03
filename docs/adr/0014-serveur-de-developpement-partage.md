# ADR-0014 — Serveur de développement partagé sur une seule machine

- **Statut** : accepté (temporaire, jusqu'à la préproduction de l'ADR 003)
- **Date** : 2026-10-03

## Contexte

L'équipe veut une adresse en ligne pour tester l'app ensemble pendant le développement, sans budget. La stack compte, en plus de Next.js, des processus qui tournent en continu : PostgreSQL 18 avec pgvector, Valkey, Centrifugo (WebSocket), SeaweedFS (S3), imgproxy, le worker Graphile et le solveur Python du Pacte.

Options examinées :

- **Vercel + services gérés gratuits** (Supabase ou Neon, Upstash, R2, Brevo, plus une machine pour le worker) : cinq comptes, adaptations du code (connexions poolées, requêtes préparées), et l'ADR 003 écartait déjà cette voie.
- **Render gratuit** : pas de worker gratuit, base supprimée au bout de 30 jours, ports SMTP bloqués, services endormis au bout de 15 minutes. Le worker endormi laisse les photos « en traitement », donc le deck est vide.
- **Machine gratuite à 1 Go (GCP e2-micro)** : trop petite pour la stack et pour un build Next.js.
- **Une machine virtuelle de 4 à 8 Go** (crédits d'essai UpCloud ou DigitalOcean, ou Hetzner pour quelques euros) : la même installation que sur un portable.

## Décision

Une seule machine Ubuntu 24.04 installée par `infra/dev-host/setup.sh` :

- les services du compose local, avec des secrets générés sur la machine (`infra/dev-host/compose.yaml` remplace les valeurs de développement) et leurs ports liés à `127.0.0.1` ;
- l'app, le back-office et le worker en services systemd ;
- Caddy devant, en HTTPS, sur des adresses `sslip.io` (aucun nom de domaine à acheter) ;
- `APP_ENV=development` et `DEV_AUTH=1` pour garder les outils de développement (page `/dev`, `pact:demo`, `drop:run`, membres fictifs), ce qui n'est acceptable que parce que **tout le site est derrière un mot de passe d'équipe** (authentification HTTP de Caddy) ;
- Mailpit reçoit tous les e-mails : aucun fournisseur d'envoi.

## Conséquences

- Aucune adaptation du code : ce qui marche en local marche sur la machine, et l'inverse.
- **Données fictives uniquement** : pas de sauvegarde, pas de garanties RGPD (docs/08), et la connexion de développement contourne l'authentification.
- Une machine unique : son arrêt arrête tout. Sans importance pour du développement.
- La préproduction et la production suivent l'ADR 003 (VPS européen, Coolify, R2, Brevo, Cloudflare). `setup.sh` n'est pas un outil de production.
