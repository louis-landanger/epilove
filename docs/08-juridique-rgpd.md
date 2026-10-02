# 08 — Cadre juridique et RGPD

> **Avertissement** : ce document est une synthèse de travail rédigée en octobre 2026 pour cadrer le projet. Ce n'est pas un avis juridique. Les points marqués *à confirmer* doivent être validés par un juriste (clinique juridique universitaire, avocat bénévole, service juridique d'une école) avant le lancement.

## 1. Porter le projet : une association

Une application qui traite des données sensibles de milliers de personnes ne peut pas reposer sur des individus sans structure. Recommandation : **créer une association loi 1901 inter-écoles** dédiée.

| Pourquoi | Détail |
|---|---|
| Responsabilité | L'association est responsable de traitement (RGPD) et éditeur du service, pas les étudiants personnellement |
| Contrats | Elle signe les contrats avec l'hébergeur et les sous-traitants (accords de traitement des données) |
| Financement | Elle peut recevoir des partenariats et des subventions, ouvrir un compte bancaire |
| Continuité | Le projet survit aux diplômes : un bureau se transmet |
| Assurance | Responsabilité civile de l'association |

Démarches : statuts (objet : favoriser les rencontres et le lien social entre étudiants des écoles du campus), assemblée constitutive, déclaration en préfecture, publication au JOAFE, compte bancaire, assurance. Compter 3 à 5 semaines.

## 2. Mentions légales

Depuis la loi SREN (mai 2024), l'obligation figure à l'**article 1-1 I de la LCEN** (anciennement article 6 III). Pour une personne morale : dénomination, siège social, téléphone, directeur ou directrice de la publication, et nom, adresse et téléphone de l'hébergeur. L'option d'anonymat prévue pour les éditeurs non professionnels ne s'applique pas clairement à une association : **tout publier**.

## 3. RGPD

### 3.1 Données sensibles

Le genre recherché révèle l'orientation sexuelle : c'est une **donnée sensible** (article 9). Le traitement repose sur le **consentement explicite** (article 9.2.a).

Exigences concrètes, tirées notamment des sanctions de la CNIL contre Meetic et Attractive World (2016), condamnés pour avoir recueilli ce consentement dans une case unique mêlant majorité et CGU :

- une **case à cocher distincte**, non pré-cochée, qui nomme explicitement la nature sensible de la donnée ;
- un consentement retirable à tout moment dans les réglages (le mode Love est alors désactivé, le mode Amis reste disponible) ;
- la preuve du consentement conservée (version du texte, date).

À noter : la justice norvégienne (affaire Grindr, amende confirmée en appel en octobre 2025) a jugé que **le simple fait d'être utilisateur** d'une application de rencontre ciblée pouvait constituer une donnée sensible. Conséquence pour nous : la présence d'une personne sur l'application est elle-même une information à protéger (discrétion par défaut, aucune liste publique, notifications neutres).

Aucune autre donnée sensible n'est collectée : pas de religion, d'opinions politiques, de santé ni d'origine, y compris dans le questionnaire du Pacte.

### 3.2 Finalités et bases légales

| Finalité | Données | Base légale |
|---|---|---|
| Compte et vérification de l'appartenance à une école | Email d'école, date de naissance | Exécution du contrat (6.1.b) |
| Profil et mise en relation | Prénom, photos, prompts, intérêts, école, promo | Exécution du contrat |
| Préférences de genre et orientation | Genres recherchés | **Consentement explicite** (9.2.a) |
| Messagerie | Messages, médias | Exécution du contrat |
| Modération et sécurité | Signalements, contenus signalés, signaux d'abus | Intérêt légitime (6.1.f) et obligations légales |
| Conservation des données d'identification | Voir § 3.4 | Obligation légale (6.1.c) |
| Mesure d'audience | Statistiques anonymes | Exemption CNIL si conditions respectées (§ 3.6), sinon consentement |
| Brise-glace par IA | Extraits de prompts pseudonymisés | Consentement (fonction facultative) |
| Emails de résumé | Email | Consentement (facultatif) |

### 3.3 Analyse d'impact (AIPD)

Les applications de rencontre ne figurent pas nommément dans la liste de la CNIL des traitements soumis à AIPD. Mais les critères du CEPD (deux critères sur neuf suffisent) sont remplis : **données sensibles** et **évaluation / mise en correspondance** de personnes, sans compter la modération automatisée. **Une AIPD est donc à réaliser**, avec l'outil PIA open source de la CNIL, avant le lancement.

### 3.4 Durées de conservation

