# Audit SEO du site vitrine - 24 octobre 2026

> Porte sur `site/` (Astro 7, six pages publiques + une 404) et sur `site/public/.htaccess`.
> Référentiel : `docs/CDC-site-vitrine-seo.md`, notamment §8 (SEO technique) et §5 (landing).
> Méthode : lecture des sources, build local, inspection du HTML produit, rendu à 375 px.

---

## 1. Ce qui est acquis

Le socle technique est fait, et c'est la partie difficile.

- **HTML complet sans JavaScript.** 196 Ko pour tout le site, dont 48 Ko de fonte et 38 Ko
  d'image de partage. Aucune ressource tierce, fonte auto-hébergée et préchargée. Le critère
  d'acceptation §15.2 (`curl` renvoie le `<h1>`) est tenu, et le budget §8 (< 30 Ko de JS) l'est
  avec zéro.
- **Une seule forme d'URL.** `trailingSlash: 'always'`, `format: 'directory'`, canonique absolue
  sur chaque page. Rien à rattraper côté doublons.
- **`robots.txt` juste.** Pas de `Disallow: /app/` : le piège décrit au §8 est évité, et le
  `noindex` est bien présent dans `index.html` de l'application.
- **Sitemap** généré au build, `/app/` filtré, 404 absente.
- **Données structurées** : `SoftwareApplication` (avec `offers` à 0 EUR) et `FAQPage` sur
  l'accueil, `FAQPage` sur les deux pages outils.
- **Open Graph** complet : titre, description, URL, image 1200×630, `og:locale=fr_FR`,
  `twitter:card`.
- **Structure des titres** : un seul `<h1>` par page, hiérarchie `h2`/`h3` sans saut, vérifiée
  sur les sept pages.
- **Maillage** : accueil → outils, outil → outil, navigation et pied de page sur toutes les
  pages. Le retour application → vitrine existe aussi (`AppLayout.tsx`, `MentionsLegalesPage.tsx`).
  Aucune page orpheline.
- **Accessibilité** : focus visible, tableau avec `caption` et `th scope`, `<details>` natifs
  pour la FAQ, cibles tactiles à 44 px.
- **`.htaccess`** : 301 `www` → apex, forçage HTTPS, HSTS, CSP, compression, `ErrorDocument`.

Rien de tout cela n'est à refaire.

---

## 2. Ce qui manque, par ordre d'impact

### 2.1 Titres tronqués dans les résultats de recherche

Le CDC §8 fixe 50–60 caractères. Mesuré :

| Page | `title` | `description` |
|---|---|---|
| `/` | 60 ✅ | **164** ❌ |
| `/bail-meuble/` | **72** ❌ | 155 ✅ |
| `/etat-des-lieux/` | **72** ❌ | 152 ✅ |
| `/pourquoi-bailiz/` | **64** ❌ | **138** ❌ |
| `/confidentialite/` | **69** ❌ | **137** ❌ |
| `/mentions-legales/` | **25** ❌ | **121** ❌ |

Au-delà d'environ 60 caractères, Google coupe. Sur les deux pages outils, ce qui disparaît est
précisément la fin : « gratuit et sans inscription », « gratuit et hors ligne ». C'est l'argument
de clic qui saute.

Deuxième écart sur les mêmes pages : **« Bailiz » n'apparaît pas dans leur titre**, alors que le
CDC l'impose en suffixe. Ce sont les deux pages censées porter le trafic ; une marque inconnue ne
se construit pas si elle n'est jamais affichée.

### 2.2 Le tableau comparatif est illisible sur téléphone

`min-width: 44rem` (704 px) dans un conteneur à défilement horizontal. Mesuré à 375 px :
conteneur visible 333 px, contenu 704 px. On voit la première colonne et le début de la
deuxième. **La colonne « Avec Bailiz » est entièrement hors écran.**

Le défilement est bien confiné au conteneur (la page ne part pas de travers), mais la section
qui porte toute la différenciation du §13 bis ne dit rien à un visiteur sur mobile - c'est-à-dire
à la majorité d'entre eux.

### 2.3 `.htaccess` : le service worker est mis en cache un an

Les deux blocs `FilesMatch` se cumulent, et c'est le dernier qui l'emporte :

