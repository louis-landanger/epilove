# 07 — Confiance, modération et sécurité

> Sur un campus où tout le monde se connaît, un seul incident grave (harcèlement, fuite de données, *outing*) peut tuer le projet et blesser des personnes réelles. **La sécurité n'est pas une phase du projet, c'est une propriété de chaque fonctionnalité.**

---

## Partie A — Confiance et modération

### A1. Menaces propres à une application de rencontre de campus

| Menace | Exemple | Gravité |
|---|---|---|
| Harcèlement | Messages insistants, insultes, menaces, poursuite hors application | Critique |
| Images explicites non sollicitées | Photo envoyée sans demande | Élevée |
| *Outing* et exposition | Révéler l'orientation de quelqu'un, ou simplement sa présence sur l'application, à sa promo | Critique |
| Captures d'écran diffusées | Conversation ou profil partagé dans un groupe de promo | Élevée |
| Usurpation | Photos d'une autre personne | Élevée |
| Personne mineure | Étudiant de 17 ans en première année | Critique |
| Ex ou harceleur connu | Une personne cherche à retrouver quelqu'un qui l'a bloquée | Critique |
| Discours de haine | Propos racistes, homophobes, sexistes | Élevée |
| Spam ou promotion | Soirées payantes, comptes commerciaux | Faible |
| **Abus interne** | Un modérateur consulte le profil ou les messages d'une personne qu'il connaît | Critique |

### A2. Prévention

- **Vérification par email d'école** : une adresse, une personne. Un bannissement est donc réellement définitif (pas de recréation de compte).
- **Charte interactive** à l'inscription, trois écrans, avec les règles sur le consentement et la discrétion.
- **Restrictions des nouveaux comptes** (48 h) : moins de likes, pas d'image dans les messages.
- **Quotas** de likes et de messages.
- **Avertissement avant envoi** d'un message détecté comme agressif.
- **Floutage automatique** des images explicites reçues.
- **Masquage** de son école, de sa promo, de personnes précises.
- **Notifications neutres** par défaut.
- **Liens d'images signés et temporaires** : une photo copiée hors de l'application cesse de fonctionner.
- **Filigrane dynamique** propre au lecteur (P2) pour dissuader les captures partagées.

### A3. Détection

| Signal | Source |
|---|---|
| Signalements | Utilisateurs, en deux gestes depuis tout contenu |
| Texte toxique | Classifieur local, puis modèle de langage pour les cas ambigus (voir A6) |
| Images explicites | Classifieur d'images local, au téléversement |
| Photo de profil sans visage | Détecteur de visage local |
| Comportement anormal | Rythme de likes, messages identiques copiés-collés, nombre de blocages reçus |
| Blocages répétés | Une personne bloquée par plusieurs comptes indépendants en peu de temps passe en revue prioritaire |

### A4. Traitement des signalements

| Priorité | Exemples | Délai cible | Mesure conservatoire automatique |
|---|---|---|---|
| **P1** | Menace, violence, personne mineure, contenu sexuel non consenti, chantage | < 6 h | Profil masqué immédiatement en attendant la revue |
| **P2** | Harcèlement, insultes, image explicite, usurpation | < 24 h | Masquage si au moins 2 signalements indépendants |
| **P3** | Spam, faux profil probable, profil inapproprié | < 72 h | Aucune |

