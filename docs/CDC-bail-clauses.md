# CDC — Clauses du bail et mise en forme du contrat

> Complète `README.md`, `docs/DOCUMENTATION_TECHNIQUE.md` et `cdc.md`. Périmètre : le contenu
> juridique du bail meublé (clauses), sa conformité au contrat type à jour, et le rendu du PDF.
> Aucun changement de l'EDL ni du modèle de sauvegarde.

## 1. Besoin

Le bail produit aujourd'hui est **conforme mais minimal** : il reprend la trame du contrat type
(parties I à XI) et s'arrête là. Trois manques :

1. **Il ne protège pas le bailleur autant que la loi le permet.** Le droit de visite en fin de
   bail, l'interdiction de sous-louer en meublé de tourisme, le détail des réparations locatives,
   l'entretien annuel de la chaudière, la déclaration des sinistres : rien de tout cela n'est
   écrit. Ce sont pourtant des clauses **licites**, et c'est le contrat qui les rend opposables.
2. **Il n'est plus tout à fait à jour.** Le décret n°2026-596 du 6 juillet 2026 modifie le contrat
   type pour les baux **conclus ou renouvelés à partir du 1er octobre 2026**, et la loi
   n°2023-668 a rendu la clause résolutoire pour impayés **obligatoire** — alors que
   l'application permet encore de la désactiver.
3. **Il ne se lit pas comme un contrat.** Pas de page de garde, pas de sommaire, pas de repères
   visuels : douze pages de texte au fil de l'eau. Un locataire ne retrouve pas le montant du
   dépôt de garantie, et rien ne signale ce qui l'engage.

L'objectif : un contrat **plus complet juridiquement, plus lisible, et à jour** — sans jamais
sortir de ce que la loi autorise.

## 2. Ce qui existe déjà (à réutiliser, ne pas refaire)

| Brique | État |
|---|---|
| Trame réglementaire I → XI | ✅ `BailPdf.tsx` suit le contrat type (décret 2015-587, annexe 2 — meublé) |
| Clause résolutoire, solidarité, honoraires « néant » | ✅ Rédigées et référencées |
| Clauses particulières libres | ✅ `Bail.clausesParticulieres: string[]`, saisies dans le formulaire |
| Checklist d'annexes | ✅ `annexesParDefaut`, imprimée en partie XI avec cases à cocher |
| Grille de vétusté annexée | ✅ Générée à chaque bail |
| Composants PDF | ✅ `EntetePdf`, `PiedDePagePdf`, `CaseACocher`, `QrCode`, `Rempl`, `pdfStyles` |
| Modèle éditable en Paramètres | ✅ Deux précédents : `grilleVetuste`, `ficheVisite` |
| Zones à compléter à la main | ✅ `Rempl` en mode brouillon |
| **Catalogue de clauses** | ❌ N'existe pas : rien entre « trame légale » et « texte libre » |
| **Mentions du décret 2026-596** | ❌ Téléphone portable des parties, servitude de résidence principale, clause résolutoire remaniée |
| **Clause résolutoire désactivable** | ⚠️ `Bail.clauseResolutoire = false` produit un bail non conforme depuis la loi 2023-668 |
| Page de garde, sommaire, paraphes | ❌ Aucun |

## 3. Décisions actées

- **Pack de clauses par défaut dans les Paramètres**, ajustable bail par bail — même ergonomie
  que la fiche de visite (cases à cocher, textes éditables, remise à zéro).
- **Les quatre familles sont retenues** : occupation & visites, entretien & réparations,
  assurance & justificatifs, vie de l'immeuble & troubles.
- **Rédaction du décret 2026-596 appliquée à tous les baux**, sans bascule par date : les ajouts
  sont soit facultatifs (téléphone), soit déjà obligatoires par la loi (clause résolutoire pour
  impayés depuis 2023). Un bail signé avant octobre 2026 n'en devient pas irrégulier.
- **Mise en forme « contrat structuré »** : page de garde récapitulative, sommaire, articles
  numérotés, encadrés pour les mentions clés, paraphes en pied de page.
- **La clause résolutoire pour impayés devient non désactivable.** Le champ
  `Bail.clauseResolutoire` est conservé pour relire les baux existants, mais l'interrupteur
  disparaît du formulaire.
