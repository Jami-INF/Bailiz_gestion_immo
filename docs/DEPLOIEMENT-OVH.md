# Guide de déploiement — bailiz.fr sur OVH

> Met en œuvre `docs/CDC-site-vitrine-seo.md` §9. Procédure complète, de la zone DNS au premier
> déploiement automatique, puis vérification et dépannage.
>
> **Cible** : `bailiz.fr` sert la vitrine (`site/dist`), `bailiz.fr/app/` sert l'application
> (`dist`). Une seule origine, un seul hébergement, un seul déploiement.

---

## 0. Ce qu'il faut avoir sous la main

| Élément | Où le trouver |
|---|---|
| Domaine `bailiz.fr` | ✅ Réservé chez OVH |
| Hébergement mutualisé 100 Mo | ✅ Inclus, rattaché au domaine — **cluster129** |
| Zone DNS | ✅ Correcte, rien à modifier (§1) |
| Certificats SSL apex + www | ✅ Actifs, Let's Encrypt (§2) |
| Accès **SFTP** (port 22) | ✅ `ftp.cluster129.hosting.ovh.net`, home `/home/bailiza`. **FTPS ne fonctionne pas sur ce cluster** (§4) |
| Espace nécessaire | 2,7 Mo assemblés (2,5 Mo app + 0,2 Mo vitrine) sur 100 Mo |
| Secrets GitHub | ✅ Posés (§4) |

**Le seul point encore inconnu** : `.htaccess` est-il honoré sur cette offre ? S'il était ignoré,
les redirections et les en-têtes de cache tomberaient — le site fonctionnerait, mais sans sa
canonicalisation ni son cache. Le §7 le teste explicitement ; ce n'est pas bloquant pour la mise en
ligne, mais il faut le savoir plutôt que de croire le site correctement configuré.

---

## 1. Zone DNS — ✅ déjà en place

Vérifié le 11 août 2026, rien à modifier :

| Type | Sous-domaine | Valeur constatée |
|---|---|---|
| `A` | *(apex)* | `51.91.236.255` |
| `AAAA` | *(apex)* | `2001:41d0:301::29` |
| `A` / `AAAA` | `www` | mêmes valeurs |

L'inverse de `51.91.236.255` répond `cluster029.hosting.ovh.net`, et `cluster129.hosting.ovh.net`
résout vers cette même adresse : l'hébergement est bien rattaché au domaine. L'apex comme le `www`
sont servis par Apache et renvoient tous deux `200` — **aucune redirection au niveau d'OVH**. C'est
la configuration attendue : la canonicalisation `www` → apex est faite par le `.htaccess`, où elle
est contrôlable et versionnée.

> **Attention au numéro de cluster.** Le reverse DNS annonce `029`, le Manager OVH annonce `129`, et
> les deux noms FTP sont des alias sur une même adresse (`5.135.48.84`). **C'est la valeur du
> Manager qui fait foi : cluster129.**

Deux enregistrements `TXT` (`@ "1|www.bailiz.fr"` et `www "3|welcome"`) sont des marqueurs internes
d'OVH décrivant l'état de configuration du domaine — le second correspond à la page « site en
construction » actuellement servie. Ils sont sans effet sur le routage HTTP. **Ne pas les
supprimer à la main** : OVH les met à jour lui-même.

Les enregistrements `MX`, `SPF`, `DKIM` et `autodiscover` indiquent qu'une offre e-mail est active
sur le domaine — voir la remarque en fin de §8.

```bash
# Pour recontrôler à tout moment
dig +short bailiz.fr A && dig +short -x 51.91.236.255
```

---

## 2. Certificat SSL — ✅ déjà actif

Vérifié le 11 août 2026 : **deux certificats Let's Encrypt valides**, l'un pour `bailiz.fr`, l'autre
pour `www.bailiz.fr`, expirant le 9 novembre 2026 et renouvelés automatiquement par OVH. HTTPS
répond en HTTP/2 sur les deux noms.

Ce point comptait plus qu'il n'en a l'air : la redirection `www` → apex du `.htaccess` s'exécute
**après** la poignée de main TLS. Sans certificat couvrant `www.bailiz.fr`, un visiteur arrivant
sur `https://www.bailiz.fr` verrait une erreur de sécurité avant même d'être redirigé. Les deux
noms étant couverts, le forçage HTTPS et la redirection du `.htaccess` peuvent être activés sans
précaution particulière.

