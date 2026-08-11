# CDC — Mise en ligne sur bailiz.fr : site vitrine, landing page et référencement

> Complète `cdc.md` (produit), `README.md` et `docs/DOCUMENTATION_TECHNIQUE.md`.
> Périmètre : **rendre Bailiz trouvable et compréhensible avant utilisation**. Nom de domaine
> propre, site public indexable, page de vente, pages outils, contenu éditorial, socle SEO
> technique et mesure d'audience.
> **Hors périmètre : le fonctionnement interne de l'application.** Aucun changement du schéma
> Dexie, du moteur PDF, des écrans métier. L'application est déplacée et enveloppée, pas réécrite.

---

## 1. Besoin

Bailiz existe, fonctionne et couvre un besoin réel — mais il est **introuvable**. Aujourd'hui :

1. **L'adresse est illisible et non mémorisable** : `jami-inf.github.io/Bailiz_gestion_immo/`.
   Impossible à dicter au téléphone, impossible à mettre sur une carte, et le nom du dépôt
   (« gestion_immo ») contredit le positionnement.
2. **Il n'y a rien à indexer.** L'application est une SPA en rendu client : le HTML servi est une
   coquille (`<div id="root">`). Un moteur qui n'exécute pas le JavaScript ne voit rien, et celui
   qui l'exécute ne trouve qu'un tableau de bord vide — aucun texte décrivant le produit.
   Le routage est en `HashRouter` : toutes les URL internes sont des fragments (`#/baux`), qui ne
   constituent **pas** des pages distinctes pour un moteur de recherche.
3. **Il n'y a rien pour convaincre.** Un visiteur qui arrive tombe directement dans l'outil, sans
   savoir ce qu'il fait, ce qu'il coûte, où vont ses données, ni pourquoi il devrait s'y fier.
   Un outil sans compte et sans backend a un problème de crédibilité **avant** d'avoir un problème
   de fonctionnalités : « gratuit », « sans compte », « rien n'est envoyé » se prouve, ça ne se
   décrète pas.
4. **Aucune mesure.** Aucune idée du nombre de visiteurs, des pages d'entrée, ni du taux de
   passage vers l'outil. On ne peut pas améliorer ce qu'on ne mesure pas.

L'objectif de ce lot : **bailiz.fr sert une page qui vend, et Google la trouve** — sans renier la
promesse « pas de compte, pas de traceur, vos données restent chez vous ».

---

## 2. Ce qui existe déjà (à réutiliser, ne pas refaire)

| Brique | État |
|---|---|
| Application complète et testée | ✅ 390 tests, CI verte, build de production fonctionnel |
| Déploiement automatisé | ✅ `.github/workflows/deploy.yml` : lint + couverture + build + Pages |
| PWA installable, hors-ligne | ✅ `vite-plugin-pwa`, précache complet, `registerType: 'prompt'` |
| Charte visuelle | ✅ Design system Tailwind interne (`accent-*`), fonte Inter auto-hébergée |
| Icônes | ⚠️ `icon.svg` + `icon-maskable.svg` uniquement — pas de PNG, pas d'`apple-touch-icon`, pas d'image de partage (`og:image`) |
| Contenu légal | ⚠️ `MentionsLegalesPage` est **dans** la SPA : juste, complet, mais non indexable et invisible avant d'entrer dans l'outil |
| Argumentaire produit | ⚠️ Il existe — mais dans le `README.md`, écrit pour un développeur, pas pour un bailleur |
| Base Vite | ⚠️ `base: './'` (relatif, imposé par le chemin `/<repo>/` de Pages) — à revoir avec un domaine propre |
| Routage | ⚠️ `HashRouter` : sans conséquence pour l'app, rédhibitoire pour toute page publique |
| Pages publiques, sitemap, robots, métadonnées | ❌ Rien |
| Mesure d'audience | ❌ Rien (revendiqué comme tel dans les mentions légales — cf. §11) |
| Nom de domaine | ✅ `bailiz.fr` réservé chez OVH |
| Hébergement | ✅ Mutualisé OVH inclus avec le domaine — ⚠️ quota et options à vérifier (§3.4, lot L0) |
| Déploiement vers OVH | ❌ Le workflow pousse aujourd'hui vers GitHub Pages ; il faut un envoi SFTP (§9.4) |

**Conclusion** : le produit est prêt, l'emballage n'existe pas. Le travail porte sur une **surface
publique statique** posée devant l'application, et sur la **migration de domaine**.

---

## 3. Décisions actées

### 3.1 Deux surfaces, un domaine

| Surface | URL | Nature | Indexation |
|---|---|---|---|
| **Site vitrine** | `bailiz.fr/…` | HTML statique pré-rendu, ~zéro JavaScript | ✅ Indexé, c'est tout l'objet |
| **Application** | `bailiz.fr/app/` | SPA existante, inchangée | ❌ `noindex` |

La séparation est nette et non négociable : **ce qui doit être référencé n'est jamais rendu par
React**. Le contenu public est du HTML servi tel quel, lisible sans exécuter une ligne de script.

### 3.2 L'application n'est pas migrée

Pas de SSR, pas de réécriture en framework SSG, pas de passage en `BrowserRouter`.
L'app reste une SPA en `HashRouter`, reconstruite avec `base: '/app/'`. Elle est en `noindex` :
son routage n'a donc **aucune incidence SEO**, et le `HashRouter` évite d'avoir à gérer un
fallback SPA côté hébergeur. Les liens profonds depuis la vitrine restent possibles
(`bailiz.fr/app/#/baux/nouveau`).

> Coût évité : la migration en `BrowserRouter` + fallback + vérification des 390 tests, pour un
> bénéfice nul sur des pages qu'on ne veut de toute façon pas indexer.

### 3.3 Générateur du site vitrine : Astro

Le site vitrine est un projet **Astro** distinct, dans le même dépôt (`site/`), construit par la
même CI. Astro produit du HTML statique sans JavaScript par défaut, ce qui est exactement le
besoin, et c'est la stack déjà pratiquée par ailleurs.

**Assemblage au build** : `site/dist/` → racine de l'artefact ; `dist/` (app Vite) → `/app/`.
Un seul artefact, un seul déploiement, un seul domaine — donc pas de cookie tiers, pas de CORS,
pas de sous-domaine à faire vivre.