- **Snapshot des clauses dans le bail.** Les clauses retenues sont **copiées dans le bail** à
  l'enregistrement (texte compris), pas seulement référencées. Sans cela, modifier le pack dans
  les Paramètres réécrirait le contenu d'un bail déjà imprimé et signé — inacceptable pour un
  contrat. Un bouton « Reprendre le modèle » permet de resynchroniser volontairement.
- **Aucune clause hors la loi.** Toute clause du catalogue porte sa base légale ; le §4.3 liste
  ce qui est écarté et pourquoi. L'application ne propose pas de clause « limite ».

## 4. Spécifications

### 4.1 Mise en conformité

**a) Décret n°2026-596 du 6 juillet 2026** (contrats conclus ou renouvelés dès le 1er octobre
2026) :

- **Téléphone portable** du bailleur et du ou des locataires — mention facultative, ajoutée à la
  désignation des parties (partie I). Déjà présent dans le modèle de données
  (`Parametres.bailleur.telephone`, `Locataire.telephone`) : il suffit de l'imprimer.
- **Servitude de résidence principale** (art. L.151-14-1 du code de l'urbanisme, créé par la loi
  n°2024-1039 dite « Le Meur ») : mention en partie II lorsque le logement est situé dans un
  secteur où le PLU impose l'usage exclusif de résidence principale. Nouveau champ
  `Bien.servitudeResidencePrincipale`.
- **Clause résolutoire** : le contrat type intègre obligatoirement les motifs « défaut de
  paiement du loyer ou des charges » et « non-versement du dépôt de garantie », et ouvre un motif
  **facultatif** supplémentaire : le non-respect de l'obligation de résidence principale
  ci-dessus. Nouveau champ `Bail.resiliationResidencePrincipale` (proposé seulement si le bien
  porte la servitude).

**b) Loi n°2023-668 du 27 juillet 2023** : la clause résolutoire pour défaut de paiement est
obligatoire, et elle ne produit effet que **six semaines** après un commandement de payer resté
infructueux (deux mois pour les baux antérieurs au 29 juillet 2023). Le délai est déjà correct
dans la fiche d'aide ; il doit apparaître **dans le bail lui-même**.

### 4.2 Catalogue de clauses (`CLAUSES_BAIL_DEFAUT`)

Chaque clause porte un identifiant stable, une famille, un titre, un texte et sa base légale.
Toutes sont **actives par défaut** sauf mention contraire. Le texte ci-dessous est la rédaction
livrée ; l'utilisateur peut la modifier dans les Paramètres.

#### A. Occupation, destination et visites