**Sanctions graduées** : avertissement → restriction (pas de nouveaux likes, pas d'images) → suspension 7 jours → suspension 30 jours → bannissement définitif. Les cas P1 avérés mènent directement au bannissement.

**Chaque décision** :

1. est motivée par écrit à la personne concernée (faits, règle enfreinte, sanction, voie de recours), conformément à l'article 17 du DSA ;
2. est communiquée à la personne qui a signalé (sans détail sur la sanction) ;
3. peut être contestée une fois, réexaminée par un autre modérateur ;
4. est consignée dans le journal d'audit.

**Escalade hors de l'application** : pour les faits graves, on oriente la victime (avec son accord) vers la cellule d'écoute ou le référent VSS de son école, et vers les autorités ; les contenus manifestement illicites sont signalés sur PHAROS ; les menaces pour la vie ou la sécurité d'une personne sont signalées aux autorités (article 18 du DSA). Les éléments de preuve sont conservés de façon sécurisée.

### A5. L'équipe de modération

- **Recrutement** : 2 ou 3 bénévoles par école, formés, avec une charte signée.
- **Récusation** : un modérateur ne traite jamais un cas impliquant une personne qu'il connaît. Les vues de modération affichent d'abord le contenu signalé, avec des identifiants pseudonymisés ; l'identité n'est révélée que si nécessaire, et cette révélation est tracée.
- **Moindre privilège** : aucun accès aux conversations hors signalement. Un modérateur ne voit que les messages joints au signalement (plus les N messages qui précèdent, pour le contexte).
- **Rotation et santé** : astreintes courtes, images choquantes floutées par défaut dans les outils, débrief régulier, possibilité de se retirer à tout moment.
- **Formation** : cas pratiques, grille de décision, protocole d'escalade. Un appui des cellules VSS des écoles serait précieux.

### A6. Modération automatique par paliers

Analyser chaque message avec un grand modèle de langage coûterait cher et enverrait des conversations privées à un tiers. On utilise des paliers :

| Palier | Outil | Quand | Coût |
|---|---|---|---|
| 1 | Règles et listes (insultes, motifs de spam, liens) | Chaque message, instantané | Nul |
| 2 | Classifieur de toxicité multilingue open source, hébergé chez nous | Chaque message, quelques millisecondes | Faible (CPU) |
| 3 | Modèle de langage (Claude, `claude-opus-5-5` par défaut, effort `low`, sortie structurée) | Uniquement les cas ambigus des paliers 1–2 et le pré-tri des signalements | Maîtrisé |
| 4 | Modération humaine | Signalements et cas sensibles | Temps bénévole |

Règles pour le palier 3 :

- les données sont **minimisées et pseudonymisées** (pas de prénom, pas d'école, uniquement l'extrait utile) ;
- la sortie est structurée (catégorie, gravité, justification courte) et ne déclenche jamais seule une sanction : elle **priorise** la file humaine ;
- le cas `stop_reason: "refusal"` est géré (le message passe alors directement en revue humaine) ;
- les traitements non urgents (re-scan, statistiques) passent par l'API Batch, moitié prix ;
- le choix d'un modèle moins coûteux (Claude Sonnet 5.5 ou Haiku 4.5) se fera **sur mesure**, en comparant les modèles sur un jeu d'évaluation construit à partir de cas réels anonymisés ;
- l'utilisation est décrite dans la politique de confidentialité et l'analyse d'impact (voir [08](08-juridique-rgpd.md)), et les conditions contractuelles du fournisseur (rétention, localisation) sont vérifiées avant la mise en production.

### A7. Charte communautaire (plan)

1. Respecte les autres : pas d'insulte, de menace, de propos haineux.
2. Le consentement d'abord : un « non », un silence ou un blocage se respectent. Aucune image sexuelle.
3. Sois toi-même : tes photos, ton prénom, ton âge réel.
4. Ce qui se passe dans l'application reste dans l'application : pas de capture partagée, pas d'*outing*.
5. Pas de commerce, pas de promotion.
6. En cas de problème, signale : c'est anonyme pour la personne signalée.

---

## Partie B — Sécurité applicative

Référentiel cible : **OWASP ASVS 5.0, niveau 2**, et l'OWASP Top 10 comme liste de contrôle en revue de code.

### B1. Modèle de menaces (STRIDE)

| Menace | Vecteur | Contre-mesures |
|---|---|---|
| **Usurpation** de compte | Force brute sur le code, vol de session | Code à 6 chiffres, 10 min, 5 essais ; limitation par IP et par email ; Turnstile ; cookies `HttpOnly`, `Secure`, `SameSite=Lax` ; rotation de session ; liste des appareils connectés avec révocation ; passkeys obligatoires pour l'équipe |
| **Altération** | Requêtes forgées, paramètres modifiés | Validation Zod à chaque frontière ; vérification `Origin` ; aucune confiance dans les identifiants envoyés par le client |
| **Répudiation** | Contestation d'une action de modération | Journal d'audit non modifiable (table en ajout seul, horodatée, avec l'auteur) |
| **Fuite d'information** | Accès à un profil ou une conversation non autorisée (IDOR), scraping, journaux bavards | Couche de politiques centralisée, testée par propriétés ; aucune donnée personnelle dans les journaux ; URL d'images signées et expirantes ; limitation de débit ; aucune liste publique de profils |
| **Déni de service** | Inondation de requêtes, téléversements massifs | Cloudflare (WAF, limitation), quotas applicatifs, taille maximale des fichiers, files de traitement asynchrones |
| **Élévation de privilèges** | Accès au back-office | Back-office sur un sous-domaine séparé, derrière Cloudflare Access, passkeys obligatoires, rôles fins, actions sensibles soumises à confirmation |

### B2. Mesures par domaine

**Authentification et sessions**
- Codes à usage unique plutôt que liens magiques (les filtres anti-hameçonnage de Microsoft 365 ouvrent les liens automatiquement et les « consomment »).
- Sessions stockées en base, révocables, durée glissante de 30 jours, expiration absolue de 90 jours.

**Autorisation**
- Toute lecture d'une ressource liée à une personne passe par une politique : `canViewProfile`, `canMessage`, `canViewPhoto`, `canModerate`…
- Les contraintes critiques sont aussi garanties par la base (unicité des paires de match, clés étrangères, contraintes de vérification).
- Option de défense en profondeur : Row Level Security de PostgreSQL sur les tables de messages.

**Données**
- TLS partout ; chiffrement des disques ; sauvegardes chiffrées.
- **Chiffrement applicatif** du corps des messages et des détails de signalement (libsodium, chiffrement par enveloppe, identifiant de clé pour permettre la rotation). Une copie de la base volée ne livre pas les conversations.
- Emails stockés en clair uniquement là où c'est nécessaire (connexion) ; ailleurs, empreintes HMAC avec un sel secret (masquage de personnes, crush secret).

**Fichiers**
- Téléversement direct vers une zone de quarantaine du stockage objet, via une URL présignée limitée en taille et en type.
- Validation du type réel (octets magiques), ré-encodage systématique, **suppression des métadonnées EXIF** (dont la position GPS).
- Médias servis depuis un domaine distinct de l'application (isolation des cookies).

**Navigateur**
- Content Security Policy stricte avec nonces, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` restrictive.
- Aucun HTML utilisateur interprété ; les messages sont du texte brut.

**Chaîne d'approvisionnement**
- Fichier de verrouillage des dépendances, Renovate, audit automatique, scripts d'installation bloqués par défaut (pnpm), revue de toute nouvelle dépendance.
- Analyse statique (CodeQL), détection de secrets (Gitleaks), analyse des images Docker (Trivy).

**Infrastructure**
- SSH par clé uniquement, pare-feu n'acceptant le trafic web que depuis Cloudflare, mises à jour de sécurité automatiques, conteneurs non-root avec système de fichiers en lecture seule quand c'est possible.
- Secrets dans un gestionnaire dédié, jamais dans le dépôt.

### B3. Programme sécurité

| Quand | Quoi |
|---|---|
| Chaque fonctionnalité | Mini-analyse de menaces dans la description de l'issue |
| Chaque pull request | Case « sécurité et vie privée » dans le modèle de PR ; revue obligatoire des chemins sensibles (auth, politiques, migrations) via CODEOWNERS |
| Chaque semaine | Mises à jour de dépendances |
| Avant le lancement | **Bug bounty interne** de deux semaines ouvert aux étudiants en sécurité du campus, avec règles d'engagement écrites, environnement dédié et récompenses ; scan dynamique (OWASP ZAP) sur la préproduction |
| Chaque mois | Test de restauration des sauvegardes |
| En continu | Fichier `security.txt`, adresse de divulgation responsable |

### B4. Réponse à incident

1. **Détecter** : alertes (erreurs, pics anormaux), signalements.
2. **Contenir** : révoquer les sessions ou les clés, couper la fonctionnalité via un feature flag, isoler le serveur.
3. **Évaluer** : quelles données, combien de personnes, quel risque.
4. **Notifier** : la CNIL sous 72 heures en cas de violation de données présentant un risque ; les personnes concernées si le risque est élevé.
5. **Corriger et documenter** : post-mortem sans recherche de coupable, actions correctives suivies.

Un modèle de communication de crise est préparé à l'avance (voir [10](10-lancement.md)).