*Alternatives écartées* : pré-rendu de la SPA (`vite-plugin-ssg`) — mélange le marketing et le
métier dans le même bundle React, et alourdit une landing qui doit être quasi vide de JS ;
sous-domaine `app.bailiz.fr` — deux origines, deux certificats, un `localStorage`/IndexedDB
séparé du domaine principal pour rien.

### 3.4 Hébergement : OVH mutualisé (compris avec le domaine)

Le domaine `bailiz.fr` est réservé chez OVH, hébergement mutualisé inclus. C'est la solution
retenue.

GitHub Pages était écarté pour **une seule raison** : ni redirection 301 ni en-tête HTTP
personnalisé. Or il en faut — redirection `www` → apex, `Cache-Control` différencié entre la
vitrine (courte) et les assets hashés de l'app (immutable), en-têtes de sécurité (`CSP`,
`Referrer-Policy`, `Permissions-Policy`), compression. OVH mutualisé est de l'Apache : **`.htaccess`
couvre tout cela**. Le manque disparaît, et avec lui la raison de passer par un tiers.

Deux gains propres à OVH :

- **Domaine, DNS et hébergement au même endroit.** Pas de délégation DNS, pas de compte
  supplémentaire à faire vivre.
- **Hébergement en France.** À énoncer honnêtement : sur le fond cela ne change rien, puisque
  l'application n'envoie aucune donnée au serveur — la politique de confidentialité est déjà exacte
  aujourd'hui. Mais elle mentionne actuellement *« GitHub, Inc., San Francisco, États-Unis »*.
  Sur la page qui vend le respect des données, OVH / Gravelines est un argument de **confiance et
  de conversion**, pas de conformité. Il vaut d'être pris.

**Prérequis à vérifier au Manager OVH** — l'hébergement offert avec un domaine est parfois une
offre symbolique :

| Besoin | Valeur |
|---|---|
| Application (`dist/`) | 2,5 Mo, 20 fichiers (dont 2,3 Mo de bundle JS) |
| Vitrine (HTML, captures, `og:image`, guides) | 2 à 4 Mo estimés |
| **Seuil de confort** | **≥ 50 Mo**, `.htaccess` autorisé |
| Non nécessaires | PHP, base de données, SSH, cron |

Si l'offre incluse plafonne à 10 Mo, elle tiendra au lancement et cassera à la troisième capture
d'écran : monter d'offre, ou basculer sur le repli.

**Ce que coûte OVH** : pas de déploiement piloté par Git, pas de déploiement atomique, pas de
rollback en un clic. Le workflow doit pousser les fichiers en **SFTP** (§9.4). Sur 20 fichiers et
2,5 Mo le risque d'état intermédiaire visible est marginal, mais il n'est pas nul — d'où l'envoi
« nouveau dossier puis bascule » spécifié au §9.4.

*Repli* : Cloudflare Pages (statique, gratuit, déploiement depuis GitHub, `_redirects` / `_headers`,
déploiements atomiques et rollback). Le reste du CDC tient sans modification.

### 3.5 Application en sous-répertoire : `bailiz.fr/app/`

Décision : **sous-répertoire**, pas `app.bailiz.fr`.

L'argument SEO habituel (le sous-répertoire consolide l'autorité du domaine) **ne s'applique pas
ici** : l'application est en `noindex`, elle n'apporte ni contenu ni lien à consolider. Les deux
options sont équivalentes au regard du référencement. La décision se prend donc ailleurs.

**Le critère décisif : l'origine est le coffre-fort.** IndexedDB, `localStorage` et le service
worker sont cloisonnés par origine, et c'est là — et nulle part ailleurs — que vivent les baux, les
états des lieux et les photos des utilisateurs. `bailiz.fr` et `app.bailiz.fr` sont deux origines
distinctes.

Une migration de données est déjà imposée aux utilisateurs actuels (GitHub Pages → bailiz.fr). La
question est de ne jamais la refaire :

- **`bailiz.fr/app/`** — une seule origine pour tout le domaine. Déplacer l'app à la racine, ou
  ajouter d'autres outils sur d'autres chemins, ne coûte rien : les données suivent.
- **`app.bailiz.fr`** — verrouille une seconde origine définitivement. Toute relocalisation
  ultérieure vers `bailiz.fr/` provoquerait une deuxième perte de données.

Le sous-domaine n'avait qu'un avantage sérieux — l'isolation du service worker — et **il n'en est
pas un** : la portée d'un service worker est par défaut le répertoire de son script. Construit avec
`base: '/app/'`, il est émis en `/app/sw.js` et sa portée vaut `/app/` sans configuration. Son
manifeste de précache, lui, est généré à partir du seul `dist/` de l'application : les fichiers de
la vitrine n'y figurent jamais (ils n'existent pas au moment du build de l'app). Cf. §10, revu en
conséquence.

*Exception* : si la vitrine devait un jour être hébergée ailleurs que l'application, le
sous-domaine s'imposerait dès maintenant. Sur OVH, les deux ne sont que deux dossiers du même
hébergement — le scénario n'a pas de raison de se présenter.

### 3.6 Positionnement retenu

Le brouillon de CDC positionne Bailiz comme **« boîte à outils immobilière »**. L'application, elle,
est aujourd'hui un **outil de gestion locative LMNP** structuré par entités (tableau de bord →
biens → locataires → baux → EDL). Ce n'est pas la même promesse, et la « règle d'or » du brouillon
(« ne pas devenir un ERP immobilier ») décrit un risque **déjà partiellement réalisé**.

**Décision actée** : la vitrine vend le **bail meublé** et l'**état des lieux**, pas la « boîte à
outils ». Celle-ci reste la direction produit, mais elle n'est pas le discours de lancement.

- **Fer de lance** : bail meublé et état des lieux. C'est là que le produit est mûr, là que
  l'intention de recherche est massive et qualifiée, et là qu'un particulier cherche vraiment
  quelque chose. « Boîte à outils immobilière » n'est une requête pour personne.
- **Pas de promesse de catalogue** : ni grille d'outils à venir, ni « bientôt disponible ». On ne
  vend que ce qui existe et fonctionne.
- **Entrée dans le produit par l'outil, pas par le tableau de bord** : chaque page outil de la
  vitrine pointe vers l'écran correspondant, formulaire ouvert. Le tableau de bord et les entités
  deviennent la coulisse de ceux qui restent, pas la porte d'entrée.