| Données | Durée | Fondement |
|---|---|---|
| Profil, photos, préférences | Durée du compte ; effacement définitif sous 30 jours après suppression | Minimisation |
| Conversations | Durée du match ; effacées 30 jours après un *unmatch* ou une suppression de compte, sauf si signalées | Minimisation |
| Contenus signalés et décisions de modération | 1 an après la décision (plus si procédure en cours) | Intérêt légitime, preuve |
| Identité déclarée (email, prénom, date de naissance) | **5 ans** après la clôture du compte, dans un coffre séparé à accès restreint | Décret n° 2021-1362 *(à confirmer : applicabilité à l'association en tant qu'hébergeur)* |
| Données de compte (identifiant, données de vérification d'authentification) | 1 an après la clôture | Décret n° 2021-1362 |
| Données techniques de connexion (IP, horodatage) | 1 an | Décret n° 2021-1362 |
| Statistiques d'audience | 25 mois maximum | Recommandations CNIL |
| Journaux applicatifs (sans données personnelles) | 90 jours | Exploitation |

Le décret n'oblige à conserver que les données **déjà collectées** : on ne collecte rien de plus pour lui.

### 3.5 Droits des personnes

Accès, rectification, effacement, portabilité, opposition, retrait du consentement : en libre-service dans les réglages (export JSON + médias, suppression immédiate), et par email pour le reste. Réponse sous un mois.

### 3.6 Cookies et traceurs

- Cookies strictement nécessaires uniquement (session, sécurité, préférences) : pas de bannière de consentement requise pour eux.
- Mesure d'audience exemptée de consentement si elle respecte les conditions de la CNIL (délibération de juillet 2025) : finalité de mesure d'audience uniquement, pour le compte de l'éditeur seul, statistiques anonymes, pas de suivi entre sites, traceurs de 13 mois maximum, données conservées 25 mois maximum, information des personnes. À vérifier avec la grille d'auto-évaluation de la CNIL. Sinon : consentement.
- Polices **auto-hébergées** (la jurisprudence allemande a sanctionné le chargement de Google Fonts depuis les serveurs de Google).
- Aucun pixel publicitaire, jamais.

### 3.7 Sous-traitants

| Sous-traitant | Rôle | Point d'attention |
|---|---|---|
| Hébergeur (Hetzner ou Scaleway) | Serveurs | Union européenne |
| Cloudflare | DNS, CDN, WAF, Turnstile, stockage R2 | Société américaine : stockage R2 en juridiction UE, cadre de transfert (Data Privacy Framework, clauses contractuelles types) |
| Fournisseur d'emails (Brevo ou Scaleway) | Codes de connexion | Société française |
| PostHog (région UE) | Statistiques produit | Paramétrage sans données sensibles |
| Sentry (région UE) | Erreurs | Données personnelles masquées |
| Anthropic (Claude) | Modération de cas ambigus, brise-glace facultatifs | Transfert hors UE : vérifier les conditions contractuelles, minimiser et pseudonymiser |

Le Data Privacy Framework UE–États-Unis a été validé par le Tribunal de l'UE en septembre 2025 ; un pourvoi est pendant. Garder un plan B (clauses contractuelles types, solutions européennes) pour chaque sous-traitant américain.

### 3.8 Documents à produire

- Registre des traitements.
- AIPD.
- Politique de confidentialité (lisible, en couches : résumé + détail).
- Procédure de violation de données (notification CNIL sous 72 h).
- Accords de traitement signés avec chaque sous-traitant.
- Désignation d'un référent données personnelles dans le bureau de l'association (un DPO n'est probablement pas obligatoire, *à confirmer*).

## 4. Digital Services Act (DSA)

Applicabilité : le DSA vise les services « normalement fournis contre rémunération » ; pour un service gratuit d'une association sans revenus, l'application est incertaine. **Position retenue : appliquer les obligations de base de toute façon**, car elles correspondent à de bonnes pratiques de modération.

Une plateforme qui est une micro ou petite entreprise est exemptée des articles 20 à 28 (article 19), à l'exception de l'article 24(3).

| Article | Obligation | Statut | Ce que nous faisons |
|---|---|---|---|
| 11, 12 | Points de contact (autorités, utilisateurs) | Applicable | Adresses dédiées dans les mentions légales |
| 14 | Conditions générales claires, y compris la modération et ses outils | Applicable | CGU lisibles, section modération |
| 16 | Mécanisme de notification des contenus illicites | Applicable | Signalement depuis tout contenu |
| 17 | Motivation des décisions de modération | Applicable | Motivation automatique à chaque sanction |
| 18 | Signalement des infractions menaçant la vie ou la sécurité | Applicable | Protocole d'escalade (voir [07](07-confiance-securite.md)) |
| 20 | Système interne de réclamation | Exempté | **Appliqué volontairement** (recours) |
| 25 | Interfaces trompeuses | Exempté | **Appliqué volontairement** (principe produit) |
| 27 | Transparence des systèmes de recommandation | Exempté | **Appliqué volontairement** (page de transparence, voir [06](06-matching.md)) |

Autorité nationale de coordination : l'Arcom.

## 5. Autres points juridiques

- **Âge minimum** : aucune règle française ou européenne n'impose d'âge minimum spécifique aux applications de rencontre. Le seuil de 18 ans est un choix, non négociable, inscrit dans les CGU. La vérification par email d'école renforce la simple déclaration.
- **Décisions de justice** : depuis la loi SREN, un juge peut ordonner la suspension du compte d'une personne condamnée et l'interdiction d'en créer un nouveau (article 131-35-1 du Code pénal). Le principe « une adresse d'école = un compte » rend ces décisions applicables ; prévoir la procédure.
- **Réquisitions judiciaires** : procédure écrite (vérification de l'authenticité, réponse limitée au strict nécessaire, traçabilité).
- **Noms des écoles** : usage référentiel uniquement (« réservé aux étudiantes et étudiants de… ») ; ni logo, ni couleurs, ni typographies des écoles ; mention de non-affiliation visible. Le nom « Epilove » peut évoquer EPITA : à remplacer pour le nom public ou à faire valider par l'école. Vérifier les dépôts sur data.inpi.fr.
- **Contenus des utilisateurs** : licence limitée accordée à l'association pour afficher les contenus dans le service uniquement, révoquée à la suppression.
- **API tierces** : respect des conditions de chaque API (voir [03](03-stack.md#services-tiers)).

## 6. Relations avec les écoles

Une démarche proactive vaut mieux qu'une découverte par voie de presse :

1. Présenter le projet aux directions et aux référents VSS des cinq écoles **avant** le lancement, avec un dossier : objectifs, mesures de sécurité, modération, protection des données.
2. Proposer un partenariat léger : relais des ressources d'aide, contact privilégié en cas d'incident grave, communication commune sur le consentement.
3. Rester indépendant : l'association est seule responsable du service et ne transmet aucune donnée aux écoles hors obligation légale.
