// @ts-check
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

/*
 * Dates de mise à jour des guides, relues depuis leur frontmatter pour servir
 * de `lastmod` dans le sitemap.
 *
 * Pourquoi seulement les guides : la seule date disponible au build pour les
 * autres pages serait celle du build, identique partout et fausse presque
 * partout. Google écarte les `lastmod` qu'il juge peu fiables, et en déclarer
 * un faux sur un site qui vend l'exactitude serait le pire des deux mondes.
 * Les guides, eux, portent une vraie date - le §7 impose de l'afficher - et
 * c'est exactement celle-là qui est reprise ici. Une seule source, celle que
 * le lecteur voit en haut de l'article.
 */
const DOSSIER_GUIDES = fileURLToPath(new URL('./src/content/guides/', import.meta.url));

const datesGuides = Object.fromEntries(
  readdirSync(DOSSIER_GUIDES)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const brut = readFileSync(DOSSIER_GUIDES + f, 'utf8');
      const date = brut.match(/^misAJour:\s*(\d{4}-\d{2}-\d{2})/m);
      if (!date) throw new Error(`Guide sans date de mise à jour : ${f} (cf. CDC §7)`);
      return [`https://bailiz.fr/guides/${f.replace(/\.md$/, '')}/`, new Date(date[1])];
    }),
);

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

      serialize: (entree) => ({
        ...entree,
        lastmod: datesGuides[entree.url] ?? entree.lastmod,
      }),
    }),
  ],
});
