# CDC - Accessibilité, premier contact et sobriété de l'interface

> Complète `README.md` et `docs/DOCUMENTATION_TECHNIQUE.md`. Périmètre : **rendre l'application
> utilisable par tous et lisible dès la première seconde**, sans toucher au métier. Aucun
> changement du schéma Dexie, du moteur PDF, des calculs de vétusté ni du protocole de
> synchronisation. Touche les primitives d'interface (`Modal`, `DateInput`, `Input`, `Toast`),
> la barre de navigation, la page Paramètres, l'écran terrain EDL, la palette, et une vingtaine
> de chaînes rédactionnelles.
>
> Issu de l'audit du 13/08/2026 : exploration live dans le navigateur (mesures DOM, styles
> calculés, calculs de contraste sur éléments rendus, tests clavier) et relecture de 23 fichiers
> `.tsx` applicatifs. Toutes les mesures citées ont été prises, pas estimées.

---

## 1. Besoin

L'application est soignée et le design system est réellement pensé : palette mesurée, neutres
tièdes, une seule couleur d'action, bordures plutôt qu'ombres, cibles tactiles de 44 px. Les
commentaires du code montrent des arbitrages justes, souvent nés d'incidents réels.

Trois constats ont pourtant émergé de l'audit.

**a) Les défauts d'accessibilité sont presque tous là où la charte a été contournée.** Ce ne sont
pas des oublis de principe mais des composants écrits à côté du système : `DateInput` ne consomme
pas `ChampContext` alors que `Input`, `Select` et `Textarea` le font ; `COULEURS_ETAT` utilise
`emerald` et `lime`, deux familles absentes de `tailwind.config.js` et donc jamais soumises à
l'audit de contraste documenté ; `border-accent-300` réapparaît là où la config écrit noir sur
blanc « Ne pas l'éclaircir ». C'est la meilleure dette possible : localisée et mécanique.

**b) L'application se présente par ses réserves, pas par sa valeur.** Le premier écran d'un
nouvel utilisateur est une modale d'avertissement juridique bloquante dont la dernière phrase
recommande un autre produit (prestataire eIDAS) pour la seule action qui compte. Derrière,
la barre latérale affiche déjà « Aucune sauvegarde » en ambre. Trois signaux d'inquiétude avant
le moindre bénéfice, alors que l'argument le plus fort du produit - *« aucune donnée n'est
transmise à un serveur »* - n'apparaît nulle part sur cet écran.

**c) L'écran terrain sur iPad est le moins accessible, alors que c'est là que ça compte le plus.**
L'état relevé (Neuf / Très bon / Bon / Usagé / Mauvais) est inaccessible **par les deux canaux à
la fois** : aucun `aria-pressed` pour un lecteur d'écran, et « Bon » sur `lime-500` donne 1,98:1
en texte blanc, illisible en plein jour dans un logement vide. C'est le geste central du produit.

**Objectif du lot** : atteindre la conformité AA sur les parcours réels, supprimer les impasses
clavier, et inverser l'ordre d'apparition entre la prudence juridique et la valeur d'usage.
**Aucune fonctionnalité nouvelle.**

---

## 2. Ce qui existe déjà (à réutiliser, ne pas refaire)

| Brique | État |
|---|---|
| Règle « un `Field`, un contrôle » | ✅ Tenue sur **158 usages sur 159**. Mécanisme par contexte (`Input.tsx:107-113`), volontairement sans compteur pour survivre à `StrictMode` - raisonnement juste, **ne pas le défaire** |
| `Field` relie `hint` et `error` | ✅ Un seul `id="{id}-aide"` rattaché par `aria-describedby` (`Input.tsx:115`, `:127`, `:132`) |
| `Checkbox` | ✅ `<label>` englobant, association implicite incassable, `min-h-touch`, `focus-visible` explicite. Aucune case sauvage dans le projet |
| `Button` | ✅ `min-h-touch` sur les **trois** tailles, y compris `size="sm"`. Anneau de focus explicite |
| `CarteRepliable` | ✅ Exemplaire : `aria-expanded` + `aria-controls` sur `useId`, chevron `aria-hidden`, contenu réellement démonté quand fermé |
| `NavLink` | ✅ Pose `aria-current="page"` automatiquement. **Ne pas remplacer par `Link` + classe conditionnelle** |
| `aria-pressed` | ✅ Déjà correct sur `EdlRapidePage.tsx:258`, `:318`, `:359` - le motif est connu du projet |
| `aria-label` des actions à icône seule | ✅ Large couverture : `Modal`, `BarreListe`, `VisionneusePhotos`, `AppLayout`, `EdlTerrainPage:531`, `:615`, `:625` |
| Toasts d'erreur persistants | ✅ Ne se ferment pas seuls (`Toast.tsx:35-37`), avec le bon motif commenté |
| Palette réellement mesurée | ✅ `accent-400` à 3,34:1 et `accent-500` à 4,65:1 sur blanc sont exacts. Badges et panneaux teintés tous au-dessus de 7:1 |
| Zoom / reflow | ✅ Ni `maximum-scale` ni `user-scalable=no`. Tout en `rem` sauf 2 cas. Aucun débordement horizontal à 320 px |
| Accordéon Paramètres | ✅ 11 cartes fermées = **1687 px mesurés, 2,3 écrans**. Le sujet a déjà été traité une fois (de 46 000 px à un écran et demi) |
| Zéro configuration requise | ✅ Aucun panneau de Paramètres n'est un prérequis. Défauts conformes livrés, bailleur recopié depuis le formulaire |
| Parcours de premier document | ✅ 5 clics, ~20 champs, aperçu PDF régénéré en direct, aucun détour par les Paramètres |
| `LimiteErreur` | ✅ Message en clair, rassure sur l'intégrité, propose une action, contraste conforme |
| `sr-only` | ⚠️ **Fourni par Tailwind en standard** (`corePlugins.js:669`, v3.4.19) mais **0 occurrence** dans le projet - d'où les informations portées par la couleur seule |
| `<fieldset>` / `<legend>` | ❌ 0 occurrence |
| `aria-required` / `required` natif | ❌ 0 occurrence, pour ~45 champs marqués d'un astérisque |
| Piège de focus des modales | ❌ Inexistant |
| Lien d'évitement | ❌ Inexistant |
| `eslint-plugin-jsx-a11y` | ❌ Absent de `eslint.config.js` - aucun garde-fou à l'écriture |
| `prefers-reduced-motion` | ❌ 0 occurrence (impact réel faible, cf. L6.4) |

**Conclusion** : les primitives sont bonnes. Le travail porte sur **trois fichiers déviants**,
**deux couleurs**, **l'ordre d'apparition** du premier contact, et **l'ajout de garde-fous** pour
que ces défauts ne reviennent pas.

---

## 3. Décisions actées

Les points 1, 5, 6, 7 et 8 résultent des arbitrages du 13/08/2026 (cf. §14).

1. **Aucune obligation légale de conformité.** Le RGAA vise le secteur public et la directive
   2019/882 ne s'applique pas ici. **WCAG 2.1 AA reste la cible**, mais comme critère de qualité
   et non de conformité : cela autorise à arbitrer au cas par cas quand le coût est
   disproportionné, ce qu'une obligation légale interdirait.
2. **Aucune régression visuelle acceptable.** Les correctifs de couleur doivent rester
   imperceptibles à l'oeil : on assombrit de quelques points, on ne change pas la charte.
3. **Les correctifs vont dans les primitives, pas dans les appelants.** Réparer `DateInput` et
   `Modal` corrige 6 libellés de date et 8 modales sans toucher un seul écran.
4. **Le contenu juridique n'est pas touché.** La verbosité qui explique une obligation légale
   (clause résolutoire, décence énergétique, art. 1731, délais de préavis) est du conseil utile,
   pas du remplissage. Seule la paraphrase de l'interface est coupée.