| id | Titre | Fond juridique |
|---|---|---|
| `occ-destination` | **Destination et occupation personnelle** — le logement est loué à usage exclusif d'habitation principale ; il est occupé personnellement et paisiblement par le locataire. Aucune activité professionnelle, commerciale ou artisanale, ni domiciliation d'entreprise, ne peut y être exercée sans l'accord écrit préalable du bailleur. | art. 7 b) et h) |
| `occ-sous-location` | **Sous-location** — la sous-location, même partielle et à titre gratuit, est interdite sans l'accord écrit du bailleur portant également sur le prix ; le prix au mètre carré de la sous-location ne peut excéder celui du loyer principal. Le locataire transmet au sous-locataire l'autorisation et une copie du bail. | art. 8 |
| `occ-tourisme` | **Location de courte durée et meublés de tourisme** — il est interdit au locataire de proposer le logement, même ponctuellement, à la location de courte durée ou en meublé de tourisme, notamment via une plateforme en ligne, ainsi que de le déclarer en mairie à ce titre, sans l'accord écrit du bailleur. | art. 8 ; art. L.324-1-1 du code du tourisme ; loi n°2024-1039 |
| `occ-visites` | **Visites en vue de la vente ou de la relocation** — en cas de congé donné ou reçu, ou de mise en vente, le locataire laisse visiter le logement **deux heures par jour ouvrable**, aux jours et heures convenus entre les parties, à défaut d'accord de 17 h à 19 h. Aucune visite les dimanches et jours fériés. | art. 4 a) — la limite est d'ordre public |
| `occ-acces-travaux` | **Accès pour travaux, entretien et diagnostics** — le locataire laisse exécuter les travaux d'amélioration des parties communes ou privatives, les travaux d'entretien normal, ceux nécessaires au maintien en état et à l'entretien normal, ceux d'amélioration de la performance énergétique et ceux nécessaires au respect des critères de décence, ainsi que la réalisation des diagnostics obligatoires. Le bailleur notifie les travaux par écrit avant leur commencement. Si les travaux excèdent vingt et un jours, le loyer est diminué à proportion du temps et de la partie du logement dont le locataire est privé. | art. 7 e) ; art. 1724 du code civil |
| `occ-notifications` | **Notifications et élection de domicile** — les échanges courants (justificatifs, charges, rendez-vous, travaux) peuvent se faire par courriel aux adresses du contrat. Restent soumis aux formes légales : congé, commandement de payer, mise en demeure préalable à résiliation. | art. 15 ; art. 1366 du code civil |
| `occ-adresse-sortie` | **Nouvelle adresse au départ** — le locataire indique son nouveau domicile à la remise des clés ; à défaut, le décompte est adressé à la dernière adresse connue. | art. 22 |
| `occ-residence-principale` | **Servitude de résidence principale** — *(imprimée uniquement si `Bien.servitudeResidencePrincipale`)* le logement est soumis à l'obligation prévue à l'article L.151-14-1 du code de l'urbanisme : il est à usage exclusif de résidence principale au sens de l'article 2 de la loi du 6 juillet 1989. | décret 2026-596 |

#### B. Entretien, réparations et restitution

| id | Titre | Fond juridique |
|---|---|---|
| `ent-reparations` | **Entretien courant et réparations locatives** — le locataire prend à sa charge l'entretien courant du logement, des équipements mentionnés au contrat et les menues réparations, ainsi que l'ensemble des réparations locatives énumérées par le décret n°87-712 du 26 août 1987, dont la liste est annexée au présent contrat. Restent à la charge du bailleur les réparations dues à la vétusté, à une malfaçon, à un vice de construction, à un cas fortuit ou à la force majeure. | art. 7 d) ; décret 87-712 |
| `ent-equipements` | **Entretien des équipements** — le locataire fait procéder, à ses frais et par un professionnel qualifié, à l'entretien annuel de la chaudière ou du chauffe-eau individuel, au ramonage des conduits de fumée selon la périodicité fixée par le règlement sanitaire départemental, et à l'entretien de la ventilation mécanique. Il conserve les justificatifs et les présente à la demande du bailleur, au plus tard lors de l'état des lieux de sortie. | art. 7 d) ; décret 87-712 ; décret n°2009-649 |
| `ent-prevention` | **Prévention des désordres** — le locataire aère quotidiennement le logement et le chauffe suffisamment pour prévenir l'humidité et les moisissures ; il n'obstrue pas les grilles de ventilation. En cas d'absence prolongée pendant la période de gel, il coupe l'arrivée d'eau et purge les canalisations. Il signale au bailleur **sans délai** tout sinistre, fuite, infiltration ou désordre affectant le logement ; il répond de l'aggravation des dommages résultant d'un défaut d'information. | art. 7 b), c) et d) |
| `ent-detecteur` | **Détecteur de fumée** — le logement est équipé d'un détecteur avertisseur autonome de fumée installé par le bailleur. Le locataire en assure l'entretien, le remplacement des piles et vérifie son bon fonctionnement pendant toute la durée du contrat. Il notifie son installation à son assureur. | art. L.142-2 et R.142-2 et suivants du CCH |
| `ent-ventilation` | **Ventilation du logement** — marche continue de l'extracteur, interdiction de l'arrêter, de le débrancher ou d'obstruer bouches et entrées d'air ; nettoyage régulier ; signalement des pannes au bailleur, à qui la réparation incombe. | art. 7 b) et d) ; décret n°2002-120 |
| `ent-edl-commissaire` | **État des lieux en cas de désaccord** — à défaut d'accord, établi par commissaire de justice à l'initiative de la partie la plus diligente, coût fixé par décret en Conseil d'État et partagé par moitié, convocation 7 jours à l'avance. | art. 3-2 |
| `ent-restitution` | **Restitution du logement** — au départ, le logement et son mobilier sont restitués en bon état d'entretien et de réparations locatives, propres et débarrassés, avec la totalité des clés et badges remis à l'entrée. Les dégradations constatées à l'état des lieux de sortie et non imputables à la vétusté ou à l'usage normal sont à la charge du locataire, **après application de la grille de vétusté annexée et sur présentation de devis ou de factures**. | art. 7 c) et d) ; art. 22 ; décret 2016-382 |
| `ent-mobilier` | **Mobilier et équipements du meublé** — l'inventaire et l'état détaillé du mobilier, annexés au contrat, font foi. Le locataire répond des éléments manquants ou détériorés ; il peut remplacer un élément par un équipement neuf de qualité et de nature équivalentes, avec l'accord écrit du bailleur. | art. 25-5 ; décret n°2015-981 |

