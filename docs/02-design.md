# 02 — Direction artistique et design system

> Ambition : un site vitrine du niveau des sites primés sur Awwwards, et une application aussi fluide qu'une app native. Les deux ont des règles différentes : **le site vitrine peut être spectaculaire, l'application doit rester rapide et lisible.**

## 1. Concept créatif : « atomes crochus »

L'expression française *avoir des atomes crochus* (avoir des affinités) devient le fil rouge visuel et éditorial. Le concept fonctionne même si un autre nom public est retenu.

| Idée | Traduction visuelle | Traduction produit |
|---|---|---|
| Chaque personne est un atome | Particules lumineuses, orbites, halos | Le profil est une carte « élément » |
| Chaque école est une famille d'éléments | Une couleur et une texture holographique par école | Badge d'école sur les cartes, statistiques inter-écoles |
| Un match est une liaison | Arc électrique entre deux particules, flash de réaction | Écran de match « Liaison établie » |
| Le campus est un laboratoire de nuit | Fond d'encre profonde, verrerie de labo, lueurs | Mode sombre par défaut, éprouvettes de la course des écoles |

Ambiance : **nocturne, lumineux, tactile, joueur mais élégant.** Ni rose bonbon, ni cœurs partout : on séduit par la matière, la lumière et le mouvement.

## 2. Identité visuelle

### Logo

- Logotype en minuscules, dessiné à partir de la typographie de titrage, avec une particule en orbite qui sert de signe isolé (icône d'application, favicon, loader).
- Le signe s'anime : orbite au repos, « liaison » avec une seconde particule lors d'un match.
- Versions : couleur sur fond sombre, monochrome, icône d'application (fond plein, sans transparence pour iOS).

### Couleurs

Toutes les couleurs sont définies en **OKLCH** (espace perceptuel, natif dans Tailwind CSS v4). Valeurs de départ à affiner dans Figma, contrastes à vérifier systématiquement.

| Rôle | Nom | Valeur de départ | Usage |
|---|---|---|---|
| Fond sombre | Encre | `oklch(0.15 0.02 285)` | Fond par défaut |
| Fond clair | Papier | `oklch(0.97 0.01 85)` | Thème clair, cartes en thème sombre |
| Accent principal | Plasma | `oklch(0.68 0.25 350)` | Actions principales, like, liaison |
| Accent secondaire | Volt | `oklch(0.90 0.19 125)` | Mises en avant, compteurs, focus |
| École | EPITA « Kernel » | `oklch(0.62 0.19 255)` | Bleu électrique |
| École | ESME « Ampère » | `oklch(0.80 0.16 80)` | Ambre |
| École | Sup'Biotech « Enzyme » | `oklch(0.74 0.17 150)` | Vert |
| École | ISG « Capital » | `oklch(0.66 0.19 30)` | Corail |
| École | IPSA « Stratosphère » | `oklch(0.75 0.13 210)` | Cyan |
| Sémantique | Succès / attention / erreur | à définir | États système uniquement |

Les couleurs d'école sont volontairement **différentes des chartes officielles** (pas de reprise d'identité de marque). Elles ne portent jamais seules une information : chaque école a aussi un **glyphe** et une **texture** (accessibilité daltoniens).

### Textures holographiques par école

Les cartes de profil reçoivent un reflet holographique qui réagit au pointeur et au gyroscope (inspiré des effets de cartes à collectionner en CSS). Chaque école a son motif gravé dans le reflet :

| École | Motif |
|---|---|
| EPITA | Grille de caractères et de crochets, façon code |
| ESME | Pistes de circuit imprimé |
| Sup'Biotech | Cellules et hélices |
| ISG | Guilloché, comme sur un billet de banque |
| IPSA | Lignes d'écoulement aérodynamique et constellations |

