# ADR-0016 — Les logos des écoles, à côté du formulaire de la liste d'attente

- **Statut** : accepté
- **Date** : 2026-10-13

## Contexte

La vision et les invariants du projet excluaient tout logo officiel et toute charte graphique d'école ([00 — Vision](../00-vision.md#nom-et-identité), `CLAUDE.md`). Les noms des écoles décrivaient seulement qui peut s'inscrire. Atomes est un projet étudiant indépendant, non affilié à IONIS Education Group ni aux écoles. Un logo d'école est une marque déposée et une œuvre protégée : le nom suffit à désigner l'école, alors que le logo peut laisser croire qu'elle soutient le projet.

La section de la liste d'attente a été refaite le 13 octobre 2026 : le formulaire à gauche ; à droite, les atomes du champ d'ions forment l'emblème de chaque école tour à tour, toutes les trois secondes, et gardent celui de l'école de l'adresse tapée (« @epita » fixe EPITA). Une première version dessinait les glyphes maison des écoles (les « familles d'éléments » de l'app). L'équipe a demandé les vrais logos, reconnaissables d'un coup d'œil : ils disent « ton école est là ».

## Options envisagées

1. **Les glyphes maison** : aucun risque juridique, mais personne ne reconnaît son école d'un coup d'œil. Écartée par l'équipe.
2. **Les vrais logos, sur cette seule scène, en une couleur, avec mention de propriété et de non-affiliation** : reconnaissables, risque limité à un endroit, facile à retirer.
3. **Les vrais logos partout** (puces d'école, autocollants, app, e-mails) : la confusion avec une app officielle serait maximale. Écartée.
4. **Attendre l'accord écrit de chaque école** : le plus sûr, mais la section attendrait. Reste possible plus tard.

## Décision

Option 2, en connaissance du risque, à la demande explicite de l'équipe.

- **Sources** : les fichiers publiés par les écoles. EPITA, Sup'Biotech et ISG viennent de leur site. ESME vient du site du groupe IONIS (PNG de 1772 px, ESME ne publie aucun fichier vectoriel) et IPSA de sa page Wikipédia en français (le site d'IPSA ne publie que des PNG). Les fichiers sont gardés tels quels dans `packages/three/scripts/school-logos/`, avec leur provenance dans l'en-tête de `packages/three/scripts/school-logos.ts`.
- **Rendu** : chaque logo en une seule couleur, ses parties blanches évidées, sans slogan ni déformation. `pnpm --filter @atomes/three logos:schools` le trace en contours, une fois pour toutes. Le résultat sert aux atomes (`packages/three/src/ion-field/school-logos.gen.ts`) et au repli sans champ : le logo en points blancs (`apps/web/public/schools/`).
- **Périmètre** : la scène à côté du formulaire de la liste d'attente, et nulle part ailleurs. L'app, les e-mails, les autocollants et les puces d'école gardent leurs couleurs et leurs glyphes maison.
- **Mentions** : les mentions légales disent à qui appartiennent les logos, où ils apparaissent, et que le projet n'est affilié à aucune école.

## Conséquences

- La section se lit d'un coup d'œil : on voit son école, et elle reste quand on tape son adresse.
- Le risque juridique est réel : une école peut contester l'usage de son logo sans autorisation. On l'atténue en limitant l'usage à un seul endroit, en une couleur, avec mentions et sources conservées. La relecture juridique prévue avant l'ouverture doit trancher ce point.
- Retirer un logo prend un commit : enlever l'école des sources de `scripts/school-logos.ts`, relancer le script et supprimer son fichier de `public/schools/`. À son tour, les atomes tournent alors autour de la scène, et son nom reste affiché. Pour tout retirer, la version avec les glyphes maison est le commit `e99fc70`.
- Remise en cause : dès qu'une école le demande (on retire son logo sans attendre), si la relecture juridique s'y oppose, ou quand une école donne son accord écrit (à consigner ici).
