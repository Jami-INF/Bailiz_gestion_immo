// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

/*
 * Site vitrine de Bailiz - cf. `docs/CDC-site-vitrine-seo.md`.
 *
 * Deux surfaces sur une seule origine : cette vitrine est servie à la racine de
 * bailiz.fr, l'application (build Vite) sous `/app/`. Une seule origine, donc un
 * seul IndexedDB : les données des utilisateurs survivent à toute réorganisation
 * ultérieure des chemins (cf. CDC §3.5).
 */
export default defineConfig({
  site: 'https://bailiz.fr',

  // Slash final partout, et une seule forme d'URL : le contraire fabrique des
  // doublons que le canonique doit ensuite rattraper.
  trailingSlash: 'always',

  build: {
    format: 'directory',

    // Feuille de style injectée dans le HTML plutôt que servie à part. Le HTML
    // de la vitrine est en `no-cache` (CDC §9.3) : un fichier CSS séparé ne
    // serait donc jamais réutilisé d'une visite à l'autre par un nouveau
    // visiteur, et coûterait un aller-retour bloquant avant le premier rendu -
    // précisément sur la visite qui décide du LCP. Six kilo-octets, moins de
    // deux une fois compressés : le seuil par défaut d'Astro (4 ko) passe juste
    // à côté.
    inlineStylesheets: 'always',
  },

  integrations: [
    sitemap({
      // `/app/` n'a rien à faire dans le sitemap : l'application est en
      // `noindex` (CDC §8). Astro ne la connaît pas - elle est assemblée au
      // déploiement - mais le filtre documente l'intention et protège d'un
      // ajout futur.
      filter: (page) => !page.includes('/app/'),
    }),
  ],
});