Le reflet reste subtil sur les photos (il ne doit jamais gêner la lecture d'un visage) et s'exprime pleinement sur le cadre, le badge et la carte partageable.

### Typographies

Toutes sous licence libre pour un usage commercial, auto-hébergées (pas de chargement depuis les serveurs de Google, pour des raisons de performance et de RGPD).

| Rôle | Police | Pourquoi |
|---|---|---|
| Titrage | **Bricolage Grotesque** (variable : graisse, chasse, taille optique) | Caractère, et ses axes variables permettent la typographie cinétique |
| Accent éditorial | **Instrument Serif** (italique) | Les mots émotionnels (« crochus », « liaison ») en italique serif : contraste élégant |
| Texte et interface | **Geist** (variable) | Très lisible en petite taille, neutre |
| Données | **Geist Mono** | Pourcentages, heures, compteurs, clin d'œil « labo » |

Alternatives si besoin : Clash Display, Satoshi ou General Sans (Fontshare), Inter.

Échelle typographique fluide avec `clamp()` : le titre principal du site vitrine va de 56 px sur mobile à 200 px et plus sur grand écran.

### Iconographie, illustration, 3D

- Icônes : Phosphor ou Lucide pour l'interface ; une dizaine d'icônes animées sur mesure (like, coup de cœur, passer, envoyer, liaison) réalisées avec **Rive**.
- 3D : verrerie de laboratoire, particules et cœur en verre réalisés dans Blender, exportés en glTF compressé (Draco/Meshopt) ou rendus en images pour les pages qui n'ont pas besoin de temps réel.
- Grain : léger bruit animé en surimpression pour la texture « pellicule ».

### Son

Facultatif et désactivé par défaut. Une palette de 6 sons courts (like, match, message, Drop, révélation, erreur), conçus ensemble. Interrupteur visible sur le site vitrine et dans les réglages.

## 3. Motion design

### Principes

1. **Physique** : ressorts plutôt que courbes fixes pour tout ce qui se manipule (cartes, tiroirs, boutons).
2. **Continuité** : un élément qui change d'écran se déplace (transitions d'éléments partagés), il ne disparaît pas.
3. **Intention** : dans l'application, une animation sert à comprendre ; sur le site vitrine, elle peut aussi émerveiller.
4. **Réduction** : `prefers-reduced-motion` désactive les parallaxes, le défilement adouci, la 3D et remplace les transitions par des fondus.
5. **Performance** : uniquement `transform`, `opacity` et `filter` légers ; 60 images par seconde sur un Android de milieu de gamme.

### Jetons de mouvement

| Jeton | Valeur | Usage |
|---|---|---|
| `duration-fast` | 120 ms | Survol, appui |
| `duration-base` | 220 ms | Apparitions, changements d'état |
| `duration-slow` | 420 ms | Transitions d'écran |
| `duration-cinematic` | 900 ms et plus | Révélations, site vitrine |
| `ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Entrées |
| `ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | Déplacements |
| `spring-snappy` | raideur 500, amortissement 32 | Boutons, interrupteurs |
| `spring-soft` | raideur 200, amortissement 26 | Tiroirs, cartes |
| `spring-bouncy` | raideur 320, amortissement 14 | Récompenses (match, like) |

### Outils par contexte

| Contexte | Outil |
|---|---|
| Interface, gestes, mises en page animées | Motion (ex-Framer Motion) |
| Chorégraphies au défilement, découpage de texte | GSAP + ScrollTrigger + SplitText |
| Défilement adouci (site vitrine uniquement) | Lenis |
| Transitions entre pages | API View Transitions (avec repli) |
| Animations simples liées au défilement | CSS scroll-driven animations (amélioration progressive) |
| Icônes et illustrations interactives | Rive (machines à états) |
| 3D et particules | three.js / React Three Fiber |

## 4. Moments signature

Huit moments concentrent l'effort de design. Ce sont eux qui feront la réputation du produit.