```apache
<FilesMatch "^(sw\.js|manifest\.webmanifest|registerSW\.js)$">   # no-cache
<FilesMatch "\.(css|js|woff2|svg|png|jpg|webp|avif)$">            # immutable, 1 an
```

`sw.js` et `registerSW.js` correspondent aussi à `\.js$`. Ils finissent donc en
`max-age=31536000, immutable` - exactement ce que le commentaire au-dessus dit vouloir éviter.
Conséquence : **une mise à jour de l'application peut ne jamais atteindre un utilisateur
existant**, puisque le navigateur ne redemandera pas le service worker.

Même mécanisme, moins grave, pour `/og.png`, `/icon.svg` et `/apple-touch-icon.png` : leur nom ne
porte pas de hash, mais ils sont servis en `immutable`. Corriger l'image de partage n'aurait pas
d'effet visible avant un an.

### 2.4 L'image de partage est restée à l'ancienne palette

`site/scripts/generer-images.mjs` dessine avec `#334155` et `#0f172a` - le slate de Tailwind,
abandonné lors de la refonte du 11 août (CDC §13.1) au profit du graphite tiède et du teal
`#2B6862`. Le `theme-color` du site vaut `#22524E`, l'en-tête dessine le logo avec `rx="112"`, le
script génère `rx="96"`.

L'`og:image` est la première - et souvent la seule - chose qu'on voit d'un lien partagé. Elle ne
ressemble pas au site qu'elle annonce.

### 2.5 Jeu d'icônes incomplet

Le §8 demande : PNG 192 et 512, `apple-touch-icon` 180, `favicon.ico`, et un `site.webmanifest`
de la vitrine distinct de celui de l'application. Présents aujourd'hui : `icon.svg` et
`apple-touch-icon.png`. Manquent le `.ico` (encore demandé par de vieux agrégateurs et par
certains navigateurs de bureau) et les PNG.

### 2.6 Données structurées incomplètes

- Pas de `BreadcrumbList`, demandé au §8. C'est ce qui remplace l'URL brute par un fil
  d'Ariane dans le résultat de recherche.
- Aucun JSON-LD sur `/pourquoi-bailiz/`, `/mentions-legales/`, `/confidentialite/`.
- Pas d'entité `Organization`/`WebSite` déclarée une fois pour le domaine.

### 2.7 Détails à faible coût

- **Pas de `lastmod` dans le sitemap.** Écarté après examen, et non corrigé : la seule valeur
  disponible au build serait la date du build, identique pour les sept pages et fausse six fois
  sur sept. La date de dernier commit par fichier serait juste, mais la CI fait un `checkout`
  superficiel, où `git log` ne connaît qu'un commit. Google ignore les `lastmod` qu'il juge peu
  fiables ; en déclarer un faux sur une vitrine qui vend l'exactitude serait le pire des deux
  mondes. À reprendre avec `/guides/`, où la date de mise à jour est de toute façon à afficher
  dans la page (§7).
- **`og:image` sans `width`, `height` ni `alt`.** Plusieurs agrégateurs n'affichent pas la
  grande carte sans dimensions déclarées.
- **Les commentaires HTML du gabarit partent en production**, chemins internes compris
  (`src/components/ui/Marque.tsx`). Environ 1 Ko par page, et des informations qui n'ont rien à
  faire dans une page publique. Les commentaires `{/* */}` d'Astro, eux, ne sont pas émis.
- **Le CSS est une requête séparée** (5,9 Ko) alors que le HTML est servi en `no-cache` : sur une
  première visite - la seule qui compte pour un moteur ou pour un nouveau visiteur - c'est un
  aller-retour bloquant avant le premier rendu.
- **La 404 ne renvoie pas aux pages outils**, seulement vers l'application et l'accueil. Le §8
  demande des liens vers les outils.

### 2.8 Ce qui n'est pas un défaut mais pèsera plus que tout le reste

`/guides/` n'existe pas (lot L5, connu et assumé). Le §7 et le §18 le disent sans détour : sur un
domaine neuf, les requêtes de tête sont inaccessibles pendant six à douze mois. Le trafic viendra
de la traîne longue, et la traîne longue est dans les guides. Tous les correctifs ci-dessus
améliorent la qualité de ce qui existe ; ils n'ajoutent pas de surface d'entrée.

