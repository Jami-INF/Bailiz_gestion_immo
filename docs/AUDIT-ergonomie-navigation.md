# Audit ergonomique - navigation et mise à disposition des fonctionnalités - 24 octobre 2026

> Porte sur `src/` : les 19 routes de `App.tsx`, la barre de `AppLayout.tsx`, la page Paramètres
> (11 cartes dépliables, 2 041 lignes réparties sur 6 fichiers) et les sept générateurs de PDF.
> Croisé avec `site/` : 7 pages outils, 10 guides, et les liens qu'elles envoient vers `/app/`.
> Référentiels : `docs/CDC-accessibilite-ux.md` (sobriété, cibles tactiles), `cdc.md`.
>
> Méthode : lecture des sources, puis mesures dans le navigateur sur l'application réellement
> servie (390 × 844 et 1440 × 900). Les chiffres cités ont été relevés, pas estimés.

---

## 1. Ce qui est acquis, et qu'il ne faut pas casser

Le diagnostic qui suit est sévère sur un point précis. Il ne l'est pas sur le reste, et le reste
est l'essentiel.

- **Les deux parcours principaux sont courts et sans préalable.** Rédiger un bail ou mener un
  état des lieux se fait en un écran, le logement et le locataire se saisissant dans le
  formulaire. L'EDL ne réclame pas de bail. C'est la bonne décision, et elle est tenue partout
  (tableau de bord vide, `EdlListePage`, `BauxPage`).
- **Les listes principales sont homogènes.** `BarreListe` donne la même recherche et le même tri
  à Biens, Locataires et Baux, et ne s'affiche qu'au-delà de six éléments.
- **Le mode terrain est traité à part, et bien.** `pleinEcran` retire la barre latérale sur
  `/edl/:id`, et `BandeauMiseAJour` se tait pendant la saisie.
- **La fiche d'un bail est déjà une boîte à outils locale.** `BailDetailPage` réunit sous
  « Documents utiles » la fiche d'aide, l'acte de cautionnement, la grille de vétusté et le
  courrier IRL. Le modèle est juste ; il n'existe simplement nulle part ailleurs.
- **Les cartes dépliables disent leur état.** « 25 clauses, 18 proposées », « Dossier “Bailiz” ».
  Sans ce résumé, replier ne ferait que cacher.

Aucun de ces acquis n'est remis en cause par ce qui suit.

---

## 2. Le diagnostic en une phrase

**Bailiz expose correctement ses deux parcours et mal ses sept outils.** Tout ce qui n'est ni
« un bail » ni « un état des lieux » a été rangé dans Paramètres, ou enfermé derrière une fiche.
Il manque un étage à la navigation, pas une fonctionnalité.

---

## 3. Paramètres est devenu un débarras

### 3.1 Mesures

| Mesure | Valeur relevée |
|---|---|
| Cartes dépliables | 11 (+ la carte « Vos données », toujours ouverte) |
| Hauteur de la page, **tout replié**, à 1440 px | 1 813 px |
| Hauteur de la page, **tout replié**, à 390 px | 2 485 px, soit **2,9 écrans** |
| Code de la page et de ses panneaux | 2 041 lignes |

2,9 écrans de défilement pour lire uniquement des **titres** de cartes fermées : le pliage a bien
réglé le problème de 2026 (46 000 px), il n'a pas réglé celui de 2026 bis, qui est le **nombre**
de cartes.

### 3.2 Quatre natures mélangées sous un seul mot

| Carte | Nature réelle | Sa place |
|---|---|---|
| Vos données | état | Paramètres ✅ |
| Bailleur | **réglage** | Paramètres ✅ |
| Clauses du bail | **réglage** | Paramètres ✅ |
| Grille de vétusté (le tableau) | **réglage** | Paramètres ✅ |
| Fiche de visite (le modèle) | **réglage** | Paramètres ✅ |
| Archive complète : export / restauration | **sécurité des données** | Paramètres ✅ |
| Copie dans un dossier de l'ordinateur | **sécurité des données** | Paramètres ✅ |
| Synchronisation Google Drive | **sécurité des données** | Paramètres ✅ |
| Données personnelles (RGPD) | information + action destructrice | Paramètres ✅ |
| Avertissement juridique | information | Paramètres ✅ |
| **Grille de vétusté (le bouton PDF)** | **outil** | ❌ à sortir |
| **Fiche d'aide juridique** | **outil** (un PDF à télécharger, rien à régler) | ❌ à sortir |
| **Vérifier l'empreinte d'un document** | **outil** (on y colle un fichier) | ❌ à sortir |