```bash
# Pour recontrôler après un renouvellement
curl -sSI https://www.bailiz.fr/ | head -1
```

---

## 3. Structure des dossiers sur l'hébergement

```
www/                     ← racine du site (docroot)
├── .htaccess            ← redirections, cache, en-têtes, CSP
├── index.html           ← landing
├── 404.html
├── robots.txt
├── sitemap-index.xml
├── _astro/              ← CSS de la vitrine (noms hachés)
├── fonts/
├── bail-meuble/
├── etat-des-lieux/
├── …
└── app/                 ← APPLICATION
    ├── index.html
    ├── sw.js
    ├── manifest.webmanifest
    └── assets/
```

Pas de multisite à déclarer, pas de sous-domaine : `app` est un simple sous-dossier.

La connexion FTP aboutit dans `/home/bailiza`, qui **contient** `www/` — ce n'est donc pas la
racine du site. La cible du miroir est par conséquent `www/`, en relatif (§4).

---

## 4. Identifiants de transfert

Web Cloud → Hébergements → onglet **FTP-SSH**.

Créez un utilisateur dédié au déploiement plutôt que d'utiliser le compte principal :
**Actions** → **Ajouter un utilisateur**. Racine : `/www`. Notez le mot de passe, il n'est affiché
qu'une fois.

Vous obtenez trois valeurs :

| Valeur | Pour bailiz.fr — ✅ confirmé |
|---|---|
| Serveur | **`ftp.cluster129.hosting.ovh.net`** |
| Protocole retenu | **SFTP, port 22** — FTPS échoue sur ce cluster (voir plus bas) |
| Utilisateur principal | `bailiza` |
| Répertoire home | `/home/bailiza`, qui contient `www/` |

> **Le cluster est le 129**, et non le 029 que renvoie le reverse DNS de l'IP web — les deux noms
> FTP sont des alias sur la même adresse (`5.135.48.84`), mais c'est la valeur du Manager qui fait
> foi. N'utilisez pas `ftp.bailiz.fr` : le `CNAME` existe dans la zone et résoudrait, mais l'hôte
> canonique du cluster est celui qu'OVH documente et maintient.

Le compte SFTP a pour **répertoire cible `.`** — la racine du compte, c'est-à-dire
`/home/bailiza`, qui **contient** `www`. La cible du miroir est donc **`www/`**, en chemin
**relatif** : un chemin absolu (`/www/`) casserait si le compte était chrooté, le relatif
fonctionne dans les deux cas.

> **Ce réglage est vérifié à chaque exécution, et ce n'est pas une précaution de confort.** La
> troisième passe du miroir emporte `--delete`. Visant `www/`, elle ne peut nettoyer que
> l'intérieur du site. Mais si le répertoire cible du compte était un jour changé en `./www`, la
> connexion aboutirait *dans* le docroot, la même commande viserait le dossier **parent** et
> **supprimerait le site**. Le workflow sonde donc le point d'arrivée avant d'écrire quoi que ce
> soit, et s'arrête si `www` n'y figure pas.

### SFTP, et pas FTPS

Le Manager annonce les deux, mais **FTPS ne fonctionne pas sur ce cluster**. Une tentative sur le
port 21 avec `ftp:ssl-force` échoue à la connexion :

```
Login failed: ftp:ssl-force is set and server does not support or allow SSL
```

Le serveur n'annonce pas `AUTH TLS`. Comme le FTP simple est exclu — il transmettrait le mot de
passe en clair — **le transfert se fait en SFTP** (port 22).

Quatre ajustements que cela impose dans le workflow — les deux derniers ont chacun coûté une
exécution ratée :

1. **`sshpass`** est installé à côté de `lftp`. lftp parle SFTP au travers de `ssh`, et `ssh` ne
   sait pas lire un mot de passe autrement que sur un terminal ; `sshpass -e` le lui fournit
   depuis la variable `SSHPASS`, sans jamais le faire apparaître sur une ligne de commande.