---

## 3. Ordre d'exécution retenu

1. `.htaccess` (§2.3) - c'est un bug de production, pas une optimisation.
2. Titres et descriptions (§2.1), repris avec la réécriture du contenu.
3. Tableau comparatif sur mobile (§2.2).
4. Icônes et image de partage (§2.4, §2.5).
5. `BreadcrumbList`, `lastmod`, `og:image` dimensionnée, commentaires, CSS inliné, 404 (§2.6, §2.7).
6. `/guides/` : lot séparé.


---

## 4. Correctifs appliqués le 24 octobre 2026

| Point | Fichier | Ce qui a changé |
|---|---|---|
| §2.3 | `site/public/.htaccess` | Les exceptions `no-cache` passent **après** la règle `immutable`, sinon elles sont écrasées. `sw.js` et `registerSW.js` repassent en `no-cache` ; icônes et `og.png`, qui ne portent pas de hash, passent à 24 h |
| §2.4 | `site/scripts/generer-images.mjs` | Palette du slate d'origine remplacée par celle de la charte (`#22524E`, `#2B6862`, `#FAFAF9`, `#1A1815`). Logo repris de `public/icon.svg`, rayon aligné |
| §2.5 | idem + `site/public/` | `icon-192.png`, `icon-512.png` et `favicon.ico` générés. Le `.ico` encapsule un PNG (format admis depuis Vista), ce qui évite une dépendance de plus |
| §2.5 | `site/public/site.webmanifest` | Manifeste de la vitrine, icônes seulement. Ni `start_url` ni `display` : les ajouter rendrait la **vitrine** installable à la place de l'application |
| §2.6 | `site/src/layouts/Base.astro` | Prop `filAriane` : `BreadcrumbList` émis sur les cinq pages de second niveau, groupé avec le schéma de la page dans un seul `ld+json` |
| §2.2 | `index.astro`, `global.css` | Sous 48 rem le tableau se met en pile, une carte par ligne, chaque cellule précédée du libellé de sa colonne. Rôles ARIA redéclarés, `thead` passé hors écran |
| §2.7 | `Base.astro` | `og:image:width`, `:height`, `:alt` ajoutés |
| §2.7 | `Base.astro`, `index.astro` | Commentaires `<!-- -->` convertis en `{/* */}` : ils ne sont plus émis dans le HTML public, chemins internes compris |
| §2.7 | `site/astro.config.mjs` | `inlineStylesheets: 'always'`. Le HTML est en `no-cache`, un CSS séparé n'était donc jamais réutilisé par un nouveau visiteur et coûtait un aller-retour bloquant |
| §2.7 | `src/pages/404.astro` | Liens vers `/bail-meuble/` et `/etat-des-lieux/` |
| §2.1 | les six pages | `title` et `description` repris un par un. Les six titres tiennent désormais entre 50 et 60 caractères et portent tous « Bailiz » ; les six descriptions entre 140 et 160 |

Mesures après coup : accueil 25,9 ko bruts, **7,6 ko compressés**, une seule requête HTML, aucun
JavaScript.

## 5. Réécriture du contenu

Le fond était déjà précis - décrets cités, SHA-256, grille de vétusté, IRL, Visale. Ce qui donnait
au texte son air de brochure automatique tenait au tissu conjonctif : des triades partout
(« Remplissez, générez, imprimez », « Sans inscription. Sans installation. Sans engagement. »,
« rien à confirmer, rien à retenir, rien à récupérer »), des blocs d'une symétrie trop régulière,
et des phrases toutes de la même longueur.

Les quatre pages rédactionnelles ont été reprises : accueil, `/bail-meuble/`, `/etat-des-lieux/`,
`/pourquoi-bailiz/`. Principes tenus :

- aucune triade décorative ; une énumération ne reste que lorsqu'elle énumère vraiment quelque
  chose (les mentions du bail, les postes du document) ;
- les promesses vagues remplacées par du vérifiable : « Vérifiable par n'importe qui, à tout
  moment » devient « Tout est sur GitHub, y compris de quoi vérifier ce qui est écrit ici » ;
  « Bailiz n'a pas de serveur de base de données » devient « le serveur qui vous a servi cette
  page ne reçoit rien d'autre que la demande de la page » ;