Conséquence sur l'arborescence (§4) : le lancement porte **deux** pages outils, pas quatre —
`/bail-meuble/` et `/etat-des-lieux/`. `/fiche-de-visite/` et `/depot-de-garantie/` suivront ;
`/outils/` n'a pas lieu d'être tant qu'il n'y a que deux entrées.

C'est le seul point où ce CDC engage le produit et pas seulement la vitrine. Il est faible et
réversible : aucun écran n'est supprimé.

### 3.7 Gratuité

Le site annonce **gratuit, sans compte, sans limite**, sans mention d'offre payante future ni de
« bêta ». Un « bientôt payant » implicite est le meilleur moyen de perdre la confiance qu'on
essaie de construire. Si un modèle économique arrive, il fera l'objet de son propre lot.

---

## 4. Arborescence des URL

**Au lancement** (périmètre §3.6 — deux outils, pas un catalogue) :

```
/                                   Landing — bail + état des lieux, preuve, réassurance
/bail-meuble/                       Outil : bail meublé LMNP
/etat-des-lieux/                    Outil : état des lieux entrée/sortie avec photos
/guides/                            Index éditorial
/guides/<slug>/                     Article (cf. §7)
/pourquoi-bailiz/                   Hors-ligne, sans compte, données locales, code ouvert
/mentions-legales/                  Statique, indexable
/confidentialite/                   Statique, indexable — page de preuve, pas de formalité
/app/                               Application (noindex)
```

**Réservé pour la suite**, à ouvrir outil par outil et jamais en « bientôt disponible » :
`/fiche-de-visite/`, `/depot-de-garantie/`, puis `/outils/` (un index n'a de sens qu'à partir de
trois ou quatre entrées).

Règles : minuscules, tirets, **slash final**, une URL par intention, pas de paramètres, pas de
date dans les URL de guides (le contenu juridique se met à jour, il ne se périme pas).

---

## 5. Landing page (`/`)

Cible : bailleur particulier, souvent un ou deux logements, qui vient de chercher « modèle bail
meublé » ou « état des lieux à imprimer ». Il n'a pas de problème de « gestion de patrimoine » ; il
a un document à produire cette semaine. La page doit lui prouver en un écran qu'il repart avec son
document, gratuitement, sans s'inscrire.

**Ordre imposé des blocs** — l'ordre est l'argumentaire :

1. **Hero.** Un `<h1>` explicite (pas un slogan) : *Bail meublé et état des lieux — gratuits, sans
   compte.* Sous-titre : ce que ça produit (un PDF conforme, prêt à imprimer).
   **Un CTA principal** : « Rédiger un bail » → `/app/#/baux/nouveau`. Un CTA secondaire :
   « Faire un état des lieux ». Rien à remplir, rien à choisir avant.
2. **Bandeau de réassurance** (4 items, une ligne chacun) : sans compte · fonctionne hors-ligne ·
   données stockées sur votre appareil · code source public.
3. **Preuve visuelle** : capture réelle de l'app + **aperçu du PDF produit**. Le PDF est le produit ;
   il doit être visible avant le clic. Images `loading="lazy"`, dimensions fixées, `<picture>` AVIF/WebP.
4. **Les deux outils**, deux cartes : ce que chacun produit, une phrase, lien vers sa page.
   Deux cartes, pas une grille à trous : on ne suggère pas un catalogue qui n'existe pas (§3.6).
5. **« Comment ça marche »** en trois étapes : choisir l'outil → remplir → générer le PDF.
   Trois phrases, pas de schéma.