#### C. Assurance, sinistres et information

| id | Titre | Fond juridique |
|---|---|---|
| `ass-obligation` | **Assurance des risques locatifs** — le locataire s'assure contre les risques dont il doit répondre en sa qualité de locataire et en justifie **à la remise des clés, puis chaque année à la demande du bailleur**. À défaut, et après une mise en demeure restée infructueuse pendant un mois, le bailleur peut, à son choix, souscrire une assurance pour le compte du locataire — la prime lui étant alors récupérable par douzièmes, majorée au maximum de 10 % — ou se prévaloir de la clause résolutoire. | art. 7 g) |
| `ass-sinistres` | **Déclaration des sinistres** — le locataire déclare tout sinistre à son assureur dans les délais du contrat d'assurance (cinq jours ouvrés, deux jours en cas de vol) et en informe le bailleur sans délai, en lui transmettant copie de la déclaration et les coordonnées de l'expert désigné. | art. L.113-2 du code des assurances |
| `ass-abonnements` | **Abonnements individuels** — électricité, gaz, eau au compteur individuel et communications électroniques souscrits au nom du locataire, consommations et frais de mise en service à sa charge, justificatifs de résiliation au départ. Le choix des fournisseurs lui appartient. | art. 7 a) |
| `ass-coordonnees` | **Coordonnées des parties** — chaque partie informe l'autre de tout changement d'adresse, de numéro de téléphone ou d'adresse électronique. Les notifications restent valablement faites à la dernière adresse communiquée. | décret 2026-596 (mention du téléphone portable) |

#### D. Vie de l'immeuble et troubles

| id | Titre | Fond juridique |
|---|---|---|
| `imm-reglement` | **Règlement de copropriété** — *(imprimée si le bien est en copropriété)* le locataire respecte le règlement de copropriété, dont les extraits relatifs à la destination de l'immeuble, à la jouissance et à l'usage des parties privatives et communes lui sont remis en annexe. | art. 3 |
| `imm-tranquillite` | **Jouissance paisible et troubles de voisinage** — le locataire use paisiblement du logement et veille à ne pas troubler la tranquillité du voisinage, de jour comme de nuit, y compris du fait des personnes qu'il héberge ou reçoit. Les troubles de voisinage constatés par une décision de justice passée en force de chose jugée constituent un motif de résiliation de plein droit du contrat. | art. 7 b) ; art. 24 |
| `imm-animaux` | **Animaux** — la détention d'un animal familier ne peut être interdite ; le locataire répond des dégradations et des nuisances qu'il occasionne. La détention de chiens de première catégorie (chiens d'attaque) est interdite par la loi ; les chiens de deuxième catégorie doivent être déclarés, tenus en laisse et muselés dans les parties communes. | loi n°70-598 du 9 juillet 1970 ; loi n°99-5 du 6 janvier 1999 |
| `imm-transformation` | **Transformation des lieux** — le locataire ne peut transformer les locaux et équipements sans l'accord écrit du bailleur. À défaut, le bailleur peut exiger leur remise en état au départ du locataire, ou conserver les transformations sans indemnisation. Sont réservés les travaux d'adaptation au handicap et les travaux de rénovation énergétique relevant du régime de la décision tacite. | art. 7 f) |
| `imm-securite` | **Sécurité** — le locataire n'entrepose ni produit dangereux ni matière inflammable en quantité anormale, n'utilise pas d'appareil de chauffage d'appoint à combustible non conforme, ne surcharge pas l'installation électrique et respecte les consignes de sécurité de l'immeuble. | art. 7 b) |