- longueurs de phrases variées, y compris des phrases de trois mots (« Après, non. ») ;
- quelques faits ajoutés là où le texte restait en deçà de ce que le produit sait faire : le délai
  légal de restitution du dépôt, le nom d'IndexedDB, le coût réel de l'hébergement.

Les pages légales n'ont pas été retouchées sur le fond : leur rédaction est juste et leur ton
n'était pas en cause. Seuls leurs `title` et `description` ont bougé.

---

## 6. Relevé Search Console du 24 octobre 2026

Données arrêtées au 16/10, donc **antérieures** à la mise en ligne des correctifs ci-dessus.

| État | Pages |
|---|---|
| Dans l'index | 1 (`https://bailiz.fr/`) |
| Page avec redirection | 1 |
| Détectée, actuellement non indexée | 5 (les deux pages outils, `/pourquoi-bailiz/` et les deux pages légales) |

### Ce que ces deux motifs veulent dire

**« Page avec redirection »** n'est pas un défaut. La propriété est une propriété de domaine : elle
couvre `http://` et `www.`, qui redirigent en 301 vers l'apex en HTTPS comme le §9.1 l'exige.
Vérifié : les trois variantes répondent bien `301 → https://bailiz.fr/`. Rien à corriger.

**« Détectée, actuellement non indexée »** se lit de travers neuf fois sur dix. Les cinq URL
portent toutes la mention *Dernière exploration : Sans objet* : **Google ne les a jamais
chargées**. Il les connaît par le sitemap, et il a remis leur exploration à plus tard. Leur contenu
n'a donc pas été jugé : ni les titres, ni le texte, ni la structure n'entrent en ligne de compte,
et aucun correctif de la section 4 ne peut changer cet état.

Ce qui le provoque est ailleurs : un domaine sans historique, sans un seul lien entrant, et six
pages. Google rationne l'exploration des domaines qu'il ne connaît pas. Le §18 du CDC annonçait
six à douze mois ; nous sommes à deux.

### Ce qui agit réellement, par ordre d'effet

1. **Demander l'indexation à la main** pour les cinq URL (Inspection de l'URL → Demander une
   indexation). C'est le seul levier qui force une exploration à court terme, et cinq URL tiennent
   largement dans le quota quotidien.
2. **Obtenir des liens entrants**, qui est la vraie cause. Trois sont légitimes et gratuits : le
   champ *Website* du dépôt GitHub, le profil LinkedIn de l'éditeur, et la page de renvoi sur
   l'ancienne URL GitHub Pages (§9.5, toujours à faire).
3. **Ouvrir `/guides/`** (lot L5). Six pages sur un domaine neuf, c'est peu pour justifier des
   passages réguliers. Dix guides à intention d'outil donnent à la fois des pages d'entrée et une
   raison de revenir.
4. Vérifier dans *Sitemaps* que `sitemap-index.xml` est bien lu, et refaire un relevé à quatre
   semaines (lot L6).

### Vérifications en production, le 24 octobre

Le correctif de cache du §2.3 était raisonné et non testé. Il l'est désormais :

| URL | `Cache-Control` | Attendu |
|---|---|---|
| `/app/sw.js` | `no-cache, must-revalidate` | ✅ |
| `/app/manifest.webmanifest`, `/app/index.html` | `no-cache, must-revalidate` | ✅ |
| `/app/assets/index-*.js`, `*.css` | `public, max-age=31536000, immutable` | ✅ |
| `/og.png`, `/icon.svg` | `public, max-age=86400` | ✅ |
| `/` | `no-cache, must-revalidate` | ✅ |

Un défaut trouvé au passage et corrigé : `https://bailiz.fr/bail-meuble` sans slash final
répondait `Location: https://bailiz.fr:443/bail-meuble/`. `DirectorySlash` écrit le port
explicitement. L'effet est mince - un moteur normalise le port par défaut - mais la cible d'une
301 n'a pas de raison de différer de la canonique déclarée par la page. Remplacé par une règle de
réécriture explicite.

---

## 7. Ouverture de cinq pages outils - 24 octobre 2026