5. **Zéro duplication de code et de champs.** Principe directeur, qui prime sur le confort d'un
   parcours : on ne dédouble jamais un formulaire pour gagner des clics, et on ne corrige jamais
   un défaut à N endroits quand une primitive peut le porter. Ce principe **change l'approche**
   de L2.4 (rejeté), L6.1 (consolidation plutôt que rustines) et L6.6, et conforte la décision 3.
6. **La signature manuscrite ne sera pas rendue accessible au clavier** - c'est un acte graphique,
   et le signataire disposera toujours d'une souris ou d'un écran tactile. On se limite à **nommer
   la zone** pour les lecteurs d'écran. Pas d'alternative métier à développer.
7. **Les appareils anciens ne sont pas une contrainte.** S'ils dégradent, c'est acceptable. Les
   correctifs qui les concernent ne sont retenus que lorsqu'ils sont **gratuits** (une classe à
   ajouter), jamais au prix d'un repli spécifique.
8. **Aucune trace d'assistance par IA dans le produit.** Les crédits de méthode iront dans le
   `README.md` du dépôt, pas dans l'application (cf. L7.n).
9. **Hors périmètre** : refonte de la navigation en profondeur, suppression d'entrées de menu,
   onboarding guidé, changement de police, mode sombre.

---

## 4. Lot L0 - Contraste et retour à la charte

Coût très faible, aucun risque, gain immédiat. **À faire en premier.**

### L0.1 - `accent-500` sur le fond réel de la page

La palette documente *« 4,65:1 : le texte discret passe AA »*. C'est **exact sur blanc**, vérifié.
Mais `index.css:43` pose `body { @apply bg-accent-50 }` : le fond réel n'est pas blanc.

| Paire réelle | Ratio mesuré | AA (4,5:1) |
|---|---|---|
| `accent-500` sur blanc (ce que dit la config) | 4,65:1 | ✅ |
| `accent-500` sur `accent-50` = **fond de page** | **4,45:1** | ❌ |
| `accent-500` sur `accent-100` | **4,23:1** | ❌ |

116 usages concernés : tous les `hint` de `Field`, le pied de page, les résumés de cartes
repliables, les compteurs du mode terrain. L'audit de contraste lancé sur les éléments rendus du
formulaire de bail ne remonte **que 7 échecs, tous celui-ci, tous à 4,45 contre 4,50** - à 0,05
près. C'est propre, et ça se corrige en un point.

**Correctif** : `accent-500` `#78746D` → `#767268` (**4,594:1** sur `accent-50`, vérifié).
L'assombrissement est imperceptible. Alternative : réserver `accent-500` aux surfaces strictement
blanches et passer les textes discrets en `accent-600` (6,89:1).

Mettre à jour le commentaire de `tailwind.config.js:71-73` pour qu'il cite le fond réel et non le
blanc - c'est l'hypothèse implicite qui a créé le défaut.

### L0.2 - Bandeaux d'alerte : 3,42:1

`AppLayout.tsx:240`, `:281`, `:575` - `bg-amber-500 text-white text-xs font-medium` = **3,42:1**.
Ce sont les seuls canaux pour : modification écrasée par l'autre appareil, horloge décalée,
suppressions inhabituelles, autorisation Google expirée, mode hors-ligne. Le commentaire de
`:150-162` insiste à raison sur le fait que ces défaillances doivent se voir - elles sont
affichées dans la combinaison la moins lisible du produit.

Pire : les boutons d'action à l'intérieur (`bg-white/20` + texte blanc hérité) donnent un composité
`#C99843` et **2,61:1** pour « Reconnecter » (`:291`), « Réessayer » (`:310`), « Voir le détail »
(`:301`), « J'ai compris » (`:250`). Ce sont les seules issues de secours de la synchronisation.

**Correctif** : `bg-amber-600` (`#96630F`) = **5,136:1** avec du blanc (vérifié). Pour les boutons,
`bg-white text-warning-900` au lieu de `bg-white/20`.

### L0.3 - `COULEURS_ETAT` hors palette

`EdlTerrainPage.tsx:29-35`. `emerald` et `lime` ne sont pas remappés dans `tailwind.config.js`
(seuls `red`/`amber`/`green`/`sky` le sont, ligne 91) : ce sont les valeurs Tailwind par défaut,
non mesurées. Texte blanc en `text-xs font-semibold`, donc seuil AA = 4,5:1.

| État | Fond | Blanc sur fond | Verdict |
|---|---|---|---|
| Neuf | `emerald-600` `#059669` (hors palette) | 3,77:1 | ❌ |
| Très bon | `green-500` = `success-500` | 4,29:1 | ❌ |
| **Bon** | `lime-500` `#84CC16` (hors palette) | **1,98:1** | ❌ grave |
| Usagé | `amber-500` = `warning-500` | 3,42:1 | ❌ |
| Mauvais | `red-500` = `danger-500` | 4,55:1 | ✅ de justesse |

Le même barème sert au rappel « État à l'entrée » (`:576`, `text-sm font-bold`, donc hors « grand
texte » : 14 px gras < 18,66 px).

**Correctif** : cinq couleurs distinguables et conformes sont atteignables dans les familles déjà
**Rampe retenue** (arbitrée, cf. §14 Q3). Seules les nuances 600 à 800 des familles mesurées
passent 4,5:1 avec du texte blanc - `success-500` échoue à 4,29 et `warning-500` à 3,42, ce qui
exclut les teintes claires. La rampe suit donc la **convention de l'étiquette DPE**, que le public
français connaît déjà : trois verts pour les trois états positifs, ambre pour l'usure, rouge pour
le défaut.

| État | Actuel | Retenu | Blanc sur fond |
|---|---|---|---|
| Neuf | `emerald-600` (hors palette) | **`success-800`** `#1D4420` | 11,05:1 |
| Très bon | `green-500` | **`success-700`** `#245628` | 8,62:1 |
| Bon | `lime-500` (**1,98:1**) | **`success-600`** `#2C6E32` | 6,21:1 |
| Usagé | `amber-500` | **`warning-600`** `#96630F` | 5,14:1 |
| Mauvais | `red-500` | **`danger-600`** `#B03728` | 6,13:1 |

Tout est pris dans les familles déjà mesurées : plus aucune couleur hors palette, et le pire cas
passe de 1,98:1 à 5,14:1.

**Sur la distinguabilité**, qui était la réserve de départ : le contraste entre paliers voisins est
faible (1,19 à 1,39). C'est sans conséquence ici, pour deux raisons vérifiées dans le code :
`EdlTerrainPage.tsx:598-601` ne colore que le bouton **sélectionné**, les quatre autres restant
`bg-white` - l'utilisateur n'a donc jamais cinq aplats saturés à comparer ; et le libellé texte est
toujours affiché, sur les boutons comme sur le badge de rappel (`:572`), donc la couleur n'est
jamais seule porteuse de l'information (WCAG 1.4.1 satisfait). Aucune forme ni icône à ajouter.

À traiter dans la même passe : `COULEURS_ETAT` pose aussi `border-*`, à aligner sur la même valeur.
Vérifier le rendu du badge `:572` (`text-sm font-bold uppercase`, 14 px : seuil 4,5:1, pas 3:1).

### L0.4 - `border-accent-300` : la régression que la charte interdit

`tailwind.config.js:68-70` : *« 3,05:1 sur blanc : c'est la teinte des bordures de champs, et ce
seuil est celui qu'exige WCAG 1.4.11. Ne pas l'éclaircir. »*

- `DateInput.tsx:63` utilise `border-accent-300` = **1,51:1** sur blanc, exactement le défaut
  reproché à l'ancienne palette slate-300 en ligne 24.
- `Button.tsx:15` variant `secondary` : idem. Le bouton « Annuler » de chaque `ConfirmModal` n'a
  pas de contour perceptible.
