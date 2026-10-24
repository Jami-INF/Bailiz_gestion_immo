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