### Le constat

`src/lib/pdf/` contient **neuf générateurs de documents**. La vitrine n'en vendait **deux**.

| Document | Produit depuis | Page |
|---|---|---|
| Bail meublé | `/app/#/baux/nouveau` | `/bail-meuble/` |
| État des lieux | `/app/#/edl/nouveau` | `/etat-des-lieux/` |
| Lettre de restitution du dépôt | synthèse d'un EDL de sortie | **`/depot-de-garantie/`** |
| Grille de vétusté | `/app/#/parametres` | **`/grille-de-vetuste/`** |
| Courrier de révision IRL | fiche d'un bail | **`/revision-de-loyer-irl/`** |
| Acte de cautionnement | formulaire de bail | **`/acte-de-cautionnement/`** |
| Fiche de visite | fiche d'un logement | **`/fiche-de-visite/`** |
| Fiche d'aide juridique | `/app/#/parametres` | - |
| *(communs de mise en page)* | - | - |

Chacun de ces documents correspond à une intention de recherche propre, et **moins disputée** que
« bail meublé », tenue par service-public.fr et les portails. C'est exactement la traîne longue à
intention d'outil du §7 du CDC - avec un avantage sur les guides : il y a un document au bout.

La fiche d'aide juridique reste sans page : c'est un mémo de référence, pas un document produit
pour un locataire. Elle trouvera mieux sa place dans `/guides/`.

### Ce qui a été fait

- **Cinq pages outils** au gabarit §6 : intention en `<h1>`, CTA au-dessus de la ligne de
  flottaison, ce que le document contient, ce que l'outil fait, **ce qu'il ne fait pas**, cadre
  légal avec ses références, FAQ balisée `FAQPage`, liens vers deux autres outils.
  De 791 à 1331 mots, dans les bornes du §6.
- **`/outils/`**, l'index que le §4 réservait « à partir de trois ou quatre entrées ». Sans lui,
  les cinq nouvelles pages n'auraient été atteignables que par le pied de page. Balisé `ItemList`.
- **Navigation** : « Outils » ajouté, « Pourquoi Bailiz » raccourci en « Pourquoi » pour que les
  quatre entrées tiennent sur une ligne à 375 px (vérifié : une seule rangée, aucun débordement).
- **Pied de page** sur deux rangs, les sept outils puis les liens de service : treize libellés en
  file unique ne se lisaient plus.
- **Accueil** : les deux cartes du §3.6 restent le fer de lance, suivies d'un renvoi vers
  `/outils/`.

### Règles du CDC tenues

- **§3.6, on ne vend que ce qui existe.** Les cinq documents fonctionnent aujourd'hui. Aucune
  entrée « bientôt disponible », et `/outils/` le dit explicitement.
- **Liens profonds honnêtes.** La lettre de restitution et le courrier IRL supposent un état des
  lieux ou un bail enregistré : leur CTA vise la liste correspondante, pas un formulaire vide qui
  promettrait une porte inexistante.
- **Aucune affirmation non vérifiée.** Chaque chiffre et chaque référence vient du générateur
  concerné : article 22 et majoration de 10 % par mois commencé, plafond de deux mois de l'article
  25-6, décret n°2016-382 pour la vétusté, décret n°87-712 pour les réparations locatives, article
  17-1 pour l'IRL, article 22-1 pour le cautionnement, décret n°2015-1437 pour les pièces du
  dossier.
- **§12, avertissement juridique** repris sur les cinq pages.

### Mesures

| | Avant | Après |
|---|---|---|
| Pages indexables | 6 | **12** |
| Pages orphelines | 0 | 0 |
| `title` et `description` dans les bornes du §8 | 6/6 | **12/12** |
| Accueil compressé | 7,9 ko | 8,1 ko |
| JavaScript | 0 | 0 |

Liens internes vérifiés : aucun lien mort, aucune page orpheline, chaque page reçoit au moins
treize liens entrants.

---

## 8. Lot L5 : `/guides/` et les quatre premiers articles - 24 octobre 2026

### Ce qui a été monté

