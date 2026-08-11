import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

export default defineConfig({
  /*
   * L'application est servie sous `bailiz.fr/app/`, la vitrine occupant la
   * racine (cf. `docs/CDC-site-vitrine-seo.md` §3.5). Un sous-répertoire et non
   * un sous-domaine : IndexedDB est cloisonné par origine, et c'est là que
   * vivent les baux, les états des lieux et les photos. Une seule origine pour
   * tout le domaine, c'est la garantie qu'aucune réorganisation ultérieure des
   * chemins ne fera perdre leurs données aux utilisateurs.
   *
   * Chemin absolu et non plus relatif : `./` était imposé par GitHub Pages, qui
   * servait l'application sous `/<nom-du-repo>/`.
   */
  base: '/app/',
  plugins: [
    react(),
    VitePWA({
      /*
       * `prompt` et non `autoUpdate` : la nouvelle version s'installe quand
       * l'utilisateur l'accepte (cf. `lib/majApp.ts`). En `autoUpdate`, le
       * service worker peut recharger la page au milieu d'un état des lieux
       * rempli sur tablette, devant le locataire.
       */
      registerType: 'prompt',
      includeAssets: ['icon.svg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // Aucun `runtimeCaching` : l'application ne charge rien depuis un
        // domaine tiers. La fonte Inter est auto-hébergée (cf. `src/index.css`)
        // et donc précachée comme le reste par `globPatterns`.
      },
      manifest: {
        name: 'Bailiz — Baux et états des lieux',
        short_name: 'Bailiz',
        description:
          'Bail meublé et états des lieux avec photos, hors ligne et sans compte',
        lang: 'fr',
        theme_color: '#22524E',
        background_color: '#FAFAF9',
        display: 'standalone',
        start_url: '/app/',
        scope: '/app/',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    /*
     * Deux régimes, choisis par l'extension du fichier :
     * - `.test.ts`  → node, pour la logique métier et la couche Dexie. Rapide,
     *   et rien n'y dépend d'un DOM.
     * - `.test.tsx` → jsdom, pour les écrans montés avec Testing Library.
     * Monter jsdom pour les 300 tests de `lib/` coûterait quelques secondes à
     * chaque exécution sans rien apporter.
     */
    environment: 'node',
    environmentMatchGlobs: [['src/**/*.test.tsx', 'jsdom']],
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    // Le rendu PDF (`renderToBuffer`) et les parcours d'écran sont lents.
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        // Points d'entrée et déclarations : rien à vérifier, tout à ignorer.
        'src/main.tsx',
        'src/App.tsx',
        'src/types.ts',
        'src/types/**',
        'src/**/index.ts',
        // Catalogues de contenu (clauses, mobilier, bibliothèque de pièces) :
        // des données, pas du comportement. Les couvrir gonflerait le taux sans
        // rien prouver — elles sont exercées indirectement par les tests PDF.
        'src/lib/defauts.ts',
      ],
      /*
       * Seuils volontairement différenciés, et calés sur le niveau atteint —
       * un seuil qu'on n'atteint pas est un seuil qu'on finit par baisser.
       *
       * Le plancher global reste modeste : `features/` est fait de vues, dont
       * une partie (écrans de paramétrage, panneaux de sauvegarde) coûterait
       * cher à tester pour ce qu'elle protège. Ce qui est verrouillé haut, c'est
       * le **cœur métier** : calculs légaux, comparaison d'états des lieux,
       * RGPD, recherche. Une régression y est invisible à l'écran et se
       * découvre sur un document déjà signé.
       *
       * `branches` est le chiffre le plus parlant ici : il mesure les cas
       * traités, pas les lignes traversées.
       */
      thresholds: {
        lines: 45,
        functions: 50,
        branches: 78,
        statements: 45,
        // Cœur métier : quasi-exhaustif, et il doit le rester.
        'src/lib/{bail,calculs,etat,recherche,rgpd,lettres,adresse,liens,erreurs,crypto,rotation,dates}.ts':
          {
            lines: 98,
            functions: 100,
            branches: 90,
            statements: 98,
          },
        // Synchronisation : la mécanique la plus délicate de l'application.
        'src/lib/sync/*.ts': {
          lines: 85,
          functions: 80,
          branches: 85,
          statements: 85,
        },
      },
    },
  },
});