2. **L'empreinte du serveur est relevée avant la connexion** (`ssh-keyscan` vers
   `~/.ssh/known_hosts`). Sans elle, `ssh` s'arrête sur une demande de confirmation qui n'obtiendra
   jamais de réponse, et le job expire au lieu d'échouer franchement.
3. **`LFTP_PASSWORD` en plus de `SSHPASS`**, alimentées par le même secret. En SFTP, lftp ne se
   sert pas du mot de passe — c'est ssh qui authentifie — mais il **refuse de se connecter sans**.
   Sans terminal pour le demander, il abandonne et bascule en anonyme :

   ```
   open: GetPass() failed -- assume anonymous login
   ```

   `open -u "$UTILISATEUR" --env-password` le lui donne et clôt le sujet.
4. **`PreferredAuthentications=password,keyboard-interactive`**. C'est le piège le plus trompeur :
   restreint à `password`, ssh se voit refuser l'accès avec des identifiants pourtant valides,
   parce que le serveur présente son invite par `keyboard-interactive`. Le message ne dit rien de
   la cause :

   ```
   Fatal error: max-retries exceeded (Permission denied, please try again.)
   ```

**Un test d'authentification isolé** précède désormais tout le reste : une connexion `sftp` nue,
sans lftp. Les messages de lftp ne distinguent pas un mauvais mot de passe d'une méthode
d'authentification inadaptée ou d'une erreur de sa propre configuration ; `sshpass -e sftp` le dit
franchement, et fait échouer le job avant qu'il ne touche au serveur.

> **Note de sécurité.** `ssh-keyscan` accorde sa confiance à la première réponse obtenue, à chaque
> exécution : cela évite l'invite, mais ne vérifie rien. Pour une vérification réelle, relever
> l'empreinte une fois depuis un poste de confiance, la stocker dans un secret `OVH_SSH_HOSTKEY` et
> écrire ce secret dans `known_hosts` au lieu de la scanner.

Le jour où le déploiement passera à une **clé SSH**, `sshpass` et le secret de mot de passe
disparaissent : c'est la trajectoire à viser.

### Secrets GitHub

Settings → Secrets and variables → **Actions**. Le workflow attend **exactement ces trois noms** :