### 4.3 Clauses écartées — et pourquoi

Ce tableau fait partie du livrable : il justifie les absences et évite d'ajouter plus tard une
clause qui rendrait le bail contestable. Toutes ces stipulations sont **réputées non écrites**
(art. 4 de la loi du 6 juillet 1989, version en vigueur depuis le 21 novembre 2024) ou nulles.

| Clause souvent réclamée | Statut |
|---|---|
| Pénalité ou amende de retard de paiement | Interdite — art. 4 i) |
| Frais de relance, de recouvrement, d'expédition de quittance | Interdits — art. 4 p) |
| Le locataire est responsable de toute dégradation constatée | Interdite — art. 4 q) |
| Remboursement de réparations sur estimation unilatérale du bailleur | Interdite — art. 4 f) |
| Prélèvement automatique imposé comme seul mode de paiement | Interdite — art. 4 c) |
| Prélèvement direct sur le salaire | Interdite — art. 4 d) |
| Assurance à souscrire auprès d'un assureur désigné par le bailleur | Interdite — art. 4 b) |
| Interdiction d'héberger des proches | Interdite — art. 4 n) |
| Interdiction de détenir un animal familier | Nulle — loi n°70-598 |
| Interdiction d'activité politique, syndicale, associative ou confessionnelle | Interdite — art. 4 j) |
| Résiliation de plein droit pour un autre motif que ceux prévus | Interdite — art. 4 g) |
| Visites les dimanches et jours fériés, ou plus de deux heures par jour ouvrable | Interdite — art. 4 a) |
| Facturation au locataire d'un état des lieux de sortie non établi par commissaire de justice | Interdite — art. 4 k) |
| Location d'équipements facturée en sus du loyer | Interdite — art. 4 t) |
| Somme versée à l'entrée en sus du dépôt de garantie | Interdite — art. 4 o) |
| Solidarité du colocataire au-delà de six mois après son congé | Écartée — art. 8-1 |
| Indemnité de départ anticipé ou dédit | Écartée — le préavis d'un mois est d'ordre public (art. 25-8) |
| Indemnité d'occupation forfaitaire après congé (ex. « double du loyer ») | **Écartée par prudence** : requalification probable en clause pénale (art. 4 i). Le juge fixe l'indemnité. |
| Clause attributive de compétence territoriale | Écartée — la compétence est celle du lieu de l'immeuble |

### 4.4 Modèle de données

```ts
export type FamilleClause = 'occupation' | 'entretien' | 'assurance' | 'immeuble';

export interface ClauseBail {
  id: string;              // stable : 'occ-visites', 'ent-reparations'…
  famille: FamilleClause;
  titre: string;
  texte: string;
  /** Référence affichée en petit sous la clause (« art. 7 d) de la loi du 6 juillet 1989 »). */
  baseLegale?: string;
  /** Retenue par défaut pour un nouveau bail. */
  active: boolean;
  /** Imprimée seulement si la condition est remplie par le bien. */
  condition?: 'copropriete' | 'servitude_residence_principale';
}
```

- `Parametres.clausesBail?: ClauseBail[]` — le pack par défaut, éditable.
- `Bail.clauses?: ClauseBail[]` — **copie** des clauses retenues à l'enregistrement du bail.
- `Bien.servitudeResidencePrincipale?: boolean` — servitude L.151-14-1.
- `Bail.resiliationResidencePrincipale?: boolean` — motif facultatif de la clause résolutoire.
- `Bail.clauseResolutoire?: boolean` — **déprécié** : conservé pour la relecture des anciens
  baux, plus modifiable ; la clause est désormais toujours imprimée.
- Normalisation dans `getParametres` (comme `ficheVisite`) : un utilisateur existant récupère
  `CLAUSES_BAIL_DEFAUT` sans migration Dexie.

### 4.5 Réglages — pack de clauses

