# ADR-0022 — Brise-glace par IA : consentement de chaque personne et extraits pseudonymisés

- **Statut** : accepté
- **Date** : 2026-10-02
- **Auteurs** : session B (Rencontre)

## Contexte

CHAT-04 propose des débuts de conversation « tirés des deux profils » par l'API Claude (docs/03 : `claude-opus-5-5`, effort `low`, sorties structurées). Le traitement part chez un sous-traitant hors UE (docs/08 : Anthropic, États-Unis ; base légale : consentement, fonction facultative). La fonction doit rester désactivée sans `ANTHROPIC_API_KEY`, sans drapeau et sans consentement, et ne jamais transmettre de prénom ni de donnée sensible. Or les réponses aux prompts sont du texte libre : elles peuvent contenir un prénom, un pseudo, un numéro de téléphone. Et le profil de l'autre personne lui appartient : c'est elle qui a écrit ses réponses, pas la personne qui demande des idées.

Le schéma commun prévoit déjà une table `consent` versionnée et historisée (RGPD, article 7) avec le type `ai_features`, encore inutilisé.

## Options envisagées

1. **Consentement de la personne qui demande seulement**, profil de l'autre envoyé dans tous les cas : suggestions plus riches, mais les réponses de l'autre partent chez un sous-traitant sans son accord.
2. **Fonction réservée aux paires où les deux ont consenti** : propre juridiquement, mais le bouton apparaît ou disparaît selon un réglage de l'autre, ce qui trahit ce réglage.
3. **Chacun ne partage que ce qu'il a autorisé** : la personne qui consent peut demander des idées dans toutes ses conversations ; les réponses de l'autre ne sont jointes que si l'autre a consenti aussi, sinon les idées partent du seul profil de la personne qui demande. L'écran est le même dans les deux cas.

## Décision

Option 3, avec :

- un consentement enregistré dans `consent` (type `ai_features`, version `AI_ICEBREAKER_RULES.consentVersion`), demandé au premier usage avec une explication en clair (ce qui part, où, ce qui n'est jamais fait) et retirable dans les réglages ; le retrait reste possible même si la fonction est coupée ;
- des extraits minimisés et pseudonymisés dans `@epilove/core` (`minimizeProfile`, `pseudonymize`) : 3 réponses aux prompts au plus, 240 caractères chacune, centres d'intérêt du catalogue fermé ; prénoms des deux personnes, adresses e-mail, liens, pseudos et numéros remplacés par des marqueurs ; ni photo, ni âge, ni école, ni genre, ni orientation, ni mode de la liaison ;
- un filtre de sortie (`acceptSuggestions`) : longueur, doublons, marqueurs, prénoms, et le filtre des messages (liens, coordonnées, insultes) ;
- un refus du modèle (`stop_reason: "refusal"`) traité comme un résultat normal (« pas d'idée cette fois »), une panne comme une indisponibilité qui ne consomme pas le quota (5 demandes par jour) ;
- rien n'est conservé : ni l'extrait, ni les idées ; la table `ai_icebreaker_request` ne sert qu'au quota ;
- une idée ne fait que remplir la zone de saisie : la personne la modifie et l'envoie elle-même.

## Conséquences

- Plus facile : aucune donnée de l'autre personne ne part sans son accord, et rien ne révèle son réglage ; le consentement suit le registre commun, exportable avec les autres preuves.
- Plus difficile : des suggestions plus pauvres quand l'autre n'a pas consenti. La pseudonymisation par motifs ne garantit pas l'absence de toute donnée identifiante dans un texte libre (un surnom, une adresse décrite en toutes lettres) ; le texte du consentement le dit clairement.
- Remise en cause si un modèle local (docs/03, IA locale d'abord) atteint une qualité suffisante, ou si le cadre contractuel du transfert hors UE n'est pas validé avant l'ouverture : le drapeau reste alors coupé.