| Nom du secret | Valeur attendue |
|---|---|
| `OVH_FTP_HOST` | `ftp.cluster129.hosting.ovh.net` |
| `OVH_FTP_USER` | `bailiza` (ou l'utilisateur dédié que vous avez créé) |
| `OVH_FTP_PASSWORD` | le mot de passe correspondant |

> **Le dépôt est public.** Ces valeurs ne doivent apparaître nulle part ailleurs : ni dans un
> fichier, ni dans un commentaire, ni dans un log. Les secrets GitHub sont masqués dans les
> journaux d'exécution ; une variable écrite en dur ne le serait pas.

---

## 5. Le workflow de déploiement — ✅ en place

Écrit dans `.github/workflows/deploy.yml`, **en remplacement** des étapes GitHub Pages
(`upload-pages-artifact` et `deploy-pages`). Les barrières de qualité — lint, couverture, build —
sont conservées telles quelles : elles sont la raison d'être de cette CI.

Reproduit ci-dessous à l'identique ; le fichier fait foi.

```yaml
name: Déploiement bailiz.fr

on:
  push:
    branches: [main]
  workflow_dispatch:

# Un seul déploiement à la fois ; on n'annule pas un run en cours, sous peine
# d'interrompre un transfert FTP au milieu.
concurrency:
  group: deploiement
  cancel-in-progress: false

jobs:
  deployer:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          # Node 22 et non 20 : Astro 7 exige `>=22.12.0` (cf. ses `engines`).
          # L'application, elle, s'accommode des deux.
          node-version: 22
          cache: npm
          # Deux projets, deux verrous : sans ce chemin explicite, le cache ne
          # couvrirait que celui de la racine.
          cache-dependency-path: |
            package-lock.json
            site/package-lock.json

      # --- Application ------------------------------------------------------
      - run: npm ci
      - run: npm run lint
      # `test:coverage` et non `test` : les seuils de couverture font partie de
      # la barrière. Sans cela, une régression peut supprimer des tests sans que
      # rien ne s'en aperçoive.
      - run: npm run test:coverage
      - run: npm run build

      - name: Rapport de couverture
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: couverture
          path: coverage/
          retention-days: 7

      # --- Site vitrine -----------------------------------------------------
      - run: npm ci --prefix site
      - run: npm run build --prefix site

      # --- Assemblage -------------------------------------------------------
      # Un seul dossier à transférer, et c'est une protection autant qu'une
      # commodité : un miroir avec `--delete` lancé sur la seule vitrine
      # effacerait `/app/`, qui n'existe pas dans `site/dist`.
      - name: Assembler le site complet
        run: |
          rm -rf _site
          cp -r site/dist _site
          cp -r dist _site/app
          test -f _site/index.html || { echo "::error::vitrine absente"; exit 1; }
          test -f _site/app/index.html || { echo "::error::application absente"; exit 1; }
          test -f _site/.htaccess || { echo "::error::.htaccess absent"; exit 1; }
          echo "À déployer : $(du -sh _site | cut -f1)"

      # --- Transfert --------------------------------------------------------
      - name: Installer lftp et sshpass
        run: sudo apt-get update && sudo apt-get install -y lftp sshpass

      # Transfert en SFTP (port 22) et non en FTPS : ce cluster OVH n'annonce
      # pas AUTH TLS sur le port 21 (« server does not support or allow SSL »).
      # Le FTP simple est exclu — il transmettrait le mot de passe en clair.
      - name: Envoyer sur OVH
        env:
          HOTE: ${{ secrets.OVH_FTP_HOST }}
          UTILISATEUR: ${{ secrets.OVH_FTP_USER }}
          # Le même mot de passe, lu par deux programmes différents, chacun
          # depuis sa propre variable — et jamais depuis une ligne de commande :
          #   - SSHPASS      : `sshpass -e` le donne à ssh, qui authentifie ;
          #   - LFTP_PASSWORD: `--env-password` le donne à lftp, qui ne s'en sert
          #     pas en SFTP mais refuse de se connecter sans (« GetPass() failed
          #     -- assume anonymous login »).
          SSHPASS: ${{ secrets.OVH_FTP_PASSWORD }}
          LFTP_PASSWORD: ${{ secrets.OVH_FTP_PASSWORD }}
        run: |
          # Empreinte du serveur relevée avant la connexion : sans cela, ssh
          # s'arrête sur une demande de confirmation qui n'aura jamais de
          # réponse dans un environnement non interactif.
          mkdir -p ~/.ssh && chmod 700 ~/.ssh
          ssh-keyscan -H "$HOTE" >> ~/.ssh/known_hosts 2>/dev/null
          test -s ~/.ssh/known_hosts || { echo "::error::empreinte SSH introuvable pour $HOTE"; exit 1; }

          # Options ssh communes. `keyboard-interactive` autant que `password` :
          # beaucoup de serveurs, dont ceux d'OVH, présentent l'invite de mot de
          # passe par ce second mécanisme. Ne demander que `password` suffit à se
          # faire répondre « Permission denied » avec des identifiants pourtant
          # valides. `NumberOfPasswordPrompts=1` évite de boucler sur un refus.
          OPTIONS_SSH="-o PreferredAuthentications=password,keyboard-interactive -o PubkeyAuthentication=no -o NumberOfPasswordPrompts=1"

          # --- Authentification, testée à part ---
          #
          # lftp enveloppe ssh, et ses messages d'erreur ne disent pas si l'échec
          # vient des identifiants, de la méthode d'authentification ou de sa
          # propre configuration. Une connexion sftp nue tranche la question, et
          # son diagnostic est directement lisible.
          echo "Test d'authentification SFTP :"
          sshpass -e sftp $OPTIONS_SSH -b /dev/null "$UTILISATEUR@$HOTE" || {
            echo "::error::Authentification SFTP refusée. Vérifier les secrets \
          OVH_FTP_USER et OVH_FTP_PASSWORD, et que SFTP est activé pour ce compte \
          dans le Manager OVH (onglet FTP-SSH)."
            exit 1
          }
          echo "Authentification acceptée."

          # Réglages de connexion dans `~/.lftprc` plutôt que dans chaque appel :
          # ils servent deux fois (sonde puis transfert), et les sortir du script
          # évite d'imbriquer des guillemets dans des guillemets.
          cat > ~/.lftprc <<RC
          set sftp:connect-program "sshpass -e ssh -a -x $OPTIONS_SSH"
          set sftp:auto-confirm yes
          set net:max-retries 3
          set net:timeout 20
          set cmd:fail-exit true
          RC

          # --- Sonde, avant tout transfert ---
          #
          # La troisième passe emporte `--delete`. Visant `www/`, elle ne peut
          # nettoyer que l'intérieur du site. Mais si la connexion aboutissait
          # DÉJÀ dans `www` (selon le répertoire cible du compte SFTP), la même
          # commande viserait le dossier parent et **supprimerait le docroot**.
          # On vérifie donc où l'on atterrit avant d'écrire quoi que ce soit.
          echo "Point d'arrivée sur le serveur :"
          ARRIVEE=$(lftp -c "open -u \"$UTILISATEUR\" --env-password sftp://$HOTE:22; pwd; cls -1;")
          echo "$ARRIVEE"

          echo "$ARRIVEE" | grep -qx 'www/\?' || {
            echo "::error::Le dossier 'www' est absent du point d'arrivée. \
          Le compte SFTP aboutit peut-être déjà dans le docroot : dans ce cas la cible \
          du miroir doit devenir '.' et non 'www/'. Transfert interrompu — \
          un miroir avec --delete au mauvais endroit effacerait le site."
            exit 1
          }

          # --- Transfert ---
          #
          # Le script lftp ne contient QUE des commandes : pas un commentaire.
          # lftp traite les apostrophes comme des délimiteurs de chaîne, et une
          # apostrophe française isolée (« l'ordre », « qu'il ») suffirait à lui
          # faire avaler les lignes suivantes.
          #
          # - Passe 1, les assets sans suppression : un HTML mis en ligne avant
          #   le CSS qu'il référence afficherait une page nue quelques secondes.
          # - Passe 2, le HTML, qui référence des assets désormais présents.
          # - Passe 3, suppression de ce qui a disparu du build.
          lftp -c "
            open -u \"$UTILISATEUR\" --env-password sftp://$HOTE:22;
            mirror -R --parallel=4 --exclude-glob *.html _site/ www/;
            mirror -R --parallel=4 _site/ www/;
            mirror -R --delete --parallel=4 _site/ www/;
          "

      # --- Contrôle ---------------------------------------------------------
      # Le déploiement n'est pas réussi parce que le transfert s'est terminé,
      # mais parce que le site répond correctement.
      - name: Vérifier la mise en ligne
        run: |
          sleep 5
          echo "— HTML servi sans JavaScript"
          curl -sS --fail --max-time 20 https://bailiz.fr/ | grep -q "<h1>" \
            || { echo "::error::la vitrine ne renvoie pas de <h1>"; exit 1; }

          echo "— application présente"
          curl -sS --fail --max-time 20 -o /dev/null https://bailiz.fr/app/ \
            || { echo "::error::/app/ ne répond pas"; exit 1; }

          echo "— application en noindex"
          curl -sS --max-time 20 https://bailiz.fr/app/ | grep -q 'content="noindex,follow"' \
            || echo "::warning::le noindex de /app/ est absent"

          echo "— redirection www vers l'apex"
          curl -sS --max-time 20 -o /dev/null -w '%{http_code} %{redirect_url}\n' \
            https://www.bailiz.fr/ | grep -q '^301 https://bailiz.fr/' \
            || echo "::warning::www ne redirige pas en 301 — .htaccess ignoré ?"

          echo "Déploiement vérifié."
```

### ⚠️ Le piège à ne pas reproduire

Ne mirroitez **jamais** `site/dist/` seul vers `/www/` avec `--delete` : `app/` n'existe pas dans
`site/dist/`, donc l'application serait **intégralement supprimée** à chaque déploiement de la
vitrine. L'assemblage préalable dans `_site/` est là pour rendre cette erreur impossible.

### Notes

- **`ssl:verify-certificate no`** : le certificat présenté par le serveur FTP d'OVH ne correspond
  pas toujours au nom d'hôte utilisé. La connexion reste chiffrée ; seule la vérification du nom
  est levée.
- **Chemin distant** : `www/`, relatif au home `/home/bailiza` où la connexion aboutit. Un
  chemin absolu casserait si le compte était chrooté (cf. §4).
- **Les trois passes sont rapides** : `mirror` ne transfère que ce qui a changé (taille et date).
  Les passes 2 et 3 ne coûtent presque rien.
- **`.htaccess`** est bien transféré : `lftp mirror` inclut les fichiers cachés.
- **Le mot de passe passe par `LFTP_PASSWORD`**, jamais par le script. Écrit en ligne, il aurait
  fallu l'entourer de guillemets — et un mot de passe contenant `"` ou `,` aurait produit une
  commande malformée, avec un échec d'authentification incompréhensible à déboguer.

---

## 6. La bascule — à faire en un seul commit

Tant que le déploiement GitHub Pages est actif, l'application est servie sous
`/Bailiz_gestion_immo/`. Elle passera sous `/app/`. **Les deux changements doivent partir
ensemble**, sinon le site en ligne casse entre les deux.

Dans `vite.config.ts` :

```diff
-  // Base relative : indispensable pour GitHub Pages où l'app est servie
-  // sous /<nom-du-repo>/ et non à la racine du domaine.
-  base: './',
+  // L'application est servie sous bailiz.fr/app/ — cf. docs/CDC-site-vitrine-seo.md §3.5.
+  // Une seule origine avec la vitrine : les données IndexedDB des utilisateurs
+  // survivent à toute réorganisation ultérieure des chemins.
+  base: '/app/',
```

Et dans le manifeste PWA, juste en dessous :

```diff
-        start_url: './',
-        scope: './',
+        start_url: '/app/',
+        scope: '/app/',
```

Le service worker suit automatiquement : émis en `/app/sw.js`, sa portée vaut `/app/` par défaut —
il ne peut pas intercepter les requêtes de la vitrine.

**Le même commit doit contenir** : ce diff, le nouveau `deploy.yml`, et rien d'autre. C'est le
commit qu'on relit avant de pousser.

Vérification locale avant de pousser :

```bash
npm run build && npx vite preview --outDir dist
```

L'application doit répondre sur `http://localhost:4173/app/`.

---

## 7. Premier déploiement et vérification

Poussez sur `main`, suivez l'exécution dans l'onglet **Actions**. Puis, dans l'ordre :

### Le site répond

```bash
curl -sI https://bailiz.fr/ | head -1
```

### Le HTML est complet sans JavaScript — le critère central

```bash
curl -s https://bailiz.fr/ | grep -c "<h1>"
```

Doit renvoyer `1`. Si c'est `0`, la vitrine n'est pas servie (ou c'est l'app qui l'est).

### Les redirections

```bash
curl -sI http://bailiz.fr/ | grep -i "^location"
curl -sI https://www.bailiz.fr/ | grep -i "^location"
```

Les deux doivent renvoyer `https://bailiz.fr/`. Une absence de réponse signale un `.htaccess`
ignoré — vérifiez qu'il est bien présent à la racine et que l'offre autorise `mod_rewrite`.

### Les en-têtes de cache

```bash
curl -sI https://bailiz.fr/ | grep -i cache-control
curl -sI https://bailiz.fr/_astro/*.css | grep -i cache-control
```

Attendu : `no-cache` sur le HTML, `immutable` sur le CSS. Si les deux sont identiques,
`mod_headers` n'est pas actif.

### L'application

Ouvrez `https://bailiz.fr/app/` et déroulez **un parcours complet** :

- [ ] création d'un bail → génération du PDF ;
- [ ] état des lieux → ajout d'une photo → signature ;
- [ ] export d'une sauvegarde.

> C'est ici que se révèle une CSP trop stricte. Le rendu PDF utilise des `blob:` et des images
> `data:`. Si le PDF ne s'affiche pas, ouvrez la console : un message `Refused to load…` désigne la
> directive fautive dans `site/public/.htaccess`. **Ce défaut est invisible en développement.**

### Le hors-ligne

Chargez `/app/`, coupez le réseau, rechargez : l'application doit s'ouvrir. Puis, réseau rétabli,
vérifiez que `https://bailiz.fr/` sert bien la version courante de la vitrine et non une version
mise en cache.

### Le SEO

```bash
curl -s https://bailiz.fr/robots.txt
curl -s https://bailiz.fr/sitemap-index.xml
curl -s https://bailiz.fr/app/ | grep -o '<meta name="robots"[^>]*>'
```

Le dernier doit renvoyer `noindex,follow`. Et `robots.txt` ne doit **pas** contenir
`Disallow: /app/` : bloquer l'exploration empêcherait les moteurs de lire ce `noindex`.

---

## 8. Après la mise en ligne

### Search Console

[search.google.com/search-console](https://search.google.com/search-console) → ajouter une
propriété **Domaine** `bailiz.fr` → validation par enregistrement `TXT` dans la zone DNS OVH.
Puis **Sitemaps** → soumettre `sitemap-index.xml`.

C'est la seule mesure de référencement qui compte les premiers mois. N'attendez pas de résultats
avant 6 à 12 mois, et jugez sur les impressions et les requêtes, pas sur des positions isolées.

### L'ancienne URL — et le réglage GitHub Pages

`jami-inf.github.io/Bailiz_gestion_immo/` **doit rester en ligne, et doit continuer à servir
l'application**, pas une page de renvoi statique.

La raison est technique et décisive : les données des utilisateurs sont dans l'IndexedDB de
**cette origine-là**. Pour les récupérer, il leur faut l'**application** qui tourne sur cette
origine — c'est elle qui contient la fonction d'export. La remplacer par une page de renvoi leur
retirerait le seul moyen d'accéder à leurs baux et à leurs états des lieux.

**Réglage à appliquer** : Settings → Pages → Source → **GitHub Actions**.

- Cela **désactive** le workflow Jekyll automatique, qui échoue sur les fichiers `.astro` du
  dossier `site/` (cf. §10).
- Le nouveau workflow ne publie plus rien sur Pages : la **dernière version déployée reste
  servie**, donc l'ancienne application reste accessible.
- **Ne pas mettre « None »** : cela supprimerait le site et, avec lui, le chemin d'export.

Le message de déménagement viendra plus tard, sous forme d'un bandeau **dans** l'ancienne
application (un déploiement ponctuel), jamais d'une redirection sèche — qui ferait croire à une
perte de données.

### Liens à mettre à jour

`README.md`, champ *Website* du dépôt GitHub, LinkedIn.

### Une adresse de contact au nom du domaine

La zone DNS comporte des `MX`, un `SPF` et des clés `DKIM` : une offre e-mail est active sur
`bailiz.fr`. Créer `contact@bailiz.fr` (Web Cloud → E-mails) et l'utiliser dans
`site/src/pages/mentions-legales.astro` à la place de l'adresse Gmail actuelle. C'est gratuit,
déjà payé, et sur une page qui sert à établir la confiance, une adresse au nom du domaine vaut
mieux qu'une adresse personnelle.

---

## 9. Revenir en arrière

Il n'y a pas de rollback en un clic : OVH sert des fichiers, sans historique de versions.

**La marche à suivre** : Actions → sélectionner l'exécution du dernier déploiement correct →
**Re-run all jobs**. Le build est reproductible depuis le commit, donc le site revient à cet état.

Si le problème vient d'un commit déjà poussé, `git revert` puis push reste plus propre : l'état de
`main` et l'état du serveur restent identiques, ce qui n'est pas le cas après un simple *re-run*.

---

## 10. Dépannage

| Symptôme | Cause probable | Correction |
|---|---|---|
| Un job **Jekyll** échoue sur les fichiers `.astro` | GitHub Pages est réglé sur « Deploy from a branch » : le workflow automatique `pages-build-deployment` lance Jekyll sur la racine du dépôt, et lit les `---` des fichiers `.astro` comme du front matter YAML | **Aucun correctif dans le code.** Settings → Pages → Source → **GitHub Actions**. Ne pas mettre « None » : cf. §8 |
| `npm ci --prefix site` ou le build vitrine échoue en CI, mais passe en local | Version de Node du runner inférieure à celle exigée par Astro (`>=22.12.0`) | `node-version: 22` dans le workflow. Le vérifier après chaque montée de version majeure d'Astro : `node -p "require('./site/node_modules/astro/package.json').engines"` |
| `403 Forbidden` à la racine | Fichiers déposés à côté de `www/` et non dedans | Vérifier la cible du miroir : `www/` relatif, jamais `/www/` |
| `Le dossier 'www' est absent du point d'arrivée` | Le répertoire cible du compte SFTP a changé — la connexion aboutit déjà dans le docroot | Remettre le répertoire cible à `.` dans le Manager, ou basculer la cible du miroir sur `.` dans le workflow |
| `500 Internal Server Error` | Une directive de `.htaccess` non supportée | Commenter les blocs `<IfModule>` un par un pour isoler |
| Redirections et cache sans effet | `mod_rewrite` / `mod_headers` inactifs | Vérifier l'offre ; sans eux, le site fonctionne mais perd §7 |
| Boucle de redirection HTTPS | Certificat pas encore actif | Attendre la fin de la génération Let's Encrypt (§2) |
| Page nue quelques secondes après déploiement | Ordre de transfert | Vérifier que la passe 1 (assets) précède bien la passe 2 |
| `/app/` en 404 | Assemblage manqué | Le workflow doit copier `dist` dans `_site/app` |
| L'app charge mais tout est blanc | `base` resté à `'./'` | §6 |
| Le PDF ne s'affiche plus | CSP trop stricte | Console → `Refused to load` → ajuster `site/public/.htaccess` |
| La vitrine reste sur une vieille version | HTML mis en cache | Vérifier `Cache-Control: no-cache` sur `.html` (§7) |
| Le service worker sert une page périmée | Ancien SW encore enregistré | DevTools → Application → Service Workers → *Unregister*, puis recharger |
| lftp : `server does not support or allow SSL` | FTPS indisponible sur ce cluster | Passer en SFTP (§4) — c'est ce que fait le workflow |
| lftp : le job reste bloqué puis expire | `ssh` attend la confirmation de l'empreinte du serveur | Vérifier que l'étape `ssh-keyscan` s'est exécutée et a écrit dans `~/.ssh/known_hosts` |
| lftp : `Login incorrect` en SFTP | SFTP non activé pour cet utilisateur | Manager → FTP-SSH → l'utilisateur doit avoir SSH coché |
| `GetPass() failed -- assume anonymous login` | lftp réclame un mot de passe qu'il n'a pas, et ne peut pas le demander | Définir `LFTP_PASSWORD` et utiliser `open -u "$UTILISATEUR" --env-password` |
| `Permission denied, please try again.` alors que les identifiants sont bons | Le serveur présente l'invite en `keyboard-interactive`, exclu par `PreferredAuthentications=password` seul | Ajouter `,keyboard-interactive` |
| Échec d'authentification, cause indéterminée | — | Lire la sortie de l'étape « Test d'authentification SFTP » : elle isole les identifiants de la configuration lftp |
| Un commentaire ajouté dans le script `lftp -c` casse le transfert | lftp traite l'apostrophe comme un délimiteur de chaîne | Ne mettre **aucun** commentaire dans le script lftp : les explications restent côté shell |
| lftp : `Login failed` | Mauvais secret, ou utilisateur FTP non propagé | Tester d'abord la connexion depuis un client FTP local |

---

## Récapitulatif de l'ordre des opérations

~~1. Zone DNS~~ ✅ · ~~2. Certificat SSL~~ ✅ · ~~3. Racine FTP~~ ✅ · ~~4. Secrets GitHub~~ ✅ ·
~~5. Workflow~~ ✅ · ~~6. `base: '/app/'` + manifeste~~ ✅

**Il ne reste que ceci :**

1. **Commiter et pousser** sur `main`. Le commit contient `vite.config.ts` (base + manifeste),
   `.github/workflows/deploy.yml`, `eslint.config.js`, `index.html` (noindex), `.gitignore`,
   `site/` et les deux documents. C'est une bascule : elle se relit avant d'être poussée.
2. **Dérouler la vérification du §7** — le workflow en automatise une partie, mais pas
   **le parcours PDF complet sous la CSP**, qui ne peut se tester qu'à la main.
3. Search Console, page de renvoi sur l'ancienne URL, liens sortants (§8).

Le premier déploiement remplacera la page « site en construction » actuellement servie. Si un
fichier résiduel d'OVH subsistait à la racine, la troisième passe du miroir (`--delete`) s'en
chargerait.