Nouvelle carte **« Clauses du bail »** dans `ParametresPage`, sous la fiche de visite :

- Liste groupée par famille, chaque clause avec : case « retenue par défaut », titre éditable,
  texte éditable (`Textarea`), base légale en petit, suppression, et ajout d'une clause maison.
- **« Réinitialiser les clauses par défaut »** avec confirmation (remontage forcé des champs non
  contrôlés, comme la fiche de visite).
- Un encadré d'avertissement reprenant le §4.3 en résumé : « la loi répute non écrites les
  clauses… ; ne remplacez pas un texte fourni par une pénalité ou une responsabilité automatique ».
- **« Aperçu (PDF) »** : rend le bail d'exemple avec le pack courant.

### 4.6 Formulaire de bail — ajustement par bail

Dans `BailRapidePage`, la section « Clauses & travaux » est complétée :

- **Liste des clauses du pack**, pré-cochées selon `active`, groupées par famille et repliables.
  Les clauses conditionnelles n'apparaissent que si le bien s'y prête (copropriété, servitude).
- Le texte reste consultable (dépliable) mais **non modifiable ici** : on modifie le modèle dans
  les Paramètres, ou on ajoute une clause particulière libre (champ existant, conservé).
- À l'enregistrement, les clauses retenues sont **copiées** dans `Bail.clauses`.
- En mode « Modifier », les clauses affichées sont celles du bail ; un bouton **« Reprendre le
  modèle des Paramètres »** resynchronise explicitement, avec confirmation.
- L'interrupteur « clause résolutoire » est retiré ; une ligne d'information le remplace
  (« obligatoire depuis la loi du 27 juillet 2023 »).

### 4.7 PDF — mise en forme

**a) Page de garde** — nouvelle première page :
- Titre du contrat, référence, date d'établissement.
- **Photo du logement** (`Bien.photoId`, convertie en data-URL par `photoBienEnDataUrl`) : bandeau
  pleine largeur sous le titre, hauteur fixe, cadrage `cover`. Absente = aucun cadre vide, et le
  titre reprend sa marge haute.
- **Encadré récapitulatif** : bailleur, locataire(s), adresse du logement, type et durée du bail,
  date d'effet, loyer hors charges, charges, **total charges comprises**, dépôt de garantie.
- Mention « établi en autant d'exemplaires originaux que de parties », renvoi aux annexes.

**b) Sommaire** — liste des parties I à XII avec leur intitulé.
- **Pas de numéros de page** : react-pdf ne mesure pas la pagination avant le rendu, et une
  numérotation fausse serait pire que pas de numérotation. En contrepartie, chaque partie porte
  un **signet PDF** (`bookmark`) : le lecteur navigue par le panneau des signets.

