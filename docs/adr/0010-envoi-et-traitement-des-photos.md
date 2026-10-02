# ADR-0010 — Envoi et traitement des photos

- **Statut** : accepté
- **Date** : 2026-10-02
- **Auteurs** : session A

## Contexte

Les photos de profil (PRO-01) sont la donnée la plus exposée de l'application : risque d'images explicites, de photos volées, de métadonnées révélant une position (EXIF GPS), de fichiers piégés (bombes de décompression, polyglottes HTML/SVG). docs/04 (section 4.4) et docs/07 prévoient un envoi direct vers une zone de quarantaine du stockage objet, « via une URL présignée limitée en taille et en type », puis un traitement asynchrone. Le stockage est Cloudflare R2 en production et SeaweedFS en local, tous deux compatibles avec l'API S3. Les médias ne sont servis qu'au travers d'URL imgproxy signées et expirantes.

## Options envisagées

1. **Envoi via le serveur d'application** (le fichier transite par l'API) — contrôle total, mais charge et bande passante sur les serveurs web, limites de taille des plateformes, latence.
2. **URL PUT présignée** — simple, mais la taille ne peut pas être imposée par la signature de façon fiable selon les implémentations S3 ; un client malveillant peut envoyer un fichier énorme.
3. **Formulaire POST présigné avec politique** — la politique signée impose la clé exacte, le `Content-Type` et une plage de taille (`content-length-range`) ; c'est le stockage qui refuse les envois non conformes.

## Décision

Option 3. Le parcours est :

1. Le navigateur recadre (4:5) et compresse la photo (JPEG, 2048 px maximum) : le fichier d'origine et ses métadonnées ne quittent jamais l'appareil.
2. `media.requestUpload` réserve un emplacement (ligne `photo` au stade `uploading`, verrou par membre, 6 au maximum, quota de 30 envois par heure) et renvoie un formulaire présigné valable 5 minutes vers `quarantine/<membre>/<photo>`, de 1 octet à 10 Mo, `image/jpeg|png|webp`.
3. Le navigateur poste directement vers le stockage, avec suivi de progression.
4. `media.confirmUpload` vérifie la présence de l'objet, passe la photo au stade `processing` et enfile le job `media/process-photo` dans la même transaction (clé de job = identifiant de la photo, donc idempotent).
5. Le worker décode réellement l'image (libvips via sharp, 50 mégapixels maximum, formats JPEG, PNG, WebP, HEIF, AVIF), applique l'orientation EXIF, ré-encode en WebP sans aucune métadonnée, calcule le thumbhash, écrit `photos/<membre>/<photo>.webp` et supprime l'original de quarantaine. Un fichier illisible ou trop petit passe au stade `failed` ; un original disparu aussi, sans nouvelle tentative.
6. La photo reste `pending` jusqu'à la modération ; seul son propriétaire la voit (`canViewPhoto`).
7. Un job horaire purge les envois réservés mais jamais confirmés.

Vérifié sur SeaweedFS 4.48 : envoi conforme accepté (204), fichier de 11 Mo refusé (`EntityTooLarge`), `Content-Type` ou clé modifiés refusés (`AccessDenied`). En développement, le bucket et sa règle CORS sont créés au premier envoi.

## Conséquences

- Les serveurs web ne voient jamais passer les fichiers ; le stockage fait respecter les limites.
- Le navigateur doit pouvoir joindre le stockage : `S3_PUBLIC_ENDPOINT` (si différent de `S3_ENDPOINT`), règle CORS sur le bucket de production et origine ajoutée au `connect-src` de la CSP.
- Le traitement dépend du worker : sans lui, les photos restent au stade `processing` (elles comptent pour le minimum de l'onboarding, mais ne sont pas affichées).
- Une photo de plus de 10 Mo après compression dans le navigateur est refusée : acceptable vu la compression préalable.
- À revoir si R2 cesse de prendre en charge les politiques POST, ou si l'on ajoute la vidéo (ONB-08) : il faudrait alors des envois multipartie.