- **Collection de contenu Astro** (`site/src/content.config.ts`), chargée par `glob` depuis
  `src/content/guides/`. Le schéma est une barrière, pas une formalité : `misAJour` et `outil`
  sont **obligatoires**, parce que le §7 impose une date affichée et qu'un guide qui ne mène à
  aucun outil n'a pas sa place.
- **Gabarit d'article** (`site/src/pages/guides/[...slug].astro`). Il porte lui-même les trois
  obligations du cahier des charges, pour qu'aucun fichier Markdown ne puisse les oublier : date
  de mise à jour, renvoi vers l'outil, avertissement juridique du §12. Balisage `Article`.
- **Index `/guides/`**, trié par rang, chaque entrée avec sa date et son outil. Balisage
  `ItemList`.
- **Fil d'Ariane à trois échelons**, nouveau dans `Base.astro` (prop `filParent`). Il est aussi
  **visible** : un `BreadcrumbList` annoncé au moteur et absent de l'écran est une promesse faite
  à moitié, et sur une page de troisième niveau c'est le seul repère de position.
- **`lastmod` dans le sitemap, pour les guides seulement.** La réserve du §2.7 est levée là où
  elle pouvait l'être : les guides portent une vraie date, relue depuis leur frontmatter par
  `astro.config.mjs`. Les autres pages n'en ont toujours pas, et c'est délibéré - la date du
  build serait fausse six fois sur sept.

### Les quatre premiers articles

| Guide | Mots | Outil lié |
|---|---|---|
| Bail meublé : durée, préavis et reconduction | 724 | `/bail-meuble/` |
| Les diagnostics à annexer au bail meublé | 619 | `/bail-meuble/` |
| Les pièces qu'un bailleur a le droit de demander | 673 | `/fiche-de-visite/` |
| Colocation : un bail ou plusieurs ? | 628 | `/bail-meuble/` |

Choisis parmi les dix du §7 pour **ne pas recouper** les pages outils ouvertes à la section 7 :
la grille de vétusté, le dépôt de garantie et l'état des lieux de sortie ont désormais leur page
outil, et un guide qui redirait la même chose se ferait concurrence à lui-même.

Tout ce qui est affirmé vient des sources de l'application : clauses de durée de `BailPdf.tsx`,
liste des diagnostics et leurs conditions de `features/baux/annexes.ts`, seuils de décence
énergétique de `calculs.ts`, liste limitative des pièces de `lib/defauts.ts`, clause de
solidarité et article 8-1 de `BailPdf.tsx`.

### Deux problèmes trouvés en vérifiant

**La navigation débordait à 375 px.** Cinq entrées en libellés insécables sur une seule rangée
élargissaient le document à 408 px : c'est la page entière qui défilait latéralement. `flex-wrap`
ajouté, la navigation passe sur deux rangs pour 23 px de hauteur.

**Les tableaux Markdown faisaient la même chose.** La table du premier guide poussait le document
à 431 px. Astro 7 rend le Markdown avec Sätteri, où les plugins rehype exigeraient d'installer
`@astrojs/markdown-remark` - une dépendance de plus pour envelopper des tables, ce que le budget
du §8 ne justifie pas. Les guides écrivent donc leurs tableaux en HTML avec leur conteneur
défilant, convention notée dans `content.config.ts`, et une règle CSS de repli évite au moins le
défilement de la page si l'un l'oublie.

**Et une règle du §7 ratée au premier jet** : les quatre guides ne liaient l'outil que par
l'encart de fin, pas « dans le corps du texte ». Corrigé, chacun porte maintenant un à deux liens
contextuels.

### Mesures

| | Avant la journée | Après |
|---|---|---|
| Pages indexables | 6 | **17** |
| Pages orphelines | 0 | 0 |
| Liens internes morts | 0 | 0 |
| `title` / `description` dans les bornes | 6/6 | **17/17** |
| `lastmod` au sitemap | aucun | les 4 guides |
| JavaScript | 0 | 0 |

### Les six guides restants

Du §7, et à écrire dans cet ordre : état des lieux opposable, encadrement des loyers, LMNP et le
bail, état des lieux de sortie sans se disputer, puis les deux qui recoupent le plus les pages
outils - grille de vétusté et dépôt de garantie - qu'il faudra écrire sous un angle franchement
différent, ou renoncer à écrire.
