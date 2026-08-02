# CDC — Comparaison photographique entrée / sortie (état des lieux)

> Complète `README.md` et `docs/DOCUMENTATION_TECHNIQUE.md`. Périmètre : le module EDL
> uniquement. Aucun changement du bail ni du modèle de sauvegarde.

## 1. Besoin

Aujourd'hui, l'état des lieux de sortie reprend **l'état d'entrée sous forme de texte**
(« Entrée : Bon »), mais jamais les **photos** prises à l'entrée. Deux conséquences :

1. **Sur le terrain**, impossible de comparer visuellement : on constate une rayure sans pouvoir
   vérifier si elle existait déjà. Le jugement se fait de mémoire.
2. **Dans le document**, une dégradation n'est pas *prouvée* : le PDF de sortie ne contient que
   les photos de sortie, en vrac. Sans le « avant », l'« après » ne démontre rien — or c'est
   précisément ce qui fonde une retenue sur le dépôt de garantie en cas de litige.

L'objectif est de rendre la comparaison **immédiate sur place** et **opposable dans le document**.

## 2. Ce qui existe déjà (à réutiliser, ne pas refaire)

| Brique | État |
|---|---|
| `ElementEDL.photoIdsEntree` | ✅ Rempli par `construirePiecesSortie` : les photos d'entrée sont déjà référencées par l'EDL de sortie |
| Photos en base | ✅ `db.photos` (Blob compressé 1600 px / JPEG 0,7), rattachées à l'EDL d'origine — non dupliquées |
| Synthèse comparative | ✅ `EdlSynthesePage` affiche déjà les vignettes entrée/sortie côte à côte, **pour les éléments dégradés** |
| Annexe photo du PDF | ⚠️ Existe, mais liste **toutes les photos en vrac**, sans distinction entrée/sortie |
| Chargement des photos du PDF | ❌ `chargerPhotosPourPdf` ignore `photoIdsEntree` : les photos d'entrée n'entrent jamais dans le PDF de sortie |
| Mode terrain | ❌ Aucun affichage des photos d'entrée |

**Conclusion** : le modèle de données est déjà prêt. Le travail porte sur l'**affichage terrain**
et le **rendu PDF**, pas sur la structure.

## 3. Décisions actées