| # | Moment | Description | Technique |
|---|---|---|---|
| 1 | **Le titre vivant** (accueil du site vitrine) | Les atomes écrivent le titre : « atomes crochus. », en lettres géantes sur toute la largeur, est tracé par des milliers de particules liées par paires, le mot en papier, la locution en plasma, quelques étincelles volt. Un reflet balaie les lettres de temps en temps ; le curseur écarte les atomes, qui reviennent à leur place derrière lui. Au défilement, les lettres se défont de la droite vers la gauche et filent former le logo au manifeste (voir « Le fil des atomes », section 5) : ce sont les mêmes atomes du titre jusqu'au Pacte. | Champ d'ions : simulation de particules sur GPU (WebGPU avec repli WebGL2), shaders TSL. Les points du titre sont échantillonnés dans les vrais glyphes de la page (`ion-field/title-glyphs.ts`), ordonnés le long d'une courbe de Hilbert pour que les paires restent voisines. Le titre reste du vrai texte (référencement, lecteurs d'écran) : il est affiché tel quel pendant le chargement, avec le mouvement réduit et sur appareils modestes, et devient transparent quand le champ prend le relais. |
| 2 | **Course des écoles** (liste d'attente) | Cinq éprouvettes qui se remplissent d'un liquide lumineux à mesure que les inscriptions arrivent, en direct. | Liquide simulé par shader (surface ondulante), mises à jour temps réel, chiffres en police mono qui défilent. |
| 3 | **Deck de cartes** | Cartes physiques : inclinaison selon la vitesse, lancer naturel, reflet holographique au pointeur ou au gyroscope, tampons « Liker » / « Passer » qui apparaissent progressivement. | Motion (glisser, ressorts), vélocité du geste, `DeviceOrientation`, vibration courte sur Android. |
| 4 | **Liaison établie** (match) | Les deux cartes se rapprochent, un arc électrique les relie, flash de réaction aux couleurs des deux écoles, puis le bouton « Écrire » apparaît. | Rive pour l'arc et le texte, ou React Three Fiber selon le rendu visé ; annonce `aria-live` pour les lecteurs d'écran. |
| 5 | **Carte → profil** | La photo de la carte s'agrandit et devient l'en-tête du profil, sans coupure. | API View Transitions (éléments partagés), repli Motion `layoutId`. |
| 6 | **Conversation** | Bulles qui arrivent avec un ressort léger, indicateur de saisie en électrons en orbite, explosion de réaction au double appui. | Motion, Rive pour l'indicateur. |
| 7 | **Révélation du Pacte** | Page de compte à rebours partagée par tout le campus (compteur de personnes connectées en direct), puis séquence théâtrale : l'échantillon s'ouvre, la carte du match apparaît, puis le détail de la compatibilité (graphique radar). | Temps réel (diffusion simultanée), GSAP pour la chorégraphie, préchargement des ressources pendant le compte à rebours. |
| 8 | **Wrapped** | Story de fin d'année animée, exportable en image. | Composition en React, génération d'images côté serveur. |

## 5. Site vitrine

Structure de la page d'accueil :

1. **Accueil** : le titre est le visuel. Un surtitre, puis « Trouve tes » et, en dessous, « atomes *crochus*. » en lettres géantes sur toute la largeur de la colonne (le mot en grotesque très grasse, la locution en italique serif plasma, comme les accents du manifeste) ; ce sont les atomes du champ qui l'écrivent (moment 1). Dessous, sur une ligne : à gauche une phrase, le bouton « Rejoindre la liste » et un second accès plus discret, « Comment ça marche » ; à droite les cinq écoles et le compteur d'inscrits (seulement à partir de 100 personnes : en dessous, il desservirait la liste). Sur mobile, le mot et la locution passent sur deux lignes et le bas s'empile. Au défilement, le texte s'efface pendant que le manifeste monte et que les lettres partent former le logo.
2. **Manifeste** : un texte court qui se révèle mot à mot au défilement (« Cinq écoles. Une ville. Zéro hasard. »).
3. **Comment ça marche** : trois étapes en défilement épinglé (vérifie ton email d'école, crée ton profil, laisse la chimie opérer), illustrées par des cartes 3D.
4. **La course des écoles** : les éprouvettes, le classement, l'objectif collectif.
5. **Le Pacte** : teaser et compte à rebours vers la révélation.
6. **Sécurité et discrétion** : nos engagements, sobrement (vérification, discrétion, modération, données en Europe). Section plus calme, volontairement : c'est elle qui rassure.
7. **FAQ** en accordéon.
8. **Pied de page** : logotype géant, bandeau défilant, liens légaux, mention de non-affiliation.

**Le fil des atomes.** Le champ d'ions reste derrière toute la page et chaque section lui donne une forme. Aucun atome n'est jamais libre : du titre au bas de la page, chacun appartient toujours à une forme.

| Section | Ce que font les atomes |
|---|---|
| Accueil | Ils écrivent le titre, chaque atome sur un point d'une lettre, son partenaire juste à côté. Le curseur les écarte ; ils reviennent derrière lui. |
| Manifeste | Les lettres se défont de la droite vers la gauche (« crochus. » d'abord) et les atomes se rassemblent en un seul atome, le logo : orbite, noyau plasma, électron volt. |
| Comment ça marche | Ils tracent le contour de la carte du dessus, un motif par étape : anneau de scan balayé d'impulsions (vérification), couches d'électrons (profil), double hélice dont les brins sont reliés par des liaisons (chimie). Le motif change quand la carte suivante recouvre la précédente. |
| Course des écoles | Chaque atome rejoint l'éprouvette de son école et la remplit jusqu'au niveau réel ; ceux qui n'ont pas encore de place attendent en panache au-dessus. Le liquide CSS devient un verre teinté. |
| Pacte | Tous les atomes tournent en couples liés sur les trois anneaux. |
| Entre deux sections | Les deux formes voisines se partagent les atomes (leurs poids font 1) : ils glissent de l'une à l'autre sans jamais redevenir libres. Là où aucune forme n'est en jeu, la plus proche les garde et s'éloigne avec sa section. |
| Sections suivantes | Rien : la forme du Pacte est sortie de l'écran avec sa section. Quand plus rien n'est visible (section claire « Sécurité », forme hors écran), le champ s'efface puis la simulation se met en pause. |

Les formes sont calculées à partir de la position réelle des éléments de la page à chaque image (`apps/web/components/acces/marketing/ion-field/journey.ts`, `packages/three/src/ion-field/formations.ts`) : elles suivent le défilement, la taille de l'écran et les données en direct. Sans scènes animées (mouvement réduit, appareil modeste, pas de WebGL2), la page reste celle d'avant : titre en texte, éprouvettes en liquide CSS.

Détails transverses : curseur personnalisé et boutons magnétiques (desktop uniquement), préchargeur de moins de 1,2 s (sauté pour les visiteurs déjà venus), transitions entre pages, interrupteur son, version anglaise.

**Objectif assumé :** soumettre le site vitrine à Awwwards, CSS Design Awards et The FWA au lancement. C'est aussi une opération de communication et un portfolio pour l'équipe.

## 6. Application

### Navigation

| Mobile (barre d'onglets en bas) | Desktop |
|---|---|
| **Découvrir** (Drop + deck) · **Likes** · **Messages** · **Campus** (Pacte, événements, Spots, question de la semaine) · **Profil** | Barre latérale à gauche, contenu au centre, conversation ouverte en panneau à droite (vue scindée) |

### Écrans clés

- **Découvrir** : en-tête du Drop (compte à rebours jusqu'à 21 h, puis les 5 profils), puis le deck. Filtres dans un tiroir.
- **Profil d'une autre personne** : photos plein cadre avec défilement par aimantation, prompts présentés comme des fiches de labo, compatibilité expliquée, actions toujours accessibles en bas.
- **Likes** : grille des personnes qui t'ont liké, avec ce qu'elles ont aimé.
- **Messages** : liste avec aperçu, nouveaux matchs en carrousel en haut.
- **Mon profil** : aperçu « tel que les autres te voient », édition directe, complétude.
- **Réglages** : confidentialité en premier (masquer école/promo/personnes, incognito, notifications discrètes), puis compte, puis notifications.

### États

Chaque écran prévoit ses états **vide, chargement, erreur, hors ligne**, avec un squelette de chargement qui a la forme du contenu final. Le ton reste léger, sans jamais minimiser une erreur :

| Situation | Exemple de texte |
|---|---|
| Deck vide | « Tu as fait le tour pour aujourd'hui. Prochain Drop à 21 h. » |
| Aucun match | « Pas encore de liaison. Les meilleures réactions prennent du temps. » |
| Hors ligne | « Connexion perdue. Tes messages partiront dès le retour du réseau. » |
| Erreur serveur | « Quelque chose a planté de notre côté. On relance ? » |
| Match | « Liaison établie. » |
| Calcul en cours | « Calcul des affinités… » |

### Ton éditorial

- Tutoiement, phrases courtes, humour de campus, références tech et science **sans exclure** ceux qui ne les comprennent pas.
- Formulations épicènes de préférence (« la personne », « tes matchs ») ; le point médian est réservé aux cas où il n'y a pas d'alternative lisible.
- Jamais graveleux, jamais de pression (« Dépêche-toi ! »), jamais culpabilisant.
- Les textes de sécurité et juridiques sont sobres et clairs : l'humour s'arrête là.

## 7. Design system

```
Figma (variables) ──export──► tokens JSON ──build──► CSS @theme (Tailwind v4) ──► web
                                                └──► objet TypeScript ──► mobile (plus tard)
```

- **Jetons** : couleurs, typographie, espacements (base 4 px), rayons, ombres, flous, mouvement, z-index. Source unique dans le paquet `packages/tokens`.
- **Composants** : primitives accessibles (shadcn/ui sur Radix ou Base UI) entièrement restylées, plus les composants maison (carte de profil, deck, bulle, carte de date, éprouvette, jauge de compatibilité).
- **Storybook** : chaque composant documenté avec ses états, ses variantes et ses règles d'accessibilité ; tests visuels automatiques.
- **Gouvernance** : un composant n'entre dans `packages/ui` qu'après revue design et revue accessibilité.

## 8. Accessibilité

Cible : **WCAG 2.2 niveau AA**, vérifiée automatiquement (axe) et manuellement (lecteur d'écran, clavier) à chaque fin de phase.

- Toutes les actions du deck ont une alternative en boutons et au clavier (← passer, → liker, ↑ coup de cœur, Entrée ouvrir le profil).
- Cibles tactiles de 44 px minimum.
- Focus toujours visible, ordre de tabulation logique, aucune interaction uniquement au survol.
- Annonces `aria-live` pour les matchs, les nouveaux messages et les erreurs.
- Texte alternatif sur les photos (fourni par l'utilisateur), transcription des messages et prompts vocaux.
- Contrastes AA vérifiés sur les deux thèmes, information jamais portée par la seule couleur.
- `prefers-reduced-motion` et `prefers-color-scheme` respectés ; réglage manuel dans l'application.
- Langue de la page déclarée, formulaires avec messages d'erreur explicites et associés au champ.

## 9. Performance

| Budget | Site vitrine | Application |
|---|---|---|
| LCP (4G, Android milieu de gamme) | ≤ 2,0 s | ≤ 2,5 s |
| INP | ≤ 150 ms | ≤ 150 ms |
| CLS | ≤ 0,05 | ≤ 0,05 |
| JavaScript initial (gzip) | ≤ 180 Ko, la 3D chargée **après** le LCP | ≤ 160 Ko par route |
| Polices | ≤ 120 Ko au total, sous-ensembles, `font-display: swap` | idem |
| Images | AVIF/WebP, tailles adaptées, aperçu flou instantané | idem |

**Qualité adaptative de la 3D** : détection du niveau du GPU, densité de pixels plafonnée à 1,5, nombre de particules ajusté, rendu suspendu quand le canevas sort de l'écran ou que l'onglet est masqué, image fixe de repli si le GPU est trop faible ou si l'utilisateur a demandé moins d'animations.

Mesure continue : Lighthouse CI sur chaque pull request, mesures réelles des Core Web Vitals remontées depuis les navigateurs des utilisateurs.

## 10. Méthode et outils

1. **Semaines 1–2** : planches d'ambiance (trois directions contrastées), choix d'une direction en équipe.
2. **Semaines 2–4** : logo, palette, typographies, prototype du champ d'ions et de la carte holographique (prototypes de code, pas seulement Figma : le mouvement se juge en vrai).
3. **Semaines 4–6** : maquettes des écrans P0, design system v1, tests utilisateurs rapides (5 personnes par école).
4. Ensuite : revue design hebdomadaire, chaque écran validé sur un vrai téléphone avant d'être considéré comme terminé.

| Outil | Usage |
|---|---|
| Figma | Maquettes, variables, prototypes |
| Rive | Icônes et animations interactives |
| Blender | Objets 3D et rendus |
| Leva | Réglage en direct des paramètres de la 3D pendant le développement |
| Storybook | Documentation et tests des composants |

**Ressources pour monter en compétence** : le cours *Three.js Journey* de Bruno Simon, *The Book of Shaders*, les tutoriels Codrops, la documentation GSAP, les sites des studios Immersive Garden, Lusion et Active Theory pour l'inspiration.

**Recrutement design** : un ou deux profils de designer dans l'équipe changent radicalement le résultat final. Si une école de design du groupe est présente à Lyon, c'est le premier endroit où chercher.