- `DateInput.tsx:60` : `placeholder:text-accent-400` = 3,34:1, échec pour du texte, alors que
  `Input.tsx:21` utilise correctement `accent-500`.

**Correctif** : `border-accent-400` dans les deux fichiers, placeholder aligné sur `accent-500`.

---

## 5. Lot L1 - Les trois fichiers bloquants

### L1.1 - `DateInput` : 6 libellés de date sur 7 ne sont reliés à rien

`DateInput.tsx:11-23` (signature) et `:50` (l'`<input type="text">`). Le composant **ne consomme
pas `ChampContext`** et ne pose jamais d'`id`. Utilisé comme unique enfant d'un `Field`, qui émet
`<label htmlFor={id}>` vers un élément inexistant.

Prouvé en live sur le formulaire de bail :
```
labelsOrphelins: ['[for=":r1n:"] sans cible : Date de prise d\'effet*',
                  '[for=":r3h:"] sans cible : Date de naissance']
champsSansNomAccessible: 4
```

| `Field` | `DateInput` | `aria-label` de secours ? |
|---|---|---|
| `BailRapidePage.tsx:606` | `:607` | non - **date de prise d'effet du bail** |
| `BienFormPage.tsx:730` | `:731` | non |
| `FicheVisiteModal.tsx:108` | `:109` | non |
| `EdlRapidePage.tsx:389` | `:390` | non |
| `EdlRapidePage.tsx:484` | `:485` | non |
| `EdlTerrainPage.tsx:747` | `:748` | non |
| `LocataireFormModal.tsx:138` | `:143` | oui (seul cas sauvé) |

Un lecteur d'écran annonce « zone de saisie, JJ/MM/AAAA » sans dire de quelle date il s'agit. Sur
`BailRapidePage:606` c'est la date qui fonde tous les calculs de terme et de révision. Le `hint`
n'est pas rattaché non plus (`aria-describedby` perdu pour les 7). Et taper sur le libellé ne donne
pas le focus, ce qui est pénible au doigt.

**Correctif** : faire consommer `ChampContext` à `DateInput` comme `Input.tsx:45-51`, en posant
`id` et `aria-describedby` sur l'`<input type="text">` de la ligne 50. Environ 3 lignes, 6 cas
réparés, et les `aria-label` des appelants deviennent inutiles.
Ajouter aussi le rattachement du message « Date invalide » (`:87-91`), aujourd'hui ni dans une
région live ni relié par `aria-describedby`, alors que `aria-invalid` est correctement posé (`:57`).

### L1.2 - `Modal` : aucun piège de focus, et un `aria-modal` mensonger

Mesuré en live à l'ouverture d'une modale de l'application :
```
focusApresOuverture: "BODY"        nbFocusablesDansModale: 15
focusEstDansLaModale: false        nbFocusablesEncoreAccessiblesDerriere: 95
ariaModal: "true"                  bodyScrollBloque: "visible"
```

`aria-modal="true"` annonce aux technologies d'assistance que le reste de la page est inaccessible.
**C'est faux : 95 éléments restent atteignables au Tab.** Cette incohérence est pire que pas
d'`aria-modal` du tout : l'utilisateur tabule dans un contenu que son outil prétend inexistant.

Ce qui existe déjà et qu'il faut garder : `role="dialog"`, `aria-label={title}`, `<h2>` de titre,
fermeture par Échap (`:22`, écouteur sur `window` - **vérifié fonctionnel**), bouton Fermer 44×44
avec `aria-label`.

Ce qui manque : focus initial dans la modale, confinement du Tab, restauration du focus à la
fermeture, blocage du défilement de l'arrière-plan.

**Correctif** : mémoriser `document.activeElement` à l'ouverture, poser le focus sur le conteneur
(`tabIndex={-1}` + `ref.focus()`), intercepter Tab / Shift+Tab pour boucler, restaurer au
démontage, et `overflow: hidden` sur le `body` pendant l'affichage. Un fichier, **8 modales
réparées** : `DisclaimerPremiereUtilisation`, les 4 de `EdlTerrainPage`, `LocataireFormModal`,
`BienRapideModal`, `FicheVisiteModal`, `ConfirmModal`.

### L1.3 - La croix morte du disclaimer

`AppLayout.tsx:322-343`. `DisclaimerPremiereUtilisation` passe `onClose={() => {}}`. La `Modal`
rend malgré tout son bouton « Fermer » et écoute Échap. Test live : **clic sur la croix puis Échap,
la modale ne bouge pas.**

C'est une commande visible qui ne fait rien - exactement ce que les commentaires du projet
reprochent ailleurs (*« un bouton qui ne fait rien »*, `AppLayout.tsx:193`).

**Correctif** : ajouter un prop `fermable?: boolean` à `Modal` (défaut `true`) qui masque la croix
et désarme Échap quand il vaut `false`. Traité conjointement avec L2.1, qui peut rendre la question
sans objet.

### L1.4 - `EdlTerrainPage` : l'état relevé n'est pas exposé

`:589-608` (état de sortie) et `:551-570` (report de l'entrée). Les 5 boutons indiquent la
sélection uniquement par `${COULEURS_ETAT[etat]} text-white shadow` (`:600`). **Aucun
`aria-pressed`, aucun `aria-checked`.** Pour un lecteur d'écran les 5 boutons sont identiques quel
que soit l'état saisi : impossible de savoir ce qui a été relevé, impossible de relire un constat.
Combiné à L0.3, l'information devient inaccessible par les deux canaux.

**Correctif** : `aria-pressed={actif}` sur `:593` et `:555`. Idéalement `role="radiogroup"` +
`aria-label={`État de ${el.nom}`}` sur la grille, l'état étant exclusif.

### L1.5 - `EdlTerrainPage` : autres correctifs du même fichier

À traiter dans la même passe, c'est l'écran où l'accessibilité compte le plus dans ce produit :

| Réf | Ligne | Problème | Correctif |
|---|---|---|---|
| a | `:469` | Second `<main>` imbriqué dans celui de `AppLayout.tsx:572` (idem `<footer>` `:871` et `<header>` `:314`). HTML invalide, deux régions « principal » annoncées | `<div>` |
| b | `:361-391` | Onglets de pièces : l'actif ne se distingue que par la couleur, aucun `aria-current`. Icône `Check` de complétion sans équivalent textuel | `aria-current` + complétion dans l'`aria-label` |
| c | `:651-660` | Commentaire de chaque élément : `placeholder` seul, aucun libellé. Disparaît à la saisie. Des dizaines par EDL | `aria-label={`Commentaire sur ${el.nom}`}` |
| d | `:710-715` | Nom du nouvel élément : `placeholder` seul, alors que le `Select` voisin `:716` a bien un `aria-label` | `aria-label` |
| e | `:856` | Seul titre du fichier : un `h3`. **L'écran principal de travail n'a ni `h1` ni `h2`** | `h1` sur la référence (`:323`) |
| f | `:822-853` | `<Field label="Rattacher à un bail">` dont l'enfant est conditionnel : dans la branche vide, `htmlFor` pointe dans le vide. **Seul cas structurel sur 159**, et contredit le commentaire de `BienFormPage.tsx:247-249` | Sortir le cas vide du `Field` |
| g | `:357-359` | Barre de progression sans `role="progressbar"`. Atténué : l'info est redondée en texte (`:336`) | `role="progressbar"` ou `aria-hidden` |

---

## 6. Lot L2 - Premier contact

### L2.1 - Déplacer ou dégonfler l'avertissement juridique

Séquence exacte mesurée à la première ouverture :

| Ordre | Ce qui se passe | Fichier:ligne |
|---|---|---|
| 1 | `navigator.storage.persist()` - peut déclencher une invite navigateur | `main.tsx:31-33` |
| 2 | `getParametres()` crée la ligne, ce qui déclenche le disclaimer | `AppLayout.tsx:378-381` |
| 3 | **Modale « Avertissement », bloquante, 4 phrases, ~330 caractères** | `:322-343` |
| 4 | Derrière : « Aucune sauvegarde » en ambre + « Stockage persistant / non garanti » | `:92`, `:553-563` |
| 5 | Après « J'ai compris » : état vide du tableau de bord, 2 boutons | `TableauDeBordPage.tsx:168-186` |

La dernière phrase du tout premier contenu affiché recommande **un autre produit** pour la seule
action qui compte. L'utilisateur n'a vu ni un écran ni un document, et on lui parle d'eIDAS.

Deux problèmes distincts : **le moment** (l'avertissement porte sur un document qui n'existe pas
encore) et **le contenu manquant** (l'argument « vos données restent chez vous » est absent de
l'écran d'accueil alors qu'il est le meilleur du produit).

**Option retenue : (b)** - la modale reste à l'ouverture, réduite à une phrase, avec l'argument
absent. Le moment n'est pas déplacé, seul le contenu change.

Nouveau texte de `DISCLAIMER_JURIDIQUE` (`AppLayout.tsx:320`), à substituer aux 4 phrases actuelles
pour l'usage **modale** :

> Aide à la rédaction, pas un conseil juridique. Vos données restent sur votre appareil et ne sont
> transmises à personne.

Conséquences à traiter dans la même passe :

- La constante est aussi consommée par `ParametresPage.tsx:338` (panneau « Avertissement
  juridique ») et par la vitrine. **Le texte long doit y rester intégralement** : vérification des
  évolutions sur service-public.fr et recommandation eIDAS. Il faut donc **deux constantes**
  (`DISCLAIMER_COURT` pour la modale, `DISCLAIMER_JURIDIQUE` inchangé pour les Paramètres) plutôt
  qu'une modification en place - sinon on ampute la mention de fond.
- Le passage sur eIDAS quitte le premier écran. Sa place naturelle est **l'écran de signature**
  (`EdlSignaturePage` / `SignatureFlow`), où il a un objet.
- La croix morte (L1.3) reste à corriger : la modale conserve son caractère bloquant.

### L2.2 - Retirer les indicateurs techniques de la barre latérale

`AppLayout.tsx:547-569`. Au premier lancement, un utilisateur qui n'a **rien à perdre** lit
« Aucune sauvegarde » en ambre. Et la même information est rediffusée dans le tableau de bord
(`TableauDeBordPage.tsx:97-106`) et dans les Paramètres (`ParametresPage.tsx:149-163`) : **trois
emplacements pour un fait.**

« Stockage persistant » en vert n'apprend rien à un non-technicien ; « non garanti » en ambre
l'inquiète sans lui donner d'action.

**Correctif** : supprimer le bloc de la barre, ou le conditionner à l'existence d'au moins une
donnée. À défaut, ne jamais afficher l'état vert : un indicateur qui ne dit rien quand tout va bien
ne devrait apparaître qu'en panne.

### L2.3 - Exposer la démonstration qui existe déjà

`FicheVisitePanel.tsx:118-133` produit **déjà** un PDF d'aperçu complet à partir de `bienExemple()`
(`:54-82`, un T2 fictif de 42 m² à Chamalières). Il est enterré au panneau 7 sur 11 des Paramètres,
replié.

Aujourd'hui l'utilisateur doit saisir ~20 champs avant de pouvoir juger la qualité du document
produit. **Il paie d'abord et voit ensuite.**

**Correctif** : un troisième bouton discret dans l'état vide du tableau de bord
(`TableauDeBordPage.tsx:172-185`) : « Voir un exemple de bail (PDF) », sur le modèle existant.
Coût faible, effet direct sur la décision d'adoption.

### L2.4 - Le détour par la modale locataire - REJETÉ

Constat conservé pour mémoire : les clics 3 et 4 sur 5 du parcours servent à ouvrir et fermer une
modale pour 4 champs, alors que bailleur et logement se saisissent inline.

**Décision : ne pas inliner le locataire** (décision actée n°5, zéro duplication). `LocataireFormModal`
est la **source unique** des champs locataire, partagée entre la page Locataires et le formulaire de
bail ; son commentaire (`:48-52`) documente ce choix : *« une seule source de champs, donc aucune
divergence de données entre les deux points d'entrée »*. Inliner reviendrait à écrire une seconde
fois les mêmes 10 champs, leur schéma Zod et leur logique de garant - exactement ce que le principe
interdit, pour économiser deux clics.

**Ce qui est fait à la place** : le confort d'usage de cette modale est traité **dans la primitive**,
donc au bénéfice des 8 modales à la fois - focus initial et confinement (L1.2), validation par
Entrée (L5.8). Le détour subsiste mais cesse d'être une friction.

---

## 7. Lot L3 - Page Paramètres

Le constat est contre-intuitif et joue en faveur de l'existant : **la page est bien plus petite
qu'elle n'en a l'air** (1687 px mesurés toutes cartes fermées, 2,3 écrans) et **il faut configurer
exactement zéro chose** avant de produire son premier document. Le problème n'est pas le volume,
c'est que la page ne le dit jamais.

Sur 11 cartes, un bailleur mono-logement en comprend 3 (Bailleur, Sauvegarde, RGPD). Les 8 autres
lui suggèrent du travail à faire là où il n'y en a aucun.

### L3.1 - Dire que rien n'est requis

Une ligne sous le titre `ParametresPage.tsx:130` : *« Tout est déjà configuré. Vous pouvez rédiger
un bail sans rien remplir ici. »* C'est l'information la plus utile de la page et elle est absente.

### L3.2 - Grouper les 11 cartes en 3 sections titrées

Onze cartes visuellement identiques dans une pile plate, aucun titre de section, aucun groupement.
Trois `<h2>` transforment 11 décisions en 3 :

```
Vos informations
   Bailleur
Vos modèles de documents        [pré-remplis, conformes - rien à faire]
   Clauses du bail · Fiche de visite · Grille de vétusté · Fiche d'aide juridique
Sauvegarde et sécurité
   Sauvegarde et restauration · Dossier synchronisé · Google Drive
   Vérifier une empreinte · Données personnelles · Avertissement juridique
```

Bénéfice secondaire : cela remonte les modèles au-dessus de la plomberie. Aujourd'hui les positions
2, 3 et 4 sont **trois panneaux de sauvegarde consécutifs** juste sous le seul réglage utile, pour
1 champ au total ; il faut passer 6 cartes sur 11 avant d'atteindre quelque chose qui concerne
l'utilisateur.

Résout aussi un défaut de structure : les titres de `CarteRepliable` sont des `<span>`
(`CarteRepliable.tsx:75-78`), donc les sections de la page la plus longue du produit sont absentes
de la table des titres.

### L3.3 - Retirer l'ambre du résumé Google Drive

`SauvegardeAutoPanels.tsx:312-314` : *« Non connecté - les appareils n'échangent rien »*, en ambre.
Pour un bailleur mono-logement sur un seul ordinateur, c'est **une alerte permanente qu'il ne peut
éteindre qu'en connectant un compte Google**. C'est le plus mauvais signal de la page.

**Correctif** : `resumeAlerte` à `false`, et libellé *« Facultatif - pour travailler sur deux
appareils »*.

### L3.4 - Reformuler les résumés en état, pas en inventaire

- Clauses : *« Textes standard du bail - conformes, rien à faire »* plutôt que *« 25 clauses ·
  18 proposées par défaut »*, qui se lit « 25 choses à examiner ».
- Grille de vétusté : *« Barème par défaut (12 postes) - conforme »*.

### L3.5 - Remonter le texte qui désamorce

Le texte qui rassure sur la grille (*« générée automatiquement comme annexe à chaque création de
bail »*) est en `ParametresPage.tsx:279-282`, **après** 48 champs et 3 boutons. Le remonter avant
le tableau, en une ligne. Idem pour les clauses (`ClausesBailPanel.tsx:167`).

### L3.6 - Libellés de la grille de vétusté

`ParametresPage.tsx:205-257`. Le tableau a bien un `<thead>` et un conteneur `overflow-x-auto`
(bon point, c'est le seul `<table>` de l'application). Mais les `Input` des cellules (`:220`,
`:229`) n'ont **ni `id`, ni `aria-label`, ni `<label>`** : aucun lien avec l'en-tête de colonne.
Avec 12 lignes, ce sont **48 champs indistinguables** annoncés « zone de saisie, 10 ». Les 12
boutons de suppression portent tous `aria-label="Supprimer"` sans dire quoi.

**Correctif** : `scope="col"` sur les `<th>`, `aria-label` explicite par cellule (« Durée de vie du
poste Peinture, en années »), `aria-label={`Supprimer le poste ${l.poste}`}`.

---

## 8. Lot L4 - Navigation

**7 entrées n'est pas un problème** (norme 5-9), les icônes sont distinctes, l'état actif est net,
`aria-current` est automatique. Le défaut n'est pas le nombre mais l'accrétion et le tactile.

### L4.1 - Sur tablette, 7 icônes muettes

Mesures live :

| Largeur | Comportement |
|---|---|
| 1024 px (iPad paysage) | Replié par défaut (`< 1280px`, `AppLayout.tsx:447`), **icônes seules, 47×44 px** |
| 768 px (iPad portrait) | Idem, aucun libellé |
| 375 px (iPhone SE) | Barre basse, libellés masqués (`max-[380px]:hidden`, `:528`), onglets **36 px de large** |

Le seul secours est l'attribut `title` (`:513`), **qui ne s'affiche jamais au tactile**.
L'utilisateur doit distinguer `Building2` (Biens), `FileText` (Baux), `ClipboardList` (EDL) et
`FolderOpen` (Documents) au pictogramme seul, sur l'appareil qui est la cible principale du produit.

**Correctif** : en barre repliée, afficher le libellé sous l'icône (la barre basse mobile le fait
déjà) plutôt que rien. C'est le cas iPad, qui reste la cible principale et **n'est pas concerné par
la décision n°7** : 768 et 1024 px sont des largeurs d'appareils courants, pas d'appareils anciens.

Le cas 375 px (iPhone SE) relève en revanche de la décision n°7 : le seuil `max-[380px]` prive les
iPhone SE tout en servant les iPhone 14 (390 px), ce qui est arbitraire, mais **la correction n'est
retenue que parce qu'elle est gratuite** (supprimer ou abaisser une classe). Aucun repli spécifique
ne sera développé pour ces appareils.

### L4.2 - Cibles tactiles en largeur

`tailwind.config.js:113-114` définit `min-h-touch` **et** `min-w-touch`. Comptage :
`min-h-touch` **28 usages**, `min-w-touch` **4 usages** (uniquement `PhotoCapture` et
`VisionneusePhotos`). La largeur n'est donc pas contrainte : les onglets mobiles tombent à 36 px.

**Correctif** : `min-w-touch` sur les onglets de navigation et sur toute commande à icône seule.

### L4.3 - Donner deux verbes à la navigation

5 des 7 entrées sont des noms de tables. Or l'écran d'accueil dit l'inverse - *« Commencez par le
document dont vous avez besoin »* → « **Rédiger un bail** » / « **Faire un état des lieux** » - et
le commentaire de `TableauDeBordPage.tsx:162-167` assume ce parti : *« L'entrée se fait donc par le
document et non par la fiche du logement »*.

**Le premier écran parle tâches, la barre permanente parle tables.** Et ces deux actions ne sont
accessibles que depuis le tableau de bord vide, ou en 2 clics via « Baux » puis « Nouveau bail ».

**Correctif** : les ajouter en tête de barre, séparées par un filet.

### L4.4 - Grouper visuellement les 7 entrées

Trois groupes séparés par un filet dans `nav.map` (`AppLayout.tsx:508`) : Tableau de bord / les
quatre dossiers / Documents + Paramètres. Aucun retrait d'entrée, lecture plus simple.

### L4.5 - Filtres de Documents : appliquer la règle maison

`DocumentsPage.tsx:34-67` affiche **3 filtres inconditionnellement** (Bien, Bail, Type). Pour un
bailleur mono-logement, ils portent sur 4 à 6 PDF, dont un filtre « Bien » à une seule valeur.

Le projet a déjà une convention pour ça : `SEUIL_BARRE_LISTE = 6` (`BarreListe.tsx:15`), au-delà
duquel les autres listes affichent leur barre de recherche. **`DocumentsPage` n'importe pas cette
constante.**

**Correctif** : masquer les filtres sous 6 documents, aligné sur la convention existante.

---

## 9. Lot L5 - Sémantique et annonces

### L5.1 - `aria-required` et `aria-invalid`

`Input.tsx:93-138`. Le prop `required` du `Field` ne produit qu'un **astérisque rouge décoratif**
(`:123`), sans texte alternatif et sans `required`/`aria-required` sur le contrôle. Le prop `error`
rend bien un message rattaché par `aria-describedby` - c'est bien fait - mais ne pose pas
`aria-invalid`.

Comptage : `aria-required` **0**, `required` natif **0**, `aria-invalid` **1** (`DateInput.tsx:57`).
Test live sur la modale locataire : `champsAvecRequired: 0` sur 10.

Un lecteur d'écran ne dit pas « obligatoire » sur les ~45 champs concernés, dont les 17 du
formulaire de bail. L'astérisque seul est aussi une information par la couleur uniquement.

**Correctif** : ajouter `required` et `aria-invalid` au `ChampContext`, les consommer dans
`useLiaisonChamp`, et adjoindre `<span className="sr-only"> (obligatoire)</span>` à l'astérisque.

**Bon point à conserver** : la validation déplace correctement le focus sur le premier champ
invalide (react-hook-form), et les 4 messages d'erreur testés étaient bien rattachés. Le mécanisme
fonctionne, il manque deux attributs.

### L5.2 - Toasts : la région live naît avec le message

`Toast.tsx:45-51`. Le conteneur permanent (`:45`) ne porte ni `role` ni `aria-live` ; c'est chaque
toast (`:47`) qui arrive dans le DOM **déjà porteur** de `role="status"`. NVDA et VoiceOver
n'annoncent de façon fiable que les mutations d'une région live **préexistante** : l'annonce est
manquée dans une bonne partie des cas.

Ce canal porte des informations indevinables : « Sauvegarde poussée vers la destination configurée »,
« Synchronisation interrompue par une vérification de sécurité », « Impossible d'enregistrer la
photo », « État des lieux rouvert pour rectification ».

**Correctif** : déplacer `role="status" aria-live="polite"` sur le conteneur permanent `:45`, garder
`role="alert"` pour le type `error`. Porter la durée de 5 s à 8-10 s pour les messages longs (celui
de `AppLayout.tsx:117` fait 26 mots). Donner `min-h-touch min-w-touch` au bouton de fermeture,
aujourd'hui ~22×22 px.

### L5.3 - Bandeaux contextuels non annoncés

Ils apparaissent dynamiquement sans région live, donc silencieusement :
`EdlTerrainPage.tsx:400-407` (aucun EDL d'entrée - conséquence juridique directe sur la retenue du
dépôt), `:408-415`, `:417-448`, `:450-467` ; `EdlSignaturePage.tsx:202-227` (éléments non
renseignés, juste avant signature) ; `AppLayout.tsx:240`, `:261`, `:280`.

**Correctif** : `role="status"`, ou `role="alert"` pour ce qui bloque.
**Bon point** : `BarreListe.tsx:101` a déjà `role="status"` sur son compte-rendu de filtrage.

### L5.4 - `<fieldset>` / `<legend>` : 0 occurrence

- `EdlRapidePage.tsx:437-463` : groupe de 3 radios (`name="origineEtatEntree"`). Chaque radio est
  bien dans son `<label>` - correct - mais la **question** n'est portée par aucun `<legend>`.
  L'utilisateur entend « Il existe, sur papier » sans savoir de quoi il s'agit, et ce choix
  détermine si les dégradations pourront être calculées.
- Groupes de cases liées : `BienFormPage.tsx:589-628` (« Diagnostics dus »), `:517-543`.

### L5.5 - Signature manuscrite : nommer l'impasse

`SignatureFlow.tsx:170-173`. Le `<canvas>` n'a ni `role`, ni `aria-label`, ni `tabIndex` : absent
de l'arbre d'accessibilité. Le bouton de validation est désactivé tant que `aDessine` est faux
(`:181`), et `aDessine` ne passe à vrai que par un tracé au pointeur (`:52-55`).

**Un utilisateur au clavier ne peut pas terminer un état des lieux**, et n'a aucun moyen de
comprendre pourquoi le bouton reste grisé - il ne « voit » même pas le canvas.

Le reste du parcours est soigné (nom tapé dans un vrai champ, case « Lu et approuvé », horodatage
annoncé en clair, relecture obligatoire) : c'est l'exposition technique qui manque.

**Correctif minimal** : `role="img"` + `aria-label="Zone de signature - tracez votre signature au
doigt ou au stylet"`.

**Périmètre arrêté** (décision actée n°6) : on **s'arrête là**. Le signataire disposera toujours
d'une souris ou d'un écran tactile, et une signature manuscrite est un acte graphique par nature.
L'alternative « signature recueillie par un tiers » envisagée initialement est **écartée** : elle
relèverait d'une décision métier (valeur juridique, mention portée au document), pas de ce lot.

Reste utile malgré tout : le libellé visuel « Signature au doigt ou au stylet » est un `<span>` non
relié (`:158`). Le rattacher par `aria-describedby` coûte une ligne et rend l'obstacle explicite
plutôt que silencieux.

### L5.6 - Lien d'évitement

0 occurrence de `sr-only` / « aller au contenu ». La barre latérale précède `<main>` : **9
tabulations mesurées** avant le contenu, sur chaque page, répétées à chaque navigation.

**Correctif** : `<a href="#contenu" className="sr-only focus:not-sr-only ...">Aller au contenu</a>`
en tête du `<div>` de `AppLayout.tsx:469`, et `id="contenu"` sur le `<main>` de `:572`.
**Note** : `sr-only` et `not-sr-only` sont des utilitaires **Tailwind standard** (vérifié :
`corePlugins.js:669`, v3.4.19). Aucun plugin à ajouter.

### L5.7 - Hiérarchie des titres

`PageHeader` produit un `h1` unique sur 15 pages - c'est bon. Les sauts :

| Écran | Problème |
|---|---|
| `EdlTerrainPage` | **Aucun `h1` ni `h2`** (cf. L1.5e) |
| `EdlSignaturePage` | `h1` seulement dans la branche « signé » (`:139`) ; la branche de signature enchaîne des `h3` sans `h2` |
| `ParametresPage` | Titres de cartes en `<span>` (résolu par L3.2) |
| `EmptyState` | `h3` (`Layout.tsx:50`) après un `h1` : saut systématique |
| Cartes de liste | `h3` (`BiensPage.tsx:132`, `LocatairesPage.tsx:177`) |
| `ClausesSelecteur.tsx:71` | `h4` après un `h2` |

**Correctif** : `h2` pour `EmptyState` et les cartes de liste, `h3` au lieu de `h4` dans
`ClausesSelecteur`, `h2` dans `CarteRepliable` autour du bouton.

### L5.8 - La touche Entrée ne valide aucun formulaire de l'application

`LocataireFormModal.tsx:122` est le **seul `<form onSubmit>` de tout le projet**. Or son bouton de
validation (`:118`) est passé dans le prop `footer` de la `Modal`, donc rendu **hors** du `<form>`
(`Modal.tsx:47`), et `Button` a `type="button"` par défaut (`Button.tsx:32`). Il n'existe donc aucun
`type="submit"` à l'intérieur du formulaire : `onSubmit` ne peut pas se déclencher, et Entrée dans
un champ ne valide pas.

Ailleurs, tous les écrans de saisie sont des `<div>` avec `onClick` : **le comportement attendu d'un
formulaire est absent de l'ensemble du produit**. Un utilisateur clavier doit tabuler jusqu'au pied
de la modale à chaque enregistrement.

**Correctif** (dans la primitive, cf. décision 5) : donner un `id` au `<form>` et poser
`form="{id}"` sur le bouton du footer, ou faire porter par `Modal` un prop `onValider` qui rende un
`<button type="submit">`. Un seul point de correction, valable pour toute modale de saisie future.

---

## 10. Lot L6 - Cibles tactiles et confort

### L6.1 - Commandes sous 44 px

`Button` est conforme sur ses trois tailles. Tous les manquements sont des `<button>` écrits à la
main :

| Fichier:ligne | Élément | Taille |
|---|---|---|
| `EdlTerrainPage.tsx:529-536` | **Supprimer un élément** (`Trash2` nu) | **~15×15 px** |
| `PhotoCapture.tsx:97-104` | **Supprimer une photo** (`h-5 w-5`) | **20×20 px** |
| `EdlTerrainPage.tsx:612-630` | Quantité − / + | 32×32 px |
| `EdlTerrainPage.tsx:516-526` | Bascule « Manquant » / « Rétablir » | ~26 px de haut |
| `EdlTerrainPage.tsx:327-333` | « N élément(s) non renseigné(s) » | ~16 px de haut |
| `Toast.tsx:54-61` | Fermer un toast | ~22×22 px |
| `BarreListe.tsx:72-79` | Effacer la recherche | 32×32 px |
| `EdlRapidePage.tsx:315-368` | Puces de pièces / locataires | ~30 / ~34 px |
| `AppLayout.tsx:359-369` | « Installer et recharger » | ~28 px de haut |

Les deux premières sont les plus graves : **des actions destructrices sans confirmation, sur une
cible de 15 à 20 px, au doigt, dans un logement.** Le geste échoue, ou supprime le voisin.

**Approche retenue : consolider, pas rustiner** (décision actée n°5). Le dénombrement explique
pourquoi : le projet compte **46 `<button>` écrits à la main** hors tests, contre un composant
`Button` déjà conforme sur ses trois tailles. Ajouter `min-h-touch min-w-touch` aux 9 lignes du
tableau corrigerait le symptôme et laisserait 37 boutons libres de reproduire le défaut, plus tous
ceux à venir.

Le correctif durable est donc en deux temps :

1. **Ajouter à `Button` une taille `icon`** (carré 44×44, centrage, `aria-label` obligatoire par le
   typage) - elle n'existe pas aujourd'hui, ce qui est précisément la raison pour laquelle ces
   boutons ont été écrits à la main.
2. **Router les 9 commandes du tableau vers `Button`**, en commençant par les deux actions
   destructrices. Les 37 autres suivent au fil des passages, sans lot dédié.

Cas particulier : pour les croix de suppression de photos, préférer une zone tactile élargie
(`p-2 -m-2`) à un agrandissement visuel, pour ne pas alourdir la vignette.

Bénéfice secondaire : cela résout mécaniquement L6.6 (anneau de focus hétérogène), puisque `Button`
porte déjà son `focus-visible`.

### L6.2 - Nom accessible du bouton photo

`PhotoCapture.tsx:111-118` : `<button>` contenant une icône `Camera` et parfois un compteur, sans
`aria-label` ni texte. Annonce : « bouton » (ou « bouton 3 »). Le libellé visuel est dans un
`<span>` extérieur non relié (`EdlTerrainPage.tsx:677`, `:803`).

### L6.3 - Textes alternatifs des photos

`PhotoCapture.tsx:91`, `:94` : `alt={legende}` où `legende` vaut `Séjour - Canapé`. **Les 5 photos
d'un même élément portent le même `alt`.** Numéroter (« photo 2 sur 5 »).
`VisionneusePhotos.tsx:216` fait déjà le bon choix (`alt=""` + info sur le bouton parent).

### L6.4 - `prefers-reduced-motion`

0 occurrence, mais le mouvement réel se limite à **un** `animate-spin` de 14 px
(`AppLayout.tsx:265`) et des `transition-colors` courtes. Aucune animation de la classe qui
déclenche des troubles vestibulaires. **Cosmétique** : un bloc `@media (prefers-reduced-motion:
reduce)` dans `index.css` par propreté.

### L6.5 - Tailles en px et grilles non responsives

- `AppLayout.tsx:515` (`text-[10px]`) et `VisionneusePhotos.tsx:223` : **les deux seules tailles de
  texte en px** de l'application. Passer en `text-xs`.
- 17 `grid-cols-2` / `grid-cols-5` sans variante responsive. Vérifié à 320 px : **aucun débordement
  horizontal**, donc pas de non-conformité 1.4.10, seulement un confort dégradé (« Très bon » casse
  sur deux lignes). Priorité basse.

### L6.6 - Anneau de focus hétérogène

`Button` et `Checkbox` posent un `focus-visible` explicite. Les ~30 `<button>` écrits en direct et
les `NavLink` s'en remettent à l'anneau du navigateur. Ce n'est pas une non-conformité, mais le
repère change d'aspect d'un bouton à l'autre, et sur `VisionneusePhotos.tsx:92` l'anneau noir par
défaut sur fond `bg-black/90` sera peu visible.

**Correctif** : extraire les classes `focus-visible` de `Button.tsx:39` dans une constante
partagée, ou les poser en `@layer base` sur `button:focus-visible`.

---

## 11. Lot L7 - Contenu rédactionnel

**Verdict de l'audit de ton : l'interface ne « fait pas IA générée »**, et c'est mesuré. Sur neuf
marqueurs recherchés, sept sont à **0 occurrence** : emoji, « en toute simplicité / sérénité »,
« en un clin d'oeil », « gérez facilement », « centralisez », « optimisez », « Bravo »,
« C'est parti », structures ternaires marketing. Un seul point d'exclamation, un seul « Astuce : ».
Densité des textes d'aide : **4 hints pour 49 champs (8 %)** sur le formulaire de bail, quatre
écrans à zéro - l'antithèse du motif « chaque champ porte son explication ».

Ne rien toucher au contenu juridique (catégorie A de l'audit) : décret 2023-796, surface Boutin,
zone tendue, servitude de résidence principale, ERP, clause résolutoire, art. 1731, décret
2015-981, délais de restitution, RGPD. C'est du conseil que le bailleur particulier n'a pas.

**Coupes à faire** (paraphrase de l'interface, catégorie B) :

| Réf | Fichier:ligne | Problème | Action |
|---|---|---|---|
| a | `BailRapidePage.tsx:391` | Décrit un écran que l'utilisateur a sous les yeux, aperçu déjà affiché. Redondant avec `BauxPage.tsx:109` et `ApercuBailPanel.tsx:93` | Réduire à « Le bien et les locataires peuvent être saisis ici sans être enregistrés. » |
| b | `ApercuBailPanel.tsx:92` | « Modifiable et régénérable » dit 3 fois (avec `:390` et `BailDetailPage.tsx:385`) | Supprimer, garder `BailDetailPage` |
| c | `ClausesSelecteur.tsx:59-60` | Phrase identique mot pour mot à `ClausesBailPanel.tsx:168`, et le titre de `Section` la dit déjà. **3 fois sur un écran** | Démarrer à « Toutes sont licites… » |
| d | `BiensPage.tsx:121`, `BauxPage.tsx:138`, `LocatairesPage.tsx:166` | Message de recherche vide identique 3 fois, et le bouton juste dessous dit déjà la même chose | « Aucun résultat pour cette recherche. » |
| e | `TableauDeBordPage.tsx:219` | « Aucune alerte. Tout est en ordre. » | « Aucune alerte. » |
| f | `EdlRapidePage.tsx:510` | « Tout est prêt » paraphrase le bouton qui vient de s'activer | Garder « Le reste se remplit sur place, pièce par pièce. » |
| g | `BiensPage.tsx:91` | « Créez votre premier bien **pour commencer** » - seul `EmptyState` hors du moule sobre des autres | « Aucun bien enregistré » |
| h | `BienRapideModal.tsx:144-148` | Première phrase décrit l'action qu'on vient de déclencher | Démarrer à « Complétez sa fiche… » |
| i | `FicheVisitePanel.tsx:142-146` | Quasi identique à `BienDetailPage.tsx:231-234`. Et « Tout ce qui suit est modifiable » : ça se voit | Réduire à la dernière phrase |
| j | `BienFormPage.tsx:257-259` | « Une photo d'illustration » paraphrase le libellé au-dessus | Démarrer à « S'affiche sur la fiche… » |
| k | `EdlListePage.tsx:34` | Paraphrase le titre ; le « sans bail » est déjà dit 4 fois dans le parcours | Supprimer le sousTitre |

**Ton à reprendre** (catégorie C, il n'y en a que deux) :

| Réf | Fichier:ligne | Texte | Action |
|---|---|---|---|
| l | `ParametresPage.tsx:155` | « non garanti (pensez à exporter **!**) » - le seul point d'exclamation de l'UI | « non garanti - exportez régulièrement » |
| m | `EdlTerrainPage.tsx:936` | « **Astuce :** dans chaque pièce… » - le contenu est utile, seul le préfixe est du registre blog | Supprimer « Astuce : » |

**Cas discutable, à trancher** : `TableauDeBordPage.tsx:170`, « Commencez par le document dont vous
avez besoin ». Impératif un peu coach, mais le commentaire du code montre un choix de
positionnement assumé et cohérent avec bailiz.fr. Variante plus sèche si souhaité : « Quel document
voulez-vous produire ? »

### L7.n - Retirer les traces d'assistance par IA du produit

Décision actée n°8. Le recensement est **circonscrit à un seul fichier** : `grep` sur `Claude |
Anthropic | Spec Driven | intelligence artificielle` remonte **3 lignes**, toutes dans
`src/features/legal/MentionsLegalesPage.tsx`. Le site vitrine (`site/src/`), l'`index.html` et le
`README.md` n'en contiennent **aucune**.

À supprimer, dans la carte « Informations techniques » :

| Ligne | Contenu |
|---|---|
| `:131-133` | `<h3>` « Créée avec l'assistance de Claude (Anthropic) » |
| `:134-141` | Le paragraphe « Le besoin de départ… » qu'il coiffe |
| `:142` | `<h3>` « Spec Driven Development » |
| `:143-157` | Le paragraphe décrivant la méthode, le lien vers Claude Code et le renvoi à `cdc.md` |

**Vérifié : aucun effet de bord.** `LienExterne` (défini `:6`) et `LIEN_REPO` (importé `:4`) restent
utilisés ailleurs dans le fichier (`:35`, `:39`, `:51`, `:58`, `:70`) - pas d'import mort, donc pas
d'échec du `no-unused-vars` réglé en `error`. Le premier paragraphe de la carte (`:125-130`, pile
technique et PWA hors-ligne) est conservé : il ne mentionne aucune IA et documente une information
utile.

**À arbitrer** : le paragraphe `:134-141` décrit en réalité le **besoin produit** (bailleur LMNP,
deux moments du cycle locatif, tablette, hors-ligne, sans abonnement) et non la méthode. Il est bon,
et seul son titre le rattache à l'IA. Deux options : le supprimer avec le reste, ou le conserver
sous un titre neutre du type « Pourquoi cet outil ». Choix éditorial, sans incidence technique.

Les crédits de méthode iront dans le `README.md` du dépôt, hors périmètre de ce CDC.

---

## 12. Lot L8 - Garde-fous

Sans cette partie, les lots L0 à L7 se dégraderont au fil des écrans suivants. C'est le lot qui a
la meilleure durée de vie.

### L8.1 - `eslint-plugin-jsx-a11y`

Absent de `eslint.config.js`. Il aurait attrapé à l'écriture : les `<label>` orphelins de
`DateInput`, les champs sans nom accessible, les `<img>` sans `alt` discriminant, le canvas sans
rôle, les onglets sans `aria-current`.

Cohérent avec la philosophie déclarée du fichier (*« resserrée sur ce qui attrape de vrais défauts
sans imposer de style »*). Proposition : ajouter le plugin en `warn` d'abord pour mesurer le
volume, puis passer en `error` les règles dont le projet est déjà propre.

### L8.2 - Test unitaire de contraste sur la palette

Le projet **documente déjà ses ratios en commentaires** (`tailwind.config.js:18-24`, `:68-73`).
Ces commentaires sont vrais mais n'ont pas empêché L0.1 (hypothèse « sur blanc » invalidée par le
fond réel) ni L0.3 (couleurs hors palette).

Proposition : un `src/lib/palette.test.ts` qui importe `tailwind.config.js`, calcule les ratios des
paires **réellement employées** (y compris sur `accent-50`, le vrai fond) et assère les seuils.
Une trentaine de lignes, et la charte devient exécutable au lieu d'être déclarative. Attraperait
aussi toute future couleur hors palette.

### L8.3 - Test de non-régression d'accessibilité

Le projet a 460 tests et une culture de test réelle. Ajouter `axe-core` (ou `vitest-axe`) sur les
écrans déjà montés dans les tests existants (`BiensPage`, `BailDetailPage`, `EdlTerrainPage`,
`LocatairesPage`, `TableauDeBordPage`) donnerait un filet sur les défauts structurels : libellés
manquants, contrastes, rôles, hiérarchie de titres.

À cadrer : axe ne détecte pas tout (il n'aurait pas vu l'absence de piège de focus) et produit du
bruit sur les faux positifs. À introduire écran par écran, pas globalement.

---

## 13. Phasage proposé

| Lot | Contenu | Coût | Effet |
|---|---|---|---|
| **L0** | `accent-500`, bandeaux, rampe EDL, `border-accent-400` | très faible | AA sur 116 usages, 5 états EDL, tous les bandeaux. Pire cas EDL : 1,98 → 5,14:1 |
| **L1** | `DateInput`, `Modal`, `EdlTerrainPage` | moyen | 6 dates, 8 modales, l'écran terrain |
| **L2** | Disclaimer (option b), barre latérale, exemple de bail | faible | Première impression, décision d'adoption |
| **L3** | Paramètres : 3 sections, désamorçage, libellés grille | faible | Lève l'inquiétude, 48 champs nommés |
| **L4** | Nav : libellés tablette, verbes, groupes, filtres Documents | faible/moyen | iPad, découvrabilité |
| **L5** | `aria-required`, toasts, fieldset, skip link, titres, Entrée | moyen | Lecteurs d'écran, clavier |
| **L6** | Taille `icon` sur `Button` + routage des commandes, alt | faible/moyen | Terrain, motricité. Résout aussi L6.6 |
| **L7** | 13 coupes rédactionnelles + retrait des traces d'IA | très faible | Sobriété, positionnement |
| **L8** | jsx-a11y, test de palette, axe | moyen | Empêche le retour des défauts |

**Ordre recommandé** : L0 → L1 → L8.1/L8.2 (avant d'écrire la suite, pour que les lots suivants
soient contrôlés) → L2 → L3 → L4 → L5 → L6 → L7.

**Peuvent partir immédiatement, sans dépendance ni risque** : L0 (uniquement des valeurs de
couleur), L7 (uniquement des chaînes) et L7.n (suppression dans un seul fichier, effets de bord
vérifiés). Ce sont trois lots livrables séparément, utiles pour amorcer sans bloquer le reste.

**Dépendance à respecter** : L6.1 crée la taille `icon` de `Button`, dont L6.6 dépend. Et L1.2
(focus de `Modal`) conditionne l'intérêt de L2.4-rejeté : c'est ce qui rend le détour par la modale
locataire acceptable sans dupliquer le formulaire.

---

## 14. Arbitrages rendus

Les sept questions ouvertes ont été tranchées le 13/08/2026. Conservées ici avec leur réponse :
c'est ce qui explique plusieurs choix du document, et ce qu'il faudra relire si le contexte change.

| # | Question | Réponse | Répercuté dans |
|---|---|---|---|
| 1 | Obligation légale de conformité ? | **Aucune.** WCAG AA reste la cible, comme critère de qualité | Décision 1 |
| 2 | Appareils anciens à soutenir ? | **Non.** Dégradation acceptable ; correctifs retenus seulement s'ils sont gratuits | Décision 7, L4.1 |
| 3 | Distinguabilité des 5 états EDL ? | **Arbitré** : rampe DPE (3 verts, ambre, rouge). Le sujet était sans objet, un seul bouton étant coloré à la fois | L0.3 |
| 4 | Quelle option pour le disclaimer ? | **(b)** : modale conservée, réduite à une phrase, avec « vos données restent chez vous » | L2.1 |
| 5 | Mention de l'assistance par IA ? | **Retirée du produit.** Crédits de méthode dans le `README.md` | Décision 8, L7.n |
| 6 | Signature par un tiers ? | **Non.** Le signataire aura toujours souris ou écran tactile. On se limite à nommer la zone | Décision 6, L5.5 |
| 7 | Locataire inline ? | **Non.** Zéro duplication de code et de champs, principe directeur | Décision 5, L2.4 rejeté |

**Question résiduelle**, sans incidence sur le phasage : le paragraphe « Le besoin de départ… »
(`MentionsLegalesPage.tsx:134-141`) décrit le besoin produit et non la méthode. Le supprimer avec le
reste du bloc, ou le conserver sous un titre neutre ? Choix éditorial (cf. L7.n).

**À relire si le contexte change** : une monétisation ou un statut de service ferait entrer
l'application dans le champ de la directive 2019/882, et ce CDC passerait d'amélioration à
conformité - avec obligation de résultat sur les points aujourd'hui arbitrables.

---

## 15. Hors périmètre, relevé au passage

À traiter ailleurs, sans lien avec l'accessibilité :

1. **`importerSauvegarde` sans `sansJournaliser`** (`backup.ts`, mode `remplacer`). Même défaut que
   celui corrigé le 13/08/2026 dans `supprimerToutesLesDonnees` : les hooks de suivi
   rejournalisent chaque ligne effacée comme suppression à envoyer au Drive, laissant des entrées
   fantômes pour des enregistrements qui n'existent plus.
2. **`src/lib/sync/parcours.test.ts`** intermittent : timeout à 20 s quand la suite complète tourne
   sous charge, passe en 1,6 s isolé. Faux négatif de CI potentiel.
3. **Trois avertissements `react-hooks/set-state-in-effect`** (`BailRapidePage.tsx:78`,
   `LocatairesPage.tsx:45`, `SauvegardeAutoPanels.tsx:166`), volontairement en `warn` selon le
   commentaire de `eslint.config.js:34-39`. À revoir si le React Compiler est activé.
4. **Deux lignes vides consécutives** dans `ParametresPage.tsx:191-193`.
