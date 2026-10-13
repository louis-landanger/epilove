# ADR-0016 — Les logos des écoles, à côté du formulaire de la liste d'attente

- **Statut** : accepté
- **Date** : 2026-10-13

## Contexte

La vision et les invariants du projet excluaient tout logo officiel et toute charte graphique d'école ([00 — Vision](../00-vision.md#nom-et-identité), `CLAUDE.md`). Les noms des écoles décrivaient seulement qui peut s'inscrire. Atomes est un projet étudiant indépendant, non affilié à IONIS Education Group ni aux écoles. Un logo d'école est une marque déposée et une œuvre protégée : le nom suffit à désigner l'école, alors que le logo peut laisser croire qu'elle soutient le projet.

La section de la liste d'attente a été refaite le 13 octobre 2026 : le formulaire à gauche ; à droite, les atomes du champ d'ions forment l'emblème de chaque école tour à tour, toutes les trois secondes, et gardent celui de l'école de l'adresse tapée (« @epita » fixe EPITA). Une première version dessinait les glyphes maison des écoles (les « familles d'éléments » de l'app). L'équipe a demandé les vrais logos, reconnaissables d'un coup d'œil : ils disent « ton école est là ».

## Options envisagées

1. **Les glyphes maison** : aucun risque juridique, mais personne ne reconnaît son école d'un coup d'œil. Écartée par l'équipe.
2. **Les vrais logos, sur cette seule scène, avec mention de propriété et de non-affiliation** : reconnaissables, risque limité à un endroit, facile à retirer.
3. **Les vrais logos partout** (puces d'école, autocollants, app, e-mails) : la confusion avec une app officielle serait maximale. Écartée.
4. **Attendre l'accord écrit de chaque école** : le plus sûr, mais la section attendrait. Reste possible plus tard.

## Décision

Option 2, en connaissance du risque, à la demande explicite de l'équipe.

- **Sources** : les fichiers publiés par les écoles. EPITA, Sup'Biotech et ISG viennent de leur site. ESME vient du site du groupe IONIS (PNG de 1772 px, ESME ne publie aucun fichier vectoriel) et IPSA de sa page Wikipédia en français (le site d'IPSA ne publie que des PNG). Les fichiers sont gardés tels quels dans `packages/three/scripts/school-logos/`, avec leur provenance dans l'en-tête de `packages/three/scripts/school-logos.ts`.
- **Rendu** : chaque logo dans ses couleurs officielles, ses parties blanches évidées, sans slogan ni déformation. Ces couleurs sont éclaircies pour rester visibles sur le fond sombre de la page : leur clarté remonte (en OKLab), leur teinte reste ; le bleu marine d'ISG devient un bleu moyen, le bleu pétrole de Sup'Biotech un bleu-gris clair, et le vert anis de sa molécule ne bouge presque pas. Les atomes des couleurs les plus sombres brillent en plus un peu plus fort, pour qu'un logo se lise presque aussi bien qu'en blanc. `pnpm --filter @atomes/three logos:schools` trace chaque logo en contours et relève ses couleurs sur une grille de 32 cases sur sa longueur, une fois pour toutes. Le résultat sert aux atomes (`packages/three/src/ion-field/school-logos.gen.ts`), chacun de la couleur de sa place dans le logo, et au repli sans champ : le logo en points colorés (`apps/web/public/schools/`). Une première version, le même jour, dessinait chaque logo en une seule couleur, le blanc du papier ; l'équipe a demandé les couleurs des écoles.
- **Périmètre** : la scène à côté du formulaire de la liste d'attente, et nulle part ailleurs. L'app, les e-mails, les autocollants, les puces d'école et les éprouvettes de la course, juste au-dessus de la scène, gardent leurs couleurs et leurs glyphes maison, volontairement différents des chartes officielles.
- **Mentions** : les mentions légales disent à qui appartiennent les logos, où ils apparaissent, et que le projet n'est affilié à aucune école.

## Conséquences

- La section se lit d'un coup d'œil : on voit son école, et elle reste quand on tape son adresse.
- Le risque juridique est réel : une école peut contester l'usage de son logo sans autorisation. On l'atténue en limitant l'usage à un seul endroit, avec mentions et sources conservées. Les couleurs officielles rapprochent un peu plus la scène de l'identité des écoles, un risque de plus à peser : la relecture juridique prévue avant l'ouverture doit trancher ce point. Revenir à une seule couleur tient en un petit commit : ne plus donner aux atomes la couleur de leur place dans le logo (`logoContribution`, `packages/three/src/ion-field/formations.ts`) et retracer le repli.
- D'une section à l'autre, une école peut changer de couleur : les atomes quittent les éprouvettes aux couleurs maison (ESME ambre, ISG rouge) pour un logo aux couleurs officielles (ESME bleu et vert, ISG bleu).
- Retirer un logo prend un commit : enlever l'école des sources de `scripts/school-logos.ts`, relancer le script et supprimer son fichier de `public/schools/`. À son tour, les atomes tournent alors autour de la scène, et son nom reste affiché. Pour tout retirer, la version avec les glyphes maison est le commit `e99fc70`.
- Remise en cause : dès qu'une école le demande (on retire son logo sans attendre), si la relecture juridique s'y oppose, ou quand une école donne son accord écrit (à consigner ici).
