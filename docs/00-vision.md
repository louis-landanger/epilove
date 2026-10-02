# 00 — Vision produit

> Statut : proposition v1 (octobre 2026) — à valider en équipe.
> « Epilove » est le **nom de code** du projet. Le nom public est une décision ouverte (voir [§ Nom et identité](#nom-et-identité)).

## En une phrase

Epilove est l'application de rencontre **et** d'amitié réservée aux étudiantes et étudiants vérifiés du campus IONIS de Lyon (EPITA, ESME, Sup'Biotech, ISG, IPSA) : un cercle fermé, sûr et soigné, pensé pour provoquer de vraies rencontres entre les cinq écoles.

## Le constat

1. **Cinq écoles, deux sites, peu de mélange.** EPITA, ESME, IPSA et Sup'Biotech partagent depuis la rentrée 2025 le campus de Vaise (Lyon 9ᵉ) ; l'ISG est installée ailleurs dans Lyon. Les promos sont cloisonnées, les BDE séparés, les emplois du temps décalés. Les rencontres inter-écoles relèvent du hasard.
2. **Les applications grand public ne sont pas faites pour ce contexte.** Bassin immense et anonyme, faux profils, aucun repère commun, expérience « catalogue », monétisation agressive (likes reçus floutés, boosts payants).
3. **Un déséquilibre démographique marqué.** Ordres de grandeur publiés à l'échelle nationale de chaque école : environ 13 % de femmes à l'EPITA, 22 % à l'IPSA, autour de 30 % à l'ESME, contre environ 75 % à Sup'Biotech et plus de la moitié à l'ISG. Un espace commun aux cinq écoles rééquilibre fortement le bassin : c'est l'argument central du multi-écoles.
4. **Sur un campus, le frein n'est pas de trouver quelqu'un, c'est d'oser.** Peur d'être vu par sa promo, peur du malaise, peur du refus visible. Le produit doit réduire ce coût social.
5. **Un très petit bassin.** Voir ci-dessous : la mécanique « swipe infini » épuiserait le bassin en quelques jours. Il faut une mécanique de **rareté et de rituels**, pas de volume.

### Taille du bassin

| École | Effectif lyonnais (ordre de grandeur, à confirmer auprès des écoles) |
|---|---|
| EPITA | ~365 (2023-2024), en croissance |
| ESME | ~450 |
| IPSA | Campus ouvert en 2025, premières années uniquement |
| Sup'Biotech | Quelques centaines au plus |
| ISG | ~500 et plus |
| **Total estimé** | **~1 500 à 2 000 personnes** |

Conséquences :

- toutes les décisions produit doivent tenir avec **quelques centaines d'utilisateurs actifs** : Drop limité, likes rares, seconde chance, mode Amis, événements ;
- l'**extension aux autres écoles IONIS de Lyon** (le site de Jean Macé accueille notamment Epitech, ISEG, e-artsup et d'autres écoles du groupe) doublerait au moins le bassin. Le modèle de données est prévu pour (une école = une ligne de configuration) ; la décision est ouverte (voir le [README](../README.md#décisions-ouvertes)) ;
- l'architecture n'a **aucun besoin** de passer à l'échelle au-delà de quelques milliers d'utilisateurs : un seul serveur bien configuré suffit largement. La qualité viendra du soin, pas de l'infrastructure.

## La proposition

| Pilier | Ce que ça veut dire concrètement |
|---|---|
| **Confiance** | Inscription uniquement avec l'email de son école. Une adresse = une personne = un compte. Un bannissement est donc réellement effectif. Modération humaine outillée. |
| **Discrétion** | Prénom uniquement, jamais le nom. Possibilité de se masquer de sa propre école, de sa promo ou de personnes précises. Notifications neutres. Mode incognito. |
| **Rencontre réelle** | Événements des BDE, carte de lieux de rendez-vous lyonnais, proposition de date en deux gestes, kit de sécurité. L'objectif est de faire sortir les gens de l'application. |
| **Rituels** | Le *Drop* quotidien (une sélection courte et soignée chaque soir) et *le Pacte* (un grand matching unique par semestre, révélé à tout le campus au même moment). |
| **Plaisir** | Un design de niveau Awwwards, de l'humour de campus, des détails soignés partout. Le design est une fonctionnalité. |

## Pour qui

| Persona | Contexte | Attentes | Craintes |
|---|---|---|---|
| **Inès**, 20 ans, Sup'Biotech 3ᵉ année | A désinstallé Tinder après trop de messages lourds | Rencontrer des gens hors de sa promo, dans un cadre sûr | Harcèlement, faux profils |
| **Hugo**, 19 ans, EPITA cycle prépa | Timide, plus à l'aise à l'écrit, joueur | Des sujets de conversation faciles, pas de pression | Être vu par sa promo, le « vu » sans réponse |
| **Sarah**, 22 ans, ISG | Très sociable, va à toutes les soirées | Savoir qui sera aux événements, transformer un match en verre | Perdre son temps en conversations sans fin |
| **Malik**, 21 ans, IPSA, étudiant international | Arrivé à Lyon cette année, parle peu français | Se faire des amis d'abord, peut-être plus | Barrière de la langue, isolement |
| **Camille**, 20 ans, ESME, non-binaire | Prudent·e avec les applications classiques | Un espace inclusif, des options de genre et d'orientation respectueuses | Outing, remarques déplacées |

Conséquences produit directes : un **mode Amis** de première classe (Malik, et une couverture sociale pour tout le monde), une **interface en anglais** (Malik), des **outils de discrétion** (Hugo, Camille), des **brise-glace** (Hugo), des **événements** (Sarah), une **modération réactive** (Inès, Camille).

## Principes produit

Ces principes servent d'arbitre quand deux idées s'opposent.

1. **Vérifié ou rien.** Aucun compte sans email d'école valide. Pas d'exception, y compris pour l'équipe.
2. **La qualité avant le volume.** Likes quotidiens limités, Drop court, pas de swipe infini. Un like doit avoir de la valeur.
3. **Discret par défaut.** Le réglage par défaut est toujours le plus protecteur. On n'affiche jamais une information qu'on pourrait taire.
4. **La sécurité d'abord.** Bloquer est instantané et sans justification. Signaler prend deux gestes. Une fonctionnalité qui augmente le risque de harcèlement n'est pas livrée, même si elle est « virale ».
5. **Le monde réel avant l'écran.** On mesure le succès en rencontres, pas en temps passé dans l'application.
6. **Gratuit et équitable.** Pas d'abonnement, pas de fonctionnalité payante qui donne un avantage. Le financement vient de partenariats (BDE, commerces locaux), jamais des données.
7. **Beau, rapide et accessible.** Chaque écran est soigné ; la performance et l'accessibilité ne sont jamais sacrifiées à l'effet visuel.
8. **Transparent.** On explique comment fonctionnent le classement et le matching, et on laisse des réglages à l'utilisateur.

## Positionnement

| | Tinder / Bumble | Hinge | Happn | Marriage Pact (campus US) | **Epilove** |
|---|---|---|---|---|---|
| Communauté | Ouverte | Ouverte | Ouverte | Fermée (email universitaire) | **Fermée, 5 écoles, vérifiée** |
| Mécanique | Swipe | Like ciblé sur un contenu | Croisements géolocalisés | Questionnaire + un match annuel | **Like ciblé + Drop quotidien + Pacte semestriel** |
| Amitié | Bumble BFF (app séparée) | Non | Non | Parfois | **Mode Amis intégré** |
| Ancrage IRL | Faible | Faible | Fort mais intrusif | Faible | **Événements BDE, lieux, kit date** |
| Modèle économique | Abonnements | Abonnements | Abonnements | Gratuit | **Gratuit, partenariats** |
| Discrétion vis-à-vis de son entourage | Faible | Faible | Faible | Moyenne | **Forte (masquer école/promo/personnes)** |

## Ce que nous ne ferons pas

- Pas d'abonnement premium, pas de likes reçus floutés, pas de boost payant.
- Pas de note d'attractivité, pas de classement public des profils, pas d'analyse automatique de l'apparence physique.
- Pas de géolocalisation en temps réel ni de « personnes croisées ».
- Pas de filtre sur l'origine ethnique.
- Pas de mur de confessions anonymes ni de commentaires publics sur les profils.
- Pas de revente ni de partage de données, pas de publicité ciblée.
- Pas de nom de famille affiché, jamais.

## Nom et identité

« Epilove » fonctionne comme nom de code, mais présente un défaut de fond pour un produit public : le préfixe *Epi-* renvoie à EPITA, alors que quatre écoles sur cinq ne sont pas EPITA. Le risque est que l'ISG, Sup'Biotech, l'ESME et l'IPSA perçoivent le produit comme « le truc des Épitéens ».

Pistes évaluées :

| Nom | Pour | Contre |
|---|---|---|
| **Atomes** (signature : « Trouve tes atomes crochus. ») | Expression française idiomatique (*avoir des atomes crochus* = avoir des affinités). Parle à la chimie (Sup'Biotech), à la physique (ESME, IPSA), aux ingénieurs comme aux commerciaux. Porte un univers visuel fort (particules, orbites, liaisons). | Mot courant : protection de marque à vérifier, nom de domaine probablement à décliner (`atomes.app`, `atomes-lyon.fr`…). |
| **Merge** | Double sens *git merge* / fusion (fusions-acquisitions pour l'ISG). Micro-copie riche (« It's a merge », « Ready to commit? »). Court, international. | Très connoté développeurs. Générique, difficile à protéger et à référencer. |
| **Ping** | Mécanique ping → pong (like → like retour = match). Universel. | Marque très utilisée dans le logiciel (risque de conflit). Générique. |
| **Liaison** | Liaison chimique et liaison amoureuse, élégant. | En français, « avoir une liaison » évoque l'infidélité. |
| **Epilove** | Déjà adopté par l'équipe, sonne bien. | Centré EPITA, proche de la marque d'une école. |

**Recommandation :** retenir **« Atomes »** comme nom public et **« atomes crochus »** comme plateforme créative (voir [02 — Design](02-design.md)). Faire valider le choix par un vote des ambassadeurs des cinq écoles avant fin octobre, puis vérifier : base INPI (classes 9, 38, 42, 45), disponibilité des domaines et des comptes Instagram/TikTok.

Règles d'usage des noms d'écoles, quel que soit le nom retenu :

- les noms des écoles servent uniquement à décrire l'éligibilité (« réservé aux étudiantes et étudiants de… ») ;
- aucun logo officiel ni charte graphique d'école n'est réutilisé ;
- mention visible : « Projet étudiant indépendant, non affilié à IONIS Education Group ni aux écoles citées ».

## Métriques de succès

**North Star :** nombre de **conversations réciproques par semaine** (une conversation où chaque personne a envoyé au moins trois messages). Elle capture à la fois l'adoption, la qualité du matching et la qualité des échanges, sans récompenser le temps d'écran.

| Indicateur | Définition | Cible de lancement (à recalibrer sur les effectifs réels) |
|---|---|---|
| Couverture | Inscrits vérifiés / effectif total du campus | 30 % à J+30 après le lancement |
| Participation au Pacte | Questionnaires complétés / inscrits | ≥ 60 % |
| Activation | Profils complets (≥ 2 photos validées, 3 prompts) / inscrits | ≥ 75 % |
| Taux de match | Matchs / likes envoyés | Suivi, pas de cible (dépend du bassin) |
| Match → conversation | Matchs avec au moins un message de chaque côté | ≥ 55 % |
| Rétention | Utilisateurs actifs à J+30 / cohorte | ≥ 35 % |
| Brassage | Part des matchs entre deux écoles différentes | ≥ 50 % |
| Sécurité | Signalements traités en moins de 24 h | ≥ 95 % |
| Confiance | Incident de données personnelles | 0 |
| Satisfaction | NPS trimestriel in-app | ≥ 40 |