- **Terrain** : vignette « Entrée » discrète à côté de chaque élément, **plein écran au tap**.
- **PDF** : comparaison avant/après **limitée aux éléments dégradés ou manquants**.
- **Cadrage assisté** (superposition de la photo d'entrée pendant la prise de vue) : **hors périmètre**.

## 4. Spécifications

### 4.1 Mode terrain — aperçu des photos d'entrée (EDL de sortie)

- Pour chaque élément disposant de `photoIdsEntree`, afficher une **vignette de référence**
  (~44 px, cible tactile conforme) libellée **« Entrée »**, distincte visuellement des photos de
  sortie (bordure ou fond neutre) pour qu'aucune confusion ne soit possible.
- S'il y a plusieurs photos d'entrée : afficher la première, avec un **compteur** (« +2 »).
- **Tap** → visionneuse plein écran : photo en grand, légende, date de prise de vue,
  **navigation entre les photos d'entrée** de cet élément, fermeture par bouton et par geste.
- Dans la visionneuse, si l'élément a **déjà des photos de sortie**, permettre de **basculer
  entrée ⇄ sortie** sur la même vue — c'est le geste qui rend la comparaison réellement utile.
- **EDL d'entrée** : rien ne change (aucune photo de référence à afficher).
- **Lecture seule** (EDL signé) : la visionneuse reste accessible.

### 4.2 PDF de sortie — preuve de la différence

- Nouvelle section, avant l'annexe photographique : **« Comparaison avant / après »**.
- Un bloc par élément `degradation === true` **ou** `manquant === true`, contenant :
  - pièce + nom de l'élément ;
  - **états** : « Entrée : Bon → Sortie : Mauvais » (ou « Manquant ») ;
  - **deux colonnes d'images** : *À l'entrée* / *À la sortie*, côte à côte, même largeur ;
  - légendes avec **date de prise de vue** de chaque cliché ;
  - commentaires d'entrée et de sortie s'ils existent.
- **Cas particuliers à traiter explicitement** (ne pas laisser une case vide) :
  - aucune photo d'entrée → mention « Aucune photo à l'entrée » ;
  - aucune photo de sortie → « Aucune photo à la sortie » ;
  - aucun élément dégradé → la section entière est **omise**.
- **Limite de volume** : au maximum **2 photos par côté et par élément** (les premières), afin de
  contenir le poids du PDF. Les clichés supplémentaires restent dans l'annexe photographique.
- L'annexe photographique existante est conservée, mais doit désormais **distinguer les photos
  d'entrée des photos de sortie** dans les légendes.

### 4.3 Chargement des photos

- `chargerPhotosPourPdf` doit inclure les `photoIdsEntree` des éléments concernés, en conservant
  l'information d'origine (entrée ou sortie) — aujourd'hui perdue.
- Les photos d'entrée sont lues depuis `db.photos` via leur id : **aucune duplication** de Blob.
- **Photo introuvable** (EDL d'entrée purgé, restauration partielle) : ne pas échouer — afficher
  « Photo non disponible » et poursuivre la génération.

## 5. Contraintes

- **Mémoire iPad** : chaque photo est convertie en data-URL (~+33 %). La limite de 2 photos par
  côté est le principal garde-fou ; charger les images **séquentiellement** (déjà le cas) et ne
  jamais charger les photos d'entrée hors des éléments dégradés.
- **Hors-ligne** : tout provient d'IndexedDB, aucune dépendance réseau.
- **RGPD** : la suppression d'un locataire (`lib/rgpd.ts`) efface les photos des EDL supprimés.
  Vérifier qu'un EDL de sortie conservé ne référence pas des photos d'entrée effacées → d'où le
  traitement « photo non disponible » ci-dessus.
- **Documents signés** : un EDL signé est verrouillé ; sa comparaison est figée dans le PDF déjà
  généré. Aucune régénération silencieuse.

## 6. Découpage

| Lot | Contenu | Vérification |
|---|---|---|
| **L1** | Visionneuse photo plein écran réutilisable (navigation, légende, date, fermeture) | Composant testé sur une liste de 1 et de 3 photos |
| **L2** | Vignette « Entrée » + bascule entrée/sortie dans le mode terrain de sortie | Parcours réel : élément avec 0, 1 et 2 photos d'entrée |
| **L3** | `chargerPhotosPourPdf` : inclusion des photos d'entrée + provenance | Test unitaire (photo manquante incluse) |
| **L4** | Section « Comparaison avant / après » du PDF + légendes de l'annexe | PDF rendu et **contrôlé visuellement** : dégradé avec/sans photo, aucun dégradé |

## 7. Critères d'acceptation

- [ ] Sur un EDL de sortie, chaque élément photographié à l'entrée affiche une vignette « Entrée ».
- [ ] Un tap ouvre la photo en plein écran ; on peut basculer entrée ⇄ sortie sans quitter la vue.
- [ ] Un élément sans photo d'entrée n'affiche aucune vignette (pas de cadre vide).
- [ ] Le PDF de sortie contient une section « Comparaison avant / après » listant **uniquement**
      les éléments dégradés ou manquants, avec les deux colonnes de photos et les dates.
- [ ] Un EDL de sortie sans dégradation ne contient pas cette section.
- [ ] Une photo d'entrée manquante en base n'empêche pas la génération du PDF.
- [ ] Le poids du PDF reste raisonnable : 5 dégradations × 2+2 photos restent générables sur iPad.
- [ ] `npm run lint`, `npm test` et `npm run build` sortent en code 0.

## 8. Hors périmètre

- Superposition de la photo d'entrée pendant la prise de vue (cadrage assisté).
- Détection automatique de différence entre deux images.
- Annotation des photos (flèches, cercles).