**c) Corps du contrat** :
- **Numérotation calculée, jamais écrite en dur** (`lib/pdf/bailPlan.ts`, fonction pure testée) :
  une partie non imprimée ne laisse pas de trou. Locataire unique → pas de partie « solidarité »
  (plutôt qu'une mention « sans objet » qui occupe un numéro) ; aucune condition générale retenue
  → la partie disparaît et les suivantes remontent. Le **sommaire est construit depuis la même
  liste** : il ne peut pas diverger du corps.
- Même règle pour le **lettrage des sous-parties** : un logement sans annexe ni partie commune
  imprime « A, B, C » et non « A, B, E ».
- Les clauses forment une partie **« Conditions générales d'occupation »**, sous-numérotée par
  famille (A occupation, B entretien, C assurance, D immeuble) puis par clause.
- **Encadrés** (`s.carte`) pour : loyer et charges, dépôt de garantie, clause résolutoire.
- **Base légale** de chaque clause en petit, sous son texte.
- `wrap={false}` par clause : aucune clause coupée entre deux pages.
- **Paraphes** : pied de page « Paraphes : bailleur ____ / locataire ____ », à côté de la
  pagination existante.

## 5. Contraintes

- **Ne rien inventer juridiquement.** Chaque clause du catalogue cite son fondement ; aucune ne
  figure dans la liste de l'article 4. Le disclaimer de l'application reste affiché : l'outil est
  une aide à la rédaction, pas un conseil juridique.
- **Baux déjà enregistrés** : `Bail.clauses` absent = bail d'avant la fonctionnalité. Son PDF se
  régénère **sans** la partie X, à l'identique de ce qui a été signé. Aucune réécriture
  rétroactive.
- **Poids et lisibilité** : le bail passe d'environ 10 à 14 pages. Acceptable pour un contrat,
  mais les clauses doivent rester denses (pas une clause par page).
- **Bail mobilité** : pas de dépôt de garantie, durée 1 à 10 mois, non renouvelable — les clauses
  sur la restitution du dépôt et la solidarité s'adaptent déjà ; vérifier que la partie X ne
  contredit rien.
- **Hors-ligne** : aucune ressource réseau ; les textes sont embarqués.

## 6. Découpage

| Lot | Contenu | Vérification |
|---|---|---|
| **L1** | Conformité : mentions du décret 2026-596, clause résolutoire obligatoire, servitude de résidence principale | PDF rendu et relu ; bail avec et sans servitude |
| **L2** | Types + `CLAUSES_BAIL_DEFAUT` + normalisation `getParametres` | Test unitaire : paramètres anciens complétés, pack personnalisé préservé |
| **L3** | Partie X dans le PDF (clauses, bases légales, encadrés, `wrap={false}`) | Test de rendu + contrôle visuel : pack complet, pack vide, clauses conditionnelles |
| **L4** | Page de garde, sommaire, signets, paraphes | Contrôle visuel des pages 1 et 2 ; bail long et bail minimal |
| **L5** | Panneau Paramètres (pack éditable, réinitialisation, aperçu) | Ajout/suppression/réinitialisation d'une clause |
| **L6** | Sélection par bail + copie dans `Bail.clauses` + retrait de l'interrupteur résolutoire | Parcours réel : création, modification, régénération d'un bail ancien |
| **L7** | README, `cdc.md`, tests | `npm run lint`, `npm test`, `npm run build` en code 0 |

## 7. Critères d'acceptation

- [x] Le bail imprime le téléphone des parties, la servitude de résidence principale si le bien y
      est soumis, et une clause résolutoire conforme (impayés + dépôt + assurance + troubles,
      délai de six semaines mentionné).
- [x] La clause résolutoire ne peut plus être désactivée depuis le formulaire.
- [x] Une nouvelle partie « Conditions générales d'occupation » regroupe les clauses retenues,
      chacune avec son intitulé et sa base légale, aucune coupée entre deux pages.
- [x] Le pack de clauses est modifiable dans les Paramètres (activation, titre, texte, ajout,
      suppression, réinitialisation) et se reflète dans le bail suivant.
- [x] Décocher une clause dans le formulaire de bail la retire du PDF, sans toucher au modèle.
- [x] Un bail enregistré conserve ses clauses telles qu'imprimées, même si le modèle change
      ensuite ; « Reprendre le modèle » les resynchronise sur demande.
- [x] Un bail créé avant la fonctionnalité se régénère sans partie « Conditions générales ».
- [x] Le PDF s'ouvre sur une page de garde (photo du logement si elle existe, récapitulatif et sommaire) ; chaque partie
      porte un signet ; chaque page porte la mention de paraphe.
- [x] Aucune clause du catalogue ne figure dans la liste de l'article 4 (relecture croisée §4.3).
- [x] Retirer une partie ou une sous-partie ne laisse aucun trou dans la numérotation, et le
      sommaire reste aligné sur le corps du contrat.
- [x] Le loyer est **révisable par défaut** : sans clause d'indexation au contrat, aucune
      augmentation n'est possible en cours de bail.
- [x] `npm run lint`, `npm test` et `npm run build` sortent en code 0.

## 8. Hors périmètre

- Location vide (titre I de la loi de 1989) : l'application reste dédiée au meublé.
- Bail de colocation à contrats multiples (un bail par colocataire).
- Signature électronique du bail : il reste imprimé et signé à la main.
- Génération d'un avenant au bail (changement de loyer, de colocataire) — sujet propre.
- Clauses sur mesure rédigées par l'utilisateur : le champ « clauses particulières » existant
  suffit ; l'application ne les contrôle pas.