Trois cartes sur onze ne sont pas des paramètres. Ce n'est pas qu'un défaut de rangement : c'est
ce qui rend les huit autres introuvables, parce qu'on apprend à ne plus lire la page.

Le symptôme est déjà visible dans la rédaction : la carte « Vérifier l'empreinte d'un document »
porte un **verbe à l'infinitif**, comme une action. Les dix autres portent un nom. Le code
signale lui-même ce qui n'est pas à sa place.

### 3.3 Aucun moyen de pointer une carte

`CarteRepliable` mémorise son pli dans `localStorage`, mais la page n'accepte **aucun paramètre
d'ouverture**. Il est impossible, depuis quoi que ce soit, d'envoyer quelqu'un sur « Grille de
vétusté ». On ne peut que l'envoyer en haut d'une page de 2,9 écrans en lui souhaitant bonne
chance. Et comme `CarteRepliable` ne monte pas le contenu fermé (choix assumé, et juste, pour
l'iPad), la **recherche du navigateur ne le trouve pas non plus**.

---

## 4. Sept outils, et pour cinq d'entre eux une seule porte

Inventaire des générateurs et de leur unique point d'entrée :

| Document produit | Où on le déclenche aujourd'hui | Condition d'accès |
|---|---|---|
| Bail meublé | `/baux/nouveau` | aucune ✅ |
| État des lieux | `/edl/nouveau` | aucune ✅ |
| Grille de vétusté (PDF) | Paramètres, 5ᵉ carte · fiche d'un bail | déplier la bonne carte |
| Fiche d'aide juridique (PDF) | Paramètres, 8ᵉ carte · fiche d'un bail | déplier la bonne carte |
| Fiche de visite | fiche d'un **bien** uniquement | **avoir créé un bien** |
| Acte de cautionnement | fiche d'un **bail** uniquement | **avoir créé un bail** |
| Courrier de révision IRL | fiche d'un **bail** uniquement | **avoir un bail révisable** |
| Lettre de restitution du dépôt | synthèse d'un **EDL de sortie** | **avoir un EDL de sortie signé** |
| Vérifier une empreinte | Paramètres, 9ᵉ carte | déplier la bonne carte |

Les quatre dernières lignes décrivent le même défaut : **l'outil est subordonné à une fiche.**
C'est cohérent quand on gère un parc dans Bailiz. Ça ne l'est pas du tout pour le public que la
vitrine va chercher - « choisissez un outil, remplissez, générez », sans compte et sans
préparation.

Cas concret, et il n'est pas théorique : un bailleur dont le bail a été signé en agence veut
envoyer son courrier de révision IRL. Bailiz sait le produire. Pour l'obtenir, il doit créer un
bien, puis un bail complet, dont il n'a aucun usage. Il ne le fera pas.

Même chose pour la fiche de visite, qui est pourtant l'outil d'**avant** la location : elle exige
une fiche de bien, c'est-à-dire exactement ce qu'on n'a pas encore quand on fait visiter.

---

## 5. La vitrine promet des outils, l'application livre un écran de réglages

`site/` publie sept pages outils et dix guides. Voici où atterrit chacun de leurs appels à
l'action :

| Page vitrine | Destination dans l'app | Ce qu'on y trouve |
|---|---|---|
| `/bail-meuble/` | `#/baux/nouveau` | ✅ l'outil |
| `/etat-des-lieux/` | `#/edl/nouveau` | ✅ l'outil |
| `/depot-de-garantie/` | `#/edl` · `#/edl/nouveau` | ⚠️ la liste, pas la lettre de restitution |
| `/revision-de-loyer-irl/` | `#/baux` · `#/baux/nouveau` | ⚠️ la liste, pas le courrier IRL |
| `/grille-de-vetuste/` | `#/parametres` | ❌ haut d'une page de 11 cartes fermées |
| `/fiche-de-visite/` | `#/parametres` · `#/biens` | ❌ idem, ou une liste vide |
| `/acte-de-cautionnement/` | `#/baux/nouveau` | ❌ un formulaire de bail complet |

**Deux promesses tenues sur sept.** Et la navigation de la vitrine affiche « Outils » et
« Guides » en première ligne, deux entrées auxquelles l'application ne répond par rien : les dix
guides rédigés ce mois-ci ne sont atteignables depuis l'app que par le lien `bailiz.fr` du pied
de page - lequel disparaît en PWA installée (`useModeAutonome`).

C'est le point qui justifie l'intuition de départ : **il manque un lien « Boîte à outils ».** Mais
il manque surtout la page au bout du lien.

---

## 6. La barre de navigation est saturée, et pas là où on croit

Mesures à 390 px (iPhone 14), barre basse :

| Entrée | Largeur de l'onglet | Lignes du libellé |
|---|---|---|
| Tableau de bord | 54 px | **2** |
| Biens | 42 px | 1 |
| Locataires | 66 px | 1 |
| Baux | 40 px | 1 |
| États des lieux | 47 px | **3** |
| Documents | 71 px | 1 |
| Paramètres | 71 px | 1 |
| **Total** | **390 px pour 390 px disponibles** | hauteur de barre : **86 px** |

La barre est **exactement saturée**. « États des lieux » tient sur trois lignes de 10 px, et c'est
ce qui porte la barre à 86 px de haut - 10 % de l'écran, en permanence. **Ajouter une huitième
entrée au même endroit n'est pas possible**, et ce n'est pas une question de goût.

Deux conséquences en découlent, toutes deux déjà présentes :

- **L'état de sauvegarde est invisible sur mobile.** `SauvegardeStatut` et l'indicateur
  « Stockage persistant » sont en `hidden sm:flex`, donc absents du téléphone et de la barre
  repliée - c'est-à-dire de l'iPad de terrain, l'appareil le plus exposé à la perte. Le code le
  reconnaît déjà en commentaire pour le bandeau de reconnexion ; le constat vaut pour la
  sauvegarde elle-même.
- **Le pli de la barre latérale est global et non contextuel.** `bailiz.navRepliee` est écrit une
  fois pour toutes au premier lancement selon `innerWidth < 1280`. Ouvrir Bailiz d'abord sur le
  téléphone fige la barre repliée pour l'ordinateur. Vérifié en session : barre en icônes seules à
  1440 px après un premier chargement à 390 px.

---

## 7. Écarts de cohérence, moindres mais réels

- **La liste des états des lieux n'a ni recherche, ni tri, ni filtre.** C'est pourtant la liste
  qui grossit le plus vite (deux EDL par bail). Les trois autres listes ont `BarreListe` ;
  `EdlListePage` fait 75 lignes et affiche tout, à plat. Il manque aussi le filtre le plus utile :
  brouillon / signé.
- **Un EDL signé s'ouvre sur l'écran terrain, pas sur sa synthèse.** Depuis la liste, un EDL
  verrouillé renvoie vers `/edl/:id`, où un bandeau propose un lien vers `/edl/:id/synthese`.
  C'est un clic de trop sur l'écran dont on n'a plus rien à tirer.
- **La page Documents filtre mais ne cherche pas.** Trois listes déroulantes (bien, bail, type),
  aucun champ texte, alors que les documents portent une référence et un titre.
- **Le tableau de bord rempli n'offre que « Nouveau bien ».** Les deux actions qui font
  l'application - rédiger un bail, faire un état des lieux - ne sont proposées que sur l'écran
  **vide**. Dès qu'il y a un bien, la seule action de premier niveau est la moins importante des
  trois.
- **Route morte.** `/baux/rapide` rend `BailRapidePage` et n'est référencée nulle part, ni dans
  `src/`, ni dans `site/`, ni dans la documentation.

---

## 8. Ce qu'il faut faire

Trois lots, par ordre d'impact. Le lot 1 répond à la question posée et vaut à lui seul la moitié
du bénéfice.

### Lot 1 - Une page « Outils », et la place pour y aller

**1.1 Créer `/outils`** (`src/features/outils/OutilsPage.tsx`), en trois sections :

- **Produire un document** - huit cartes, chacune avec son icône, une phrase, et un bouton :
  bail meublé, état des lieux, fiche de visite, acte de cautionnement, courrier de révision IRL,
  lettre de restitution du dépôt, grille de vétusté (PDF), fiche d'aide juridique (PDF).
  Les deux derniers sont immédiats. Les quatre du milieu ouvrent **un sélecteur** (le bien, le
  bail, l'EDL de sortie concerné) qui propose en premier « saisir à la volée » quand la base est
  vide - exactement ce que `BailRapidePage` fait déjà pour le logement et le locataire.
- **Vérifier** - `EmpreintePanel`, déplacé tel quel.
- **Comprendre** - les dix guides de `bailiz.fr/guides/`, en liens externes. C'est le seul moyen
  pour un utilisateur de PWA installée d'y accéder ; la sortie du `scope` est ici voulue, et doit
  être signalée par l'icône habituelle de lien externe.

**1.2 Faire de la place dans la barre.** La barre basse est pleine : il faut **réduire à cinq**
entrées sur mobile (Tableau de bord, Biens, Baux, États des lieux, **Plus**) et déporter dans
une feuille « Plus » - réutiliser `Modal` - les entrées Locataires, Outils, Documents,
Paramètres. Locataires y perd un rang : assumé, c'est l'écran dont le formulaire de bail dispense
déjà. Sur `sm:` et au-delà, la barre latérale garde **les huit entrées**, en deux groupes séparés
d'un filet (« Travail » / « Outils et réglages ») : elle a la hauteur disponible, l'espace
`grow` est aujourd'hui vide.

**1.3 Profiter de la feuille « Plus » pour y mettre `SauvegardeStatut` et l'indicateur de
stockage**, aujourd'hui invisibles sur mobile. Un bug d'affichage réglé par la même pièce.

**1.4 Dégraisser Paramètres de 11 à 9 cartes** : fiche d'aide et empreinte partent dans Outils ;
le bouton « Télécharger la grille (PDF) » quitte la carte « Grille de vétusté », qui ne garde que
le tableau. Grouper les 9 restantes sous trois intertitres non repliables - « Vos données »,
« Vos documents », « L'application ».

**1.5 Ouvrir une carte par l'URL** : `#/parametres?ouvrir=vetuste`, lu par `useSearchParams` et
passé en `defautOuvert` à la carte visée. Deux dizaines de lignes, et c'est ce qui rend les liens
de la vitrine honnêtes.

### Lot 2 - Tenir la promesse de la vitrine

**2.1 Réorienter les sept appels à l'action** une fois `/outils` en place :

| Page vitrine | Destination actuelle | Destination à viser |
|---|---|---|
| `/grille-de-vetuste/` | `#/parametres` | `#/outils` (+ `#/parametres?ouvrir=vetuste` pour « personnaliser la grille ») |
| `/fiche-de-visite/` | `#/parametres` | `#/outils` (+ `?ouvrir=fiche-visite`) |
| `/acte-de-cautionnement/` | `#/baux/nouveau` | `#/outils` |
| `/revision-de-loyer-irl/` | `#/baux` | `#/outils` |
| `/depot-de-garantie/` | `#/edl` | `#/outils` |
| `/bail-meuble/`, `/etat-des-lieux/` | inchangées ✅ | inchangées |

**2.2 Ajouter « Outils » au maillage retour** : le pied de page de l'app pointe `bailiz.fr` ;
la section « Comprendre » d'`/outils` rend le trajet inverse.

### Lot 3 - Cohérence des listes et des raccourcis

- `BarreListe` sur `EdlListePage`, plus un filtre brouillon / signé.
- Un EDL signé ouvre `/edl/:id/synthese` depuis la liste.
- Champ de recherche texte sur `DocumentsPage`, à côté des trois filtres.
- Tableau de bord rempli : « Rédiger un bail » et « Faire un état des lieux » en actions d'entête,
  « Nouveau bien » passant en secondaire.
- Supprimer la route `/baux/rapide`.
- `bailiz.navRepliee` : ne mémoriser le pli que pour les largeurs `sm:` et au-delà, où la barre
  latérale existe.

---

## 9. Ce qu'il ne faut pas faire

Ce chapitre vaut le précédent. L'application est légère et ne doit pas payer son rangement.

- **Ne pas ajouter une huitième entrée à la barre basse.** Mesuré : elle est pleine à 390 px.
- **Ne pas transformer `/outils` en catalogue de fonctionnalités.** Huit cartes d'action, une
  phrase chacune. Si la page dépasse deux écrans à 390 px, c'est qu'elle a commencé à décrire au
  lieu de donner accès.
- **Ne pas dupliquer les générateurs.** `/outils` appelle les composants existants
  (`FicheVisiteModal`, `ActeCautionnementPdf`, `CourrierIrlPdf`, `LettreRestitutionPdf`,
  `genererEtArchiver`) ; la seule pièce neuve est le sélecteur d'entité. La fiche d'un bail garde
  sa section « Documents utiles » : elle est à sa place, c'est le raccourci contextuel.
- **Ne pas déplacer les réglages qui sont bien là.** Bailleur, clauses, grille, modèle de fiche de
  visite, et les trois cartes de sécurité des données restent dans Paramètres.
- **Ne pas inventer de recherche globale.** `BarreListe` par liste suffit ; une barre unique
  obligerait à unifier quatre modèles de données pour un gain nul à cette échelle.
- **Ne pas embarquer les guides dans l'app.** Dix articles Markdown dans le bundle d'une PWA
  hors-ligne, pour un contenu qui change avec la loi : des liens sortants, et c'est tout.

---

## 10. Critères d'acceptation

1. Depuis un Bailiz **vide**, chacun des huit documents de l'inventaire §4 s'obtient en **trois
   clics ou moins** depuis le tableau de bord, sans créer de fiche dont on n'a pas l'usage.
2. Chacune des sept pages outils de `site/` mène à l'outil qu'elle décrit, pas à une liste ni à
   un écran de réglages.
3. La barre basse à 390 px contient **cinq entrées**, chaque libellé tenant sur **une ligne**, la
   barre ne dépassant pas **64 px** de haut (86 px aujourd'hui).
4. L'état de sauvegarde est lisible **sur téléphone**, sans passer par les Paramètres.
5. Paramètres, tout replié, tient en **moins de deux écrans à 390 px** (2 485 px aujourd'hui, soit
   2,9 écrans).
6. `#/parametres?ouvrir=<identifiant>` ouvre la carte visée, pour les onze identifiants existants.
7. `/outils` tient en moins de deux écrans à 390 px.
8. Aucune régression des tests existants de `ParametresPage.*.test.tsx` : les panneaux déplacés
   gardent leur comportement, seul leur hôte change.

---

## 11. Chiffrage

| Lot | Fichiers touchés | Pièces neuves |
|---|---|---|
| 1 | `App.tsx`, `AppLayout.tsx`, `ParametresPage.tsx`, `EmpreintePanel.tsx` (déplacé) | `OutilsPage.tsx`, `SelecteurEntite.tsx`, `FeuillePlus.tsx` |
| 2 | 5 fichiers `site/src/pages/*.astro` | aucune |
| 3 | `EdlListePage.tsx`, `DocumentsPage.tsx`, `TableauDeBordPage.tsx`, `App.tsx`, `AppLayout.tsx` | aucune |

Le lot 1 est le seul qui demande du code nouveau, et l'essentiel en est du câblage : les sept
générateurs existent, sont testés, et ne sont pas modifiés.

---

## 12. Réalisation - lot 1 (24 octobre 2026)

Mesures reprises sur l'application servie, au même format qu'au §6 et au §3.1.

### Ce qui est tenu

| Critère (§10) | Avant | Après |
|---|---|---|
| 3. Barre basse à 390 px | 7 onglets, 390 px pour 390 px, **86 px** de haut | **5 onglets**, 205 px pour 390, **56 px** de haut, tous les libellés sur une ligne |
| 4. État de sauvegarde sur téléphone | invisible (`hidden sm:flex`) | dans la feuille « Plus » |
| 6. `?ouvrir=<identifiant>` | inexistant | ouvre la carte visée et y défile, pli enregistré ou non |
| 7. `/outils` sous deux écrans à 390 px | — | **1 311 px, 1,6 écran** |
| 8. Aucune régression | — | **639 tests passent**, dont 18 neufs |

Deux points du critère 1 passent par l'écran qui détient le calcul plutôt que par une
reproduction : le courrier de révision ouvre la fiche du bail avec le calculateur déjà déplié
(`/baux/:id?outil=irl`), la lettre de restitution ouvre la synthèse de sortie. L'acte de
cautionnement, lui, se produit **sans aucune fiche** - c'est la signature manuscrite qui engage
la caution, pas le pré-remplissage.

### Ce qui ne l'est pas

**Critère 5 - Paramètres sous deux écrans à 390 px : non tenu dans l'état par défaut.** La page
passe de 11 à 9 cartes, mais les trois intertitres reprennent une bonne part de ce que les deux
cartes retirées rendaient :

| État | Avant | Après |
|---|---|---|
| Toutes cartes repliées | ≈ 1 519 px (1,8 écran) | **1 454 px (1,7 écran)** ✅ |
| Base neuve, carte « Bailleur » ouverte d'office | 2 485 px (2,9 écrans) | **2 396 px (2,8 écrans)** ❌ |

Le gain réel de ce lot sur cette page n'est donc pas la hauteur : c'est que **plus aucune des
neuf cartes n'est un outil**, qu'elles sont rangées en trois groupes nommés, et qu'on peut
enfin en désigner une depuis l'extérieur. Abaisser vraiment la hauteur demanderait de replier
« Bailleur » par défaut - c'est-à-dire de cacher le seul réglage qui bloque la production d'un
document tant qu'il n'est pas renseigné. À ne pas faire pour gagner 400 pixels.

### Poids

Bundle JavaScript : 2 471 792 → **2 484 074 octets (+12 Ko, +0,5 %)**. Aucune dépendance
ajoutée ; `ouvrirActeCautionnement` retire au passage une duplication entre la fiche du bail et
la boîte à outils.

### Hors lot, dans le même fichier

La route morte `/baux/rapide` (§7) a été supprimée en même temps que l'ajout de `/outils` dans
`App.tsx`.

### Reste à faire

Lots 2 et 3 entiers. Le lot 2 est désormais débloqué : `/outils` et `?ouvrir=` existent, les
sept appels à l'action de la vitrine peuvent viser l'outil qu'ils décrivent.

---

## 13. Réalisation - lot 2 (24 octobre 2026)

### Les sept promesses, vérifiées sur le HTML produit

| Page vitrine | Avant | Après |
|---|---|---|
| `/bail-meuble/` | `#/baux/nouveau` ✅ | inchangé |
| `/etat-des-lieux/` | `#/edl/nouveau` ✅ | inchangé |
| `/acte-de-cautionnement/` | `#/baux/nouveau` ❌ | **`#/outils`** + `#/baux/nouveau` en second |
| `/grille-de-vetuste/` | `#/parametres` ❌ | **`#/outils`** + `#/parametres?ouvrir=vetuste` |
| `/fiche-de-visite/` | `#/biens` · `#/parametres` ❌ | **`#/outils`** + `#/parametres?ouvrir=fiche-visite` |
| `/revision-de-loyer-irl/` | `#/baux` ⚠️ | **`#/outils`** + `#/baux/nouveau` |
| `/depot-de-garantie/` | `#/edl` ⚠️ | **`#/outils`** + `#/edl/nouveau` |

**Critère 2 tenu : sept sur sept.** Les deux liens `?ouvrir=` ont été exercés sur l'application
servie - la carte visée s'ouvre et la page y défile (`scrollY` 563 et 117).

La page `/outils/` de la vitrine gagne elle aussi l'entrée qui lui manquait : « Ouvrir la boîte
à outils », en tête et en pied. Elle annonçait sept outils et ne menait qu'à deux d'entre eux.

### Ce que la prose disait de faux

Rediriger un bouton sans corriger la phrase au-dessus n'aurait fait que déplacer le mensonge.
Trois affirmations étaient devenues fausses après le lot 1 :

- `/acte-de-cautionnement/` : « L'acte se produit depuis la section “garant” du formulaire de
  bail » et « Il n'a pas de formulaire à lui ». Il en a un.
- `/fiche-de-visite/` et `/revision-de-loyer-irl/` : les mentions laissaient croire qu'il fallait
  d'abord ouvrir une fiche. Elles disent maintenant ce que l'outil propose, et ce qu'il fait
  quand il n'y a rien à proposer.
- `FicheVisitePanel` (dans l'application) annonçait un document « généré depuis la fiche d'un
  bien », seul chemin jusqu'au lot 1.

Les mentions de « paramètres » restées dans les FAQ sont, elles, toujours exactes : la grille,
le modèle de fiche de visite et l'identité du bailleur n'ont pas bougé. Deux d'entre elles
nomment désormais la rubrique.

### Garde-fou

`#/parametres?ouvrir=vetuste` et `?ouvrir=fiche-visite` reposent sur deux `identifiant` de
`CarteRepliable`. Les renommer casserait des liens entrants **sans rien casser à la
compilation**. Un test les exerce donc depuis l'URL (`ParametresPage.panneaux.test.tsx`,
« liens entrants de la vitrine »).

### Vérifications

Build Astro : 24 pages. Un seul `<h1>` par page, `title` et `description` inchangés, **aucun
lien interne cassé** (vérifié sur `site/dist`). Rendu relu à 390 px sur les six pages modifiées :
les paires de boutons s'empilent sans débordement. Tests de l'application : **640 passent**
(un de plus qu'au lot 1).

### Reste à faire

Lot 3 entier. Les dix guides ne pointent toujours vers aucun outil de l'application - le trajet
inverse existe depuis le lot 1 (section « Comprendre » d'`/outils`), mais pas celui-ci ; c'est un
sujet de maillage à lui seul, hors des sept appels à l'action visés ici.

---

## 14. Réalisation - lot 3 (24 octobre 2026)

### La liste des états des lieux rejoint les trois autres

`BarreListe` y est posée au-delà de six fiches, comme ailleurs, avec quatre tris (modification,
date du constat, logement, statut) et une recherche sur la référence, le nom du logement et le
sens du constat - « entree » trouve « Entrée », la recherche ignorant les accents.

Le filtre **brouillon / signé** est passé dans la barre plutôt qu'au-dessus : trois façons de
réduire une liste rangées à trois endroits auraient fait trois choses à chercher. `BarreListe`
accepte pour cela un emplacement `filtres`, à côté du tri. Deux conséquences :

- son compte-rendu suit désormais **tous** les filtres, pas seulement le mot-clé : une liste
  réduite par le seul filtre de statut ne passe plus pour la liste entière ;
- les deux listes déroulantes passent l'une sous l'autre en dessous de `sm:`, où elles ne
  tenaient pas côte à côte - « Modifié récemment » s'y affichait tronqué.

**Un état des lieux signé ouvre sa synthèse**, plus l'écran terrain. Celui-ci est verrouillé et
n'y proposait qu'un bandeau renvoyant vers la synthèse : un clic de plus sur l'écran dont il n'y
a plus rien à tirer, alors que le comparatif, les retenues et la lettre de restitution sont dans
l'autre.

### Documents : chercher, et ne plus mentir quand la liste est vide

Un champ texte sur la référence, le titre et le libellé de type, combinable avec les trois
listes déroulantes existantes.

Au passage, un défaut qui n'était pas dans l'audit : quand les filtres masquaient tout, la page
affichait « Aucun document - les PDF générés apparaîtront ici ». Elle promettait un écran qui ne
viendrait jamais, puisque les documents étaient là. Les deux cas sont maintenant distincts, et
celui du filtre propose de revenir à la liste entière.

### Tableau de bord

« Rédiger un bail » et « Faire un état des lieux » sont en entête dès qu'il existe un bien ;
« Nouveau bien » passe en `ghost`. Les trois s'empilent proprement à 390 px, dans cet ordre
d'importance. Jusqu'ici les deux actions qui font l'application n'étaient proposées que sur
l'écran **vide**.

### Le pli de la barre latérale ne se décide plus depuis un téléphone

`bailiz.navRepliee` se déduisait de `innerWidth < 1280` **et s'écrivait aussitôt**. Ouvrir Bailiz
une première fois sur le téléphone - 390 px, donc « plus étroit que 1280 » - figeait la barre en
icônes seules pour l'ordinateur, sans que rien ne l'explique. La valeur n'est plus ni calculée
ni écrite en dessous de 640 px, largeur en deçà de laquelle cette barre n'existe pas.

### Vérifications

**661 tests** (641 au lot 2), dont trois fichiers neufs : `EdlListePage.test.tsx` (9),
`DocumentsPage.test.tsx` (6), plus les raccourcis du tableau de bord et la mémorisation du pli.
0 erreur ESLint, build de l'application et du site. Rendu relu à 390 px et 1280 px sur les
quatre écrans touchés.

### Le lot 3 est clos

`/baux/rapide` avait été supprimée dès le lot 1. Les trois lots de l'audit sont réalisés ; le
critère 5 du §10 reste le seul non tenu, pour la raison donnée au §12.

---

## 15. Maillage guides → application (24 octobre 2026)

Annoncé au §13 comme restant à faire. Le diagnostic y était d'ailleurs **trop sévère** : les dix
guides menaient bien à un outil, par leur encart de fin et le champ obligatoire `outil` du
schéma. Mais `outil` désigne la **page qui décrit** l'outil, pas l'outil. On lisait donc un
article jusqu'au bout pour atterrir sur un argumentaire, et il fallait un clic de plus - et
comprendre qu'il en fallait un - pour faire ce que l'article venait d'expliquer.

### Ce qui a été fait

Deux champs obligatoires de plus au schéma de la collection, `app` et `appLibelle`, le premier
contraint à commencer par `/app/#/` : comme `outil`, ils sont imposés par le schéma plutôt que
laissés à la discipline de chaque fichier. L'encart de fin porte désormais deux sorties, l'outil
en bouton principal et la page de description en second.

| Guide | Écran visé |
|---|---|
| Bail meublé, colocation, diagnostics, encadrement, LMNP | `#/baux/nouveau` |
| État des lieux opposable, sortie sans litige | `#/edl/nouveau` |
| Grille de vétusté, pièces du dossier, retenues sur le dépôt | `#/outils` |

Trois guides nomment en outre un écran précis dans leur texte : ces mentions sont devenues des
liens profonds - `?ouvrir=bailleur` pour le SIRET du bailleur (LMNP), `?ouvrir=fiche-visite`
pour le modèle de fiche (pièces du dossier), `?ouvrir=vetuste` pour la grille (vétusté). Le test
de garde du lot 2 couvre maintenant les trois identifiants.

### Un effet de bord qu'il a fallu corriger

Placés côte à côte, les deux boutons disaient presque la même chose : « Imprimer ma grille de
vétusté » et « Générer ma grille de vétusté ». Les dix `outilLibelle` étaient écrits pour une
phrase à un seul lien et promettaient tous une action. Ils **nomment** désormais la page
(« La grille de vétusté en détail »), ce qui vaut aussi pour l'index des guides, où le libellé
suit la date de mise à jour.

### Ce qui n'a pas été touché

Les dates `misAJour`. Ajouter un lien n'est pas réviser un contenu juridique, et c'est cette
date qu'un lecteur regarde pour décider s'il peut faire confiance à la page ; la remonter pour
dix liens aurait été un faux signal, repris en `lastmod` dans le sitemap.

### Vérifications

Build Astro : 24 pages. **Les dix guides atteignent l'application**, trois d'entre eux par deux
chemins (lien profond dans le texte, action en fin d'article). Aucun lien interne cassé.
Encart et liens en contexte relus à 390 px. Côté application, 662 tests passent.