6. **« Où vont mes données ? »** — le bloc le plus important de la page. Explication concrète et
   vérifiable (IndexedDB, aucun serveur, sauvegarde vers *votre* Drive si vous l'activez), lien vers
   `/confidentialite/` et vers le dépôt GitHub. **La vérifiabilité est l'argument**, pas le
   ton rassurant.
7. **Conformité** : le bail suit la trame du décret n°2015-587, l'EDL le décret n°2016-382, la liste
   des pièces le décret n°2015-1437. Suivi du disclaimer : Bailiz n'est pas un conseil juridique.
8. **FAQ** (6 à 8 questions, en `<details>`, balisée `FAQPage`) : C'est vraiment gratuit ? Faut-il
   créer un compte ? Que se passe-t-il si je change d'ordinateur ? Le bail est-il valable ? Puis-je
   signer en ligne ? Mes locataires sont-ils enregistrés quelque part ? Est-ce adapté à la location
   nue / à la colocation ?
9. **CTA de clôture** + pied de page (outils, guides, légal, GitHub, LinkedIn).

**Interdits** : bandeau cookies (il n'y a pas de cookie — cf. §11), pop-up de newsletter,
compteur de « +10 000 utilisateurs » non vérifiable, témoignages inventés, chiffres inventés.
Un produit qui vend l'honnêteté sur les données ne triche pas sur sa page d'accueil.

---

## 6. Pages outils

Une page par outil, **même gabarit**, ~700–1200 mots. Ce sont ces pages qui portent le trafic de
recherche : elles répondent à une intention précise, là où `/` répond à une marque inconnue.

Gabarit :

1. `<h1>` = l'intention (ex. *Modèle de bail meublé à remplir et imprimer — gratuit, sans inscription*)
2. Deux phrases, puis **le CTA, au-dessus de la ligne de flottaison**
3. Ce que le document contient (liste des mentions produites — c'est du contenu unique, et c'est ce
   qui prouve le sérieux)
4. Ce que l'outil fait pour vous (calculs, contrôles, avertissements légaux)
5. Ce qu'il ne fait pas (ex. pas de signature électronique du bail — cf. `README`). **Le dire
   explicitement** : cela évite une déception, et c'est un signal de sérieux.
6. Cadre légal en clair, avec les références
7. FAQ spécifique (3–5 questions, `FAQPage`)
8. Liens vers les autres outils et 2–3 guides

Chaque page doit se suffire à elle-même : un visiteur arrivé de Google sur `/etat-des-lieux/` doit
pouvoir produire son document sans jamais passer par `/`.

---

## 7. Contenu éditorial (`/guides/`)

Un domaine neuf ne prendra pas les requêtes de tête (« bail meublé », « état des lieux ») : elles
sont tenues par service-public.fr, PAP, SeLoger et les portails juridiques, et aucun effort
technique ne compense l'autorité. La stratégie est donc la **traîne longue à intention d'outil** —
des requêtes précises, moins disputées, où l'utilisateur cherche à *faire* quelque chose, pas à lire.

Dix articles au lancement, à titre indicatif :

- Bail meublé : durée, préavis et reconduction
- Que doit contenir un état des lieux pour être opposable ?
- Grille de vétusté : à quoi elle sert et comment l'appliquer
- Dépôt de garantie : délais de restitution et retenues justifiables
- Les pièces qu'un bailleur a le droit de demander (et celles qui sont interdites)
- Diagnostics obligatoires à annexer au bail
- Encadrement des loyers : suis-je concerné ?
- Colocation : un bail ou plusieurs ?
- LMNP : ce que le statut change pour le bail
- État des lieux de sortie : comparer avec l'entrée sans se disputer

Règles : français clair, pas de recopie de service-public.fr, **date de dernière mise à jour
affichée**, références aux textes, un lien contextuel vers l'outil concerné dans le corps du texte.
Une page qui ne mène à aucun outil n'a pas sa place ici.

---

## 8. SEO technique — exigences

| Exigence | Détail |
|---|---|
| Rendu | HTML complet sans JavaScript. Vérifiable : `curl` sur chaque URL publique doit contenir le `<h1>` et le corps du texte |
| `<title>` | Unique, 50–60 caractères, intention en tête, « Bailiz » en suffixe |
| `<meta description>` | Unique, 140–160 caractères, rédigée pour le clic |
| Titres | Un seul `<h1>`, hiérarchie `h2`/`h3` sans saut |
| Canonique | `<link rel="canonical">` absolu sur chaque page |
| `robots.txt` | `Allow: /` et lien vers le sitemap. **Surtout pas de `Disallow: /app/`** — voir ci-dessous |
| Sitemap | `sitemap-index.xml` généré au build (`@astrojs/sitemap`), `/app/` et la 404 exclus |
| `noindex` | `<meta name="robots" content="noindex,follow">` dans `index.html` de l'app, et sur la 404 |
| Données structurées | `SoftwareApplication` (avec `offers` à 0 EUR) sur `/`, `FAQPage`, `BreadcrumbList`, `Article` sur les guides. Validées au Rich Results Test |
| Open Graph / Twitter | Titre, description, `og:image` 1200×630 par page, `og:locale=fr_FR` |
| Langue | `<html lang="fr">`, pas de `hreflang` (site monolingue) |
| Maillage interne | Landing → outils → guides → outils. Aucune page orpheline |
| Images | AVIF/WebP, `width`/`height` fixés, `alt` descriptif, `lazy` hors hero |
| URL | Slash final cohérent, une seule casse, redirection des variantes |
| 404 | Page 404 utile (liens vers les outils), pas un cul-de-sac |
| Favicons | PNG 192/512, `apple-touch-icon` 180, `favicon.ico`, `site.webmanifest` de la vitrine distinct de celui de l'app |
| Search Console | Domaine vérifié, sitemap soumis, couverture surveillée après mise en ligne |

### Pourquoi l'application est en `noindex` — et pourquoi elle reste explorable

La question mérite d'être posée : pourquoi refuser une page à l'index ?

Parce qu'il n'y a **qu'une seule URL indexable** de toute façon. Le routage est en `HashRouter` :
`/app/#/baux` et `/app/#/edl` ne sont pas des pages distinctes pour un moteur, seulement des
fragments d'une même URL. Google ne verrait donc que `bailiz.fr/app/` — et, après rendu du
JavaScript, un **tableau de bord vide**, sans un mot décrivant le produit.

Cette page n'a rien à gagner et deux choses à perdre :

- elle **concurrencerait la vitrine** sur les requêtes de marque, sans jamais pouvoir mieux y
  répondre ;
- un visiteur qui y atterrirait depuis une recherche tomberait sur un écran vide au lieu d'une
  explication — mauvaise première visite, et signal de qualité dégradé.

**Erreur à ne pas commettre** : coupler le `noindex` à un `Disallow: /app/` dans `robots.txt`. Les
deux se neutralisent. Interdire l'exploration empêche le moteur de **lire** la balise `noindex` ;
l'URL peut alors rester dans l'index, sans contenu et sans moyen de l'en sortir. Pour désindexer,
il faut laisser explorer. `robots.txt` autorise donc tout, et le `noindex` fait le travail seul.

Ce choix se reverra le jour où l'entrée de l'application deviendra une vraie page de contenu
plutôt qu'un tableau de bord.

**Budgets de performance** (mobile, 4G simulée) : LCP < 2,0 s · CLS < 0,05 · INP < 200 ms ·
**< 30 ko de JavaScript** sur la landing · fonte auto-hébergée, `font-display: swap`, un seul poids
variable. Aucune ressource tierce (pas de Google Fonts, pas de CDN externe) : c'est bon pour la
vitesse **et** cohérent avec la promesse — aucune requête vers un tiers, donc aucune fuite d'IP.

---

## 9. Domaine, hébergement OVH, migration

### 9.1 Domaine et DNS

1. `bailiz.fr` est **réservé chez OVH**, hébergement mutualisé inclus. Vérifier que la protection
   des données WHOIS est active (elle l'est par défaut pour un particulier en `.fr`).
2. Zone DNS OVH : `A`/`AAAA` de l'apex vers l'IP de l'hébergement (renseigné automatiquement),
   `www` en `CNAME` vers l'apex.
3. **SSL Let's Encrypt** activé dans le Manager (gratuit, renouvellement automatique).
4. `.htaccess` racine : redirection 301 `www` → apex, forçage HTTPS, HSTS.

### 9.2 Structure des dossiers sur l'hébergement

```
www/                    ← vitrine (build Astro), racine du site
www/.htaccess           ← redirections, en-têtes, cache, compression
www/app/                ← application (build Vite, base '/app/')
```

Pas de multisite, pas de sous-domaine à déclarer : deux dossiers, une seule origine (§3.5).

### 9.3 `.htaccess` — exigences

| Règle | Cible |
|---|---|
| 301 `www` → apex, forçage HTTPS | Tout le site |
| `Cache-Control: no-cache, must-revalidate` | HTML de la vitrine — une correction de contenu doit être visible immédiatement |
| `Cache-Control: public, max-age=31536000, immutable` | `/app/assets/*` et assets hashés de la vitrine |
| `Cache-Control: no-cache` | `/app/sw.js`, `/app/index.html`, `/app/manifest.webmanifest` — sinon une mise à jour de l'app peut rester invisible |
| `Content-Security-Policy` | Restrictive : `default-src 'self'`. Seule exception, Google Identity Services (`accounts.google.com/gsi/`) pour la sauvegarde Drive — `script-src`, `style-src`, `connect-src`, `frame-src`. À valider contre le besoin réel de l'app (blobs PDF, `data:` images) avant mise en production |
| `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`, `Permissions-Policy` | Tout le site |
| `mod_deflate` / Brotli | HTML, CSS, JS, SVG, JSON |
| `ErrorDocument 404` | Page 404 de la vitrine |

### 9.4 Déploiement

OVH n'a pas de déploiement piloté par Git. Le workflow existant conserve ses barrières (lint,
couverture, build) et remplace ses deux dernières étapes :

- suppression de `upload-pages-artifact` et `deploy-pages` ;
- build de la vitrine (`site/`) **et** de l'app (`base: '/app/'`) ;
- **envoi SFTP** (`lftp mirror -R --delete`, ou action équivalente), identifiants en secrets GitHub
  (`OVH_SFTP_HOST`, `OVH_SFTP_USER`, `OVH_SFTP_PASSWORD`) ;
- pour éviter tout état intermédiaire visible : envoi dans `www/_deploy/`, puis bascule par renommage
  en fin de transfert. Sur 20 fichiers et 2,5 Mo la fenêtre est courte, mais le renommage la ferme.

**Ne jamais mettre les identifiants SFTP ailleurs que dans les secrets du dépôt** — le dépôt est
public.

### 9.5 Migration des utilisateurs existants

`dist` de l'app est construit avec `base: '/app/'` (remplace `base: './'`), manifeste PWA en
`start_url: '/app/'`, `scope: '/app/'`.

**Point de vigilance** : les utilisateurs ayant installé la PWA depuis l'URL GitHub Pages **ne
suivront pas la migration**. Leur installation pointe sur l'ancienne origine, et leurs données
IndexedDB y restent — elles ne sont ni perdues ni transférables automatiquement (cf. §3.5 :
l'origine est le coffre-fort).

À prévoir :

1. Conserver le dépôt GitHub Pages actif, avec une page de renvoi : « Bailiz a déménagé sur
   bailiz.fr — **exportez votre sauvegarde ici, puis réimportez-la sur le nouveau site** », lien
   direct vers l'écran d'export.
2. Le dispositif d'export/import existant (`lib/backup.ts`) couvre le besoin techniquement ; il
   n'y a qu'à l'expliquer.
3. Mettre à jour les liens sortants : `README.md`, champ *Website* du dépôt GitHub, LinkedIn.

---

## 10. Service worker

Le choix du sous-répertoire (§3.5) désamorce l'essentiel du risque, mais il reste deux réglages à
poser.

**Ce qui est acquis par construction** — et qu'il ne faut pas sur-traiter :

- la portée d'un service worker vaut par défaut le répertoire de son script. Construit avec
  `base: '/app/'`, il est émis en `/app/sw.js` : **sa portée est `/app/`, sans configuration**, et
  il ne peut pas intercepter une requête vers la vitrine ;
- `globPatterns` s'applique au seul `dist/` de l'application. Les fichiers de la vitrine n'y
  figurent jamais : ils n'existent pas au moment où Workbox construit le manifeste de précache.

**Ce qui reste à faire** :

- `navigateFallback` cantonné à `/app/` (et `navigateFallbackDenylist` sur le reste, par sécurité) ;
- la vitrine n'enregistre **aucun** service worker ;
- `Cache-Control: no-cache` sur le HTML de la vitrine et sur `/app/sw.js` (§9.3) ;
- vérifier que le manifeste de la vitrine (favicons) n'entre pas en conflit avec celui de l'app.
- `Cache-Control` : `no-cache` sur le HTML de la vitrine, `immutable` sur les assets hashés de l'app.
- **Test de non-régression obligatoire** : après une visite de `/app/` en mode hors-ligne puis
  retour en ligne, `bailiz.fr/` doit servir la version courante, pas une version en cache.

---

## 11. Mesure d'audience — et la contradiction à lever

Les mentions légales actuelles affirment : *« Aucun compte, aucun cookie, aucun traceur, aucune
mesure d'audience. »* Ajouter un outil de mesure sans revoir cette phrase serait un mensonge
littéral sur la page qui sert précisément à prouver l'honnêteté. Deux options, une seule à retenir :

**Retenue — analyse des logs serveur OVH, sans aucun script client.** L'hébergement mutualisé
fournit les journaux d'accès et un outil de statistiques inclus. Conséquences :

- **zéro JavaScript de mesure, zéro cookie, zéro identifiant, zéro requête tierce** — sur la
  vitrine comme dans l'application. C'est la seule option qui ne dégrade ni le budget de
  performance (§8) ni la promesse ;
- **aucun bandeau de consentement** ;
- **la conversion est mesurable telle quelle** : un clic de la vitrine vers `/app/` est une requête
  HTTP, donc une ligne de log. Pas besoin d'événement JavaScript pour la suivre.

Limites assumées : bruit des robots (à filtrer par *user-agent*), pas de distinction fine des
sessions, pas de suivi d'interaction intra-page. Suffisant pour la question posée — d'où viennent
les visiteurs, quelles pages ils lisent, combien entrent dans l'outil.

*Si les logs se révèlent insuffisants* : **GoatCounter** (hébergé en UE, sans cookie, ~3 ko), sur la
vitrine uniquement. **Jamais sur `/app/`** : l'application reste strictement muette, c'est le cœur
de la promesse.

> À noter : **Plausible auto-hébergé n'est pas déployable sur un mutualisé OVH** (Docker et base
> PostgreSQL requis). L'option supposerait un VPS — hors périmètre.

*Écarté* : Google Analytics — cookies, transferts hors UE, bandeau de consentement obligatoire.
Contradiction frontale avec le positionnement, pour un gain nul à ce volume.
*Écarté* : aucune mesure du tout — on ne saurait pas si le lot a fonctionné.

**Correction rédactionnelle obligatoire.** La phrase des mentions légales devient : *« Bailiz
n'utilise ni cookie, ni traceur, ni mesure d'audience par script. La fréquentation du site est
estimée à partir des journaux de connexion de l'hébergeur, conservés pour une durée limitée. »*

**Ce qu'on suit** : pages d'entrée, volume, requêtes (via Search Console) et **le passage vers
`/app/`**, ventilé par page d'origine.

---

## 12. Conformité légale du site public

- `/mentions-legales/` **statique** : éditeur (nom, statut, contact **e-mail** — une adresse
  postale personnelle n'est pas requise pour un site non professionnel, mais un moyen de contact
  l'est), hébergeur (**OVH SAS, 2 rue Kellermann, 59100 Roubaix, France** — remplace la mention
  GitHub, Inc. actuelle), directeur de publication.
- `/confidentialite/` **statique** : reprend le contenu de `MentionsLegalesPage`, corrigé du point
  §11, et complété du rappel RGPD au bailleur (il est responsable de traitement pour les données de
  ses locataires).
- La page in-app est **conservée** et pointe vers les pages publiques (source unique de vérité).
- **Disclaimer juridique** repris sur toutes les pages outils et guides : Bailiz produit des
  documents à partir de modèles conformes, ne constitue pas un conseil juridique et n'engage pas
  la responsabilité de son éditeur.
- Pas de formulaire de contact (donc pas de traitement de données) : contact par e-mail affiché
  et par les *issues* GitHub.
- **Accessibilité** : contraste AA, navigation clavier, `alt` sur les images, `<details>` natifs
  pour la FAQ, focus visible.

---

## 13. Identité visuelle

### 13.1 La charte — « l'encre et le papier »

Refondue le 11 août 2026. Elle vaut pour les deux surfaces : la vitrine et l'application doivent
être **manifestement le même produit**, sinon le clic vers `/app/` se lit comme une sortie de site.

**Source unique** : `tailwind.config.js`. Le site vitrine
(`site/src/styles/global.css`) en reprend les valeurs en variables CSS — deux fichiers, recopiés à
la main, parce que les faire dépendre l'un de l'autre imposerait une étape de build commune entre
deux projets qui n'en partagent aucune.

**Intention.** L'outil produit des documents destinés à être imprimés, signés, classés. Le
vocabulaire visuel est celui d'un papier bien composé : surfaces neutres tièdes, texte très
contrasté, beaucoup de blanc, une seule couleur d'action employée avec parcimonie.

| Rôle | Choix | Pourquoi |
|---|---|---|
| Neutre (`accent-*`) | Graphite **tiède** | Le gris-bleu froid de Tailwind donnait l'allure d'un tableau de bord générique |
| Marque (`brand-*`) | Teal profond désaturé, `#2B6862` | Le proptech français est massivement bleu ; s'en écarter aide à être reconnu, sans couleur déplacée sur un document juridique |
| Sémantiques | `danger` / `warning` / `success` / `info` | Déclarées une fois, exposées aussi sous leurs noms Tailwind (`red`, `amber`…) : la centaine d'usages en place s'harmonise sans être réécrite |
| Ombres | Quasi supprimées, teintées du neutre | L'élévation se dit par la bordure ; dix cartes à ombre font un relief brouillon |
| Fonte | Inter, inchangée | Déjà auto-hébergée et précachée. En changer coûterait un woff2 de plus au budget hors-ligne pour un gain d'image seul |

**Contrastes mesurés avant d'être retenus.** Toutes les paires de texte réellement employées
atteignent AA, la plupart AAA. Deux seuils sont désormais tenus qui ne l'étaient pas :

- `accent-500` (texte discret, libellés de remplacement) : **4,65:1** — l'ancien slate-500 était
  sous le seuil ;
- `accent-400` (bordures de champs) : **3,05:1**, ce qu'exige WCAG 1.4.11 pour les limites de
  composants d'interface. L'ancien slate-300 plafonnait à 1,7:1.

**Contrainte PWA respectée.** Aucun asset ajouté : la charte ne tient qu'à des valeurs de couleur
et à des règles CSS. Le précache reste à 2,5 Mo, et l'application ne charge toujours **aucune
ressource tierce** — condition de son fonctionnement hors ligne autant que de sa promesse de
confidentialité.

**Reste à faire** : le mode sombre. Les jetons sont nommés par rôle, ce qui le rend accessible plus
tard ; le faire maintenant supposerait d'auditer une vingtaine d'écrans, et un mode sombre à moitié
juste est pire que pas de mode sombre.

### 13.2 Ce que porte la marque

`brand-600` est réservé aux **actions principales** et à l'élément de navigation actif. C'est ce
qui le rend repérable d'un coup d'œil sur un formulaire de bail long. Tout le reste — cartes,
tableaux, textes — vit dans le neutre.

Les contrôles natifs (cases à cocher, boutons radio) reçoivent `accent-color` au niveau du
document : sans cela ils prenaient la couleur d'accentuation du système, et l'écran affichait deux
couleurs d'action concurrentes, dont une qui changeait d'un poste à l'autre.

### 13.3 L'articulation entre les deux surfaces

Traitée le 11 août 2026. Jusque-là, la vitrine et l'application coexistaient sans se connaître.

| Ce qui a changé | Détail |
|---|---|
| **Retour vers le site** | Le bloc de marque de la barre latérale et le pied de page mènent à `bailiz.fr`. L'application n'est plus une porte à sens unique |
| **En fenêtre autonome, ce retour disparaît** | Suivre un lien hors du `scope` d'une PWA installée éjecte vers le navigateur du système. `useModeAutonome` (`src/hooks/useStatuts.ts`) détecte le cas et rend le même bloc sans lien, à dimensions identiques |
| **Un seul glyphe** | `Logo` (`src/components/ui/Marque.tsx`) reprend le dessin du favicon, repris à l'identique dans l'en-tête de la vitrine. L'application affichait auparavant une icône `Building2` de Lucide : trois dessins pour un produit |
| **Même signature** | Glyphe de 36 px, mot-logo en 1,25 rem extra-gras, même interlettrage des deux côtés |
| **Positionnement unifié** | Baseline, `<title>` et manifeste PWA passent de « Gestion locative LMNP » à « Baux et états des lieux », conformément au §3.6 |
| **Entrée par l'outil** | L'état vide du tableau de bord propose « Rédiger un bail » au lieu de « Créez votre premier bien » — le formulaire de bail sait créer le logement en cours de route |
| **Impasse corrigée** | `/app/#/edl`, destination du second bouton de la landing, n'offrait **aucune action** : une consigne renvoyant ailleurs, sans lien pour y aller. Il propose désormais « Rédiger un bail » ou « Choisir un bail » selon ce qui existe déjà |
| **Légal remis d'aplomb** | La page interne annonçait encore GitHub Pages comme hébergeur et « aucune mesure d'audience » — deux affirmations devenues fausses. Corrigées, et renvoyant aux pages publiques comme référence |

**Pourquoi la page légale reste dupliquée** : l'application doit rester utilisable hors ligne, où
`bailiz.fr/mentions-legales/` n'est pas atteignable. Le contenu reste donc complet dans l'app, avec
un renvoi vers la version de référence. C'est un doublon assumé, pas un oubli — et il impose de
répercuter toute correction aux deux endroits.

**Deux fausses pistes écartées après vérification** : l'avertissement juridique est mémorisé en
base (`disclaimerAccepte`), il ne s'affiche qu'une fois — pas de double friction avec la vitrine.
Et la fonte Inter est bien servie deux fois sous deux URL, mais la mutualiser romprait le précache
hors-ligne de l'application pour 48 Ko chargés une seule fois.

### 13.4 Les documents produits

La palette du PDF suit la même échelle neutre. Le document est le produit : il aurait été
incohérent qu'il conserve les gris froids d'origine quand l'interface qui le fabrique n'en a plus.

---

## 13 bis. Positionnement concurrentiel

Étude menée le 11 août 2026. Le marché français se partage en deux familles, et **aucune ne couvre
la chaîne complète** :

| Famille | Exemples | Ce qu'elle donne | Ce qui manque |
|---|---|---|---|
| **Sites de modèles** | jelouebien, bailpdf, immobilierloyer, igestionlocative, jedeclaremonmeuble | Un PDF ou Word gratuit, à remplir à la main. Très fort en référencement | Le document ne calcule rien, ne garde aucun lien d'un acte à l'autre, et tout est à retaper à chaque relocation |
| **Applications d'état des lieux** | LEO, ImmoPad, EdlSoft, État des lieux Facile | Un EDL sur tablette, souvent hors ligne, avec photos et signature | Centrées sur le seul EDL, généralement avec compte, souvent en freemium, et sans lien avec le bail |

**Le manche que personne ne tient : la sortie du locataire.** Comparer l'entrée et la sortie,
appliquer une grille de vétusté, justifier chaque euro retenu sur le dépôt de garantie. C'est le
moment où l'argent change de main et où naissent les litiges — et c'est précisément ce qu'un
document à remplir ne peut pas faire.

**Conséquence sur la landing** : l'argument principal n'est plus « rédigez un bail gratuitement »
(tout le monde le propose), mais **la chaîne** bail → EDL d'entrée → EDL de sortie → décompte du
dépôt. La section « Le moment qui coûte cher, c'est la sortie » ouvre désormais la page après le
héros, suivie d'un tableau comparatif.

**Règle de rédaction : aucun concurrent n'est nommé, et rien n'est affirmé à leur sujet.** La
publicité comparative est licite en France, mais doit être objective et vérifiable (art. L122-1 du
code de la consommation). La comparaison porte donc sur une **catégorie** — « un modèle à remplir »
— et n'énonce que des faits sur Bailiz. C'est aussi plus honnête : les offres évoluent, une
affirmation vraie aujourd'hui sur un concurrent nommé ne le sera pas dans six mois.

Aucune formule du type « le seul à… » n'est employée : invérifiable, donc à proscrire.

---

## 14. Lots de développement (ordre imposé)

| Lot | Contenu | Sortie vérifiable |
|---|---|---|
| ~~**L0 — Vérification OVH**~~ | ✅ **Fait.** Offre incluse : 100 Mo. Besoin mesuré : 2,5 Mo (app) + 180 Ko (vitrine). OVH est retenu | Marge suffisante ; le repli Cloudflare n'est plus d'actualité |
| **L1 — Socle & déploiement** | DNS, SSL, `.htaccess` (§9.3), projet Astro `site/`, `base: '/app/'`, service worker cantonné (§10), workflow SFTP avec bascule par renommage (§9.4) | `bailiz.fr` sert une page, `bailiz.fr/app/` sert l'application intacte, hors-ligne compris ; un `git push` déploie les deux |
| **L2 — Landing** | Page `/` complète (§5), charte, captures, `og:image`, favicons, 404 | Lighthouse ≥ 95 en Performance / SEO / Accessibilité / Bonnes pratiques, mobile |
| **L3 — Socle SEO & légal** | `robots.txt`, `sitemap.xml`, canoniques, JSON-LD, `noindex` sur l'app, `/mentions-legales/` (hébergeur OVH), `/confidentialite/` (§11), Search Console, page de renvoi sur l'ancienne URL (§9.5) | Sitemap soumis, données structurées validées, `curl` sur `/` renvoie le contenu |
| **L4 — Pages outils** | `/bail-meuble/`, `/etat-des-lieux/`, `/pourquoi-bailiz/` | 3 pages au gabarit §6, chacune avec son CTA profond et sa FAQ |
| **L5 — Éditorial** | `/guides/` + 10 articles (§7), collection de contenu Astro, maillage interne | 10 pages indexables, chacune liée à au moins un outil |
| **L6 — Suivi** | Relevé des logs OVH + Search Console : pages d'entrée, requêtes, passage vers `/app/` ; itérations sur les titres et descriptions | Premier relevé à 4 semaines, puis mensuel |

L0 à L3 forment le **minimum publiable** : sans eux, mettre le site en ligne n'apporte rien.

### État d'avancement

| Élément | État |
|---|---|
| Projet Astro `site/` (Astro 7, zéro dépendance tierce au runtime) | ✅ |
| Landing `/` — tous les blocs du §5 | ✅ |
| Charte refondue, appliquée aux deux surfaces et aux PDF (§13) | ✅ |
| Différenciation concurrentielle : section « la sortie » + tableau comparatif (§13 bis) | ✅ |
| `/bail-meuble/`, `/etat-des-lieux/`, `/pourquoi-bailiz/` | ✅ |
| `/mentions-legales/`, `/confidentialite/` (hébergeur OVH, mesure d'audience corrigée) | ✅ |
| 404 en `noindex`, `robots.txt`, sitemap, canoniques, Open Graph, JSON-LD | ✅ |
| `og.png`, `apple-touch-icon.png`, favicon (`npm run images`) | ✅ |
| `.htaccess` (redirections, cache, en-têtes, CSP) | ✅ — CSP **à valider** sur un parcours PDF complet |
| `<meta name="robots" content="noindex,follow">` dans `index.html` de l'app | ✅ |
| Preuve visuelle : schéma SVG de l'enchaînement bail → EDL → décompte | ✅ — captures d'écran réelles toujours à produire |
| Mode sombre de l'application | ❌ Reporté (§13.1) |
| **`base: '/app/'` dans `vite.config.ts`** | ❌ À faire **au même commit que la bascule CI**, sinon le déploiement GitHub Pages actuel casse |
| **Workflow de déploiement SFTP vers OVH** (§9.4) | ❌ En cours côté éditeur |
| **Page de renvoi sur l'ancienne URL GitHub Pages** (§9.5) | ❌ À faire à la mise en ligne |
| `/guides/` et les 10 articles (L5) | ❌ Non commencé |

---

## 15. Critères d'acceptation globaux

1. `bailiz.fr` répond en HTTPS ; `www.bailiz.fr` redirige en 301 vers l'apex.
2. `curl -s https://bailiz.fr/` contient le `<h1>` et le texte de la page — **sans exécuter de JS**.
3. `bailiz.fr/app/` est fonctionnellement identique à la version actuelle, **hors-ligne inclus**, et
   les 390 tests passent sans modification.
4. `/app/` renvoie `noindex` ; `robots.txt` le confirme ; aucune URL `/app/` dans le sitemap.
5. Toutes les pages publiques ont un `title`, une `description` et une canonique **uniques**.
6. Lighthouse mobile ≥ 95 sur les quatre catégories, pour `/` et une page outil.
7. Aucune requête réseau vers un domaine tiers sur les pages publiques (vérifié dans l'onglet Réseau).
8. Aucun bandeau de consentement — parce qu'il n'y a rien qui en exige un.
9. Le passage vitrine → application se fait en **un clic** depuis chaque page outil, et ouvre le
   bon écran.
10. Les mentions légales et la politique de confidentialité sont accessibles **sans entrer dans
    l'application**, et exactes au regard du §11.
11. Un utilisateur de l'ancienne URL est informé du déménagement et de la marche à suivre pour ses
    données.
12. Un `git push` sur `main` déploie vitrine **et** application, sans intervention manuelle, et sans
    qu'aucun identifiant SFTP n'apparaisse ailleurs que dans les secrets du dépôt.
13. Les en-têtes de cache sont vérifiés en production : le HTML de la vitrine n'est pas mis en
    cache, `/app/assets/*` l'est en `immutable`.
14. Le parcours complet de l'application (création de bail, génération PDF, photos d'EDL,
    signature) fonctionne **sous la CSP de production**.

---

## 16. Hors périmètre

- Toute évolution fonctionnelle de l'application (nouveaux outils, calculateurs, refonte en
  « boîte à outils » au sens strict du brouillon).
- Comptes, authentification, backend, base de données.
- Version multilingue.
- Newsletter, formulaire de contact, chat.
- Publicité payante (SEA), réseaux sociaux, campagnes.
- Modèle économique et facturation.

---

## 17. Décisions à arbitrer

**Tranché** :

| # | Question | Décision |
|---|---|---|
| 1 | Nom de domaine | ✅ `bailiz.fr` réservé chez OVH |
| 2 | Hébergement | ✅ OVH mutualisé inclus (§3.4), sous réserve du quota — cf. L0. Repli : Cloudflare Pages |
| 3 | Sous-domaine ou sous-répertoire | ✅ `bailiz.fr/app/` — une seule origine, aucune migration de données future (§3.5) |
| 4 | Positionnement de lancement | ✅ Bail meublé + état des lieux. « Boîte à outils » reste la direction produit, pas le discours (§3.6) |
| 5 | Mesure d'audience | ✅ Logs serveur OVH, aucun script client ; mentions légales corrigées (§11) |
| 6 | Site vitrine : même dépôt ? | ✅ Même dépôt (`site/`) : un déploiement, une CI, aucune désynchronisation |

**Reste ouvert** :

| # | Question | Recommandation |
|---|---|---|
| 7 | L'offre OVH incluse tient-elle le quota ? | À vérifier au Manager — c'est le lot L0, et il est bloquant |
| 8 | Éditeur du site : personne physique ou structure ? | À confirmer — conditionne la rédaction des mentions légales |
| 9 | Le tableau de bord reste-t-il l'accueil de l'app ? | Oui pour l'instant ; les liens profonds de la vitrine contournent le sujet (§3.6) |

---

## 18. Risques

| Risque | Portée | Parade |
|---|---|---|
| Attentes SEO irréalistes | Élevée | Un domaine neuf met **6 à 12 mois** à peser. Les premiers résultats viendront de la traîne longue, pas de « bail meublé ». Le juger sur la Search Console, pas sur des positions isolées |
| Les utilisateurs installés perdent leur PWA et croient perdre leurs données | Élevée — c'est le seul risque qui touche des utilisateurs réels et existants | Page de renvoi sur l'ancienne URL + procédure d'export/import expliquée (§9.5) |
| Déploiement SFTP non atomique, ou identifiants exposés | Moyenne — le dépôt est **public** | Secrets GitHub uniquement, envoi dans un dossier temporaire puis bascule par renommage (§9.4) |
| Quota OVH atteint après quelques captures d'écran | Moyenne | L0 le tranche avant tout développement ; images en AVIF/WebP (§8) |
| La vitrine promet plus que l'app ne tient | Moyenne — c'est le pire des risques pour un produit qui vend la franchise | Chaque page outil dit aussi ce que l'outil **ne fait pas** (§6) ; pas de « bientôt disponible » (§3.6) |
| CSP trop stricte cassant le rendu PDF de l'app | Moyenne — se voit en production, pas en développement | Valider la CSP contre un parcours complet (génération PDF, photos, `blob:`) avant mise en ligne (§9.3) |
| Le service worker sert une vitrine périmée | **Faible** — largement désamorcée par le choix du sous-répertoire (§10) | `navigateFallback` cantonné, `Cache-Control: no-cache` sur le HTML de la vitrine ; test de non-régression après visite hors-ligne de `/app/` |
| Deux builds dans une CI qui devient fragile | Faible | Un seul workflow, deux étapes ; l'échec de l'un bloque le déploiement des deux |
