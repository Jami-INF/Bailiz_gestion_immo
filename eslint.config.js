import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

/**
 * Configuration ESLint (flat config). Volontairement resserrée sur ce qui
 * attrape de vrais défauts - règles des hooks, imports/variables mortes,
 * promesses oubliées - sans imposer de style : le formatage reste libre.
 */
export default tseslint.config(
  /*
   * `site` est le site vitrine (Astro) : un projet distinct, avec sa propre
   * chaîne d'outils et ses propres types générés (`site/.astro/`). Le linter de
   * l'application n'a rien à y faire - il y signalerait des `any` dans des
   * fichiers qu'Astro réécrit à chaque build.
   */
  { ignores: ['dist', 'dev-dist', 'docs', 'node_modules', 'coverage', 'site'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.es2022 },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      /*
       * Règles du React Compiler laissées en avertissement : elles signalent
       * ici des synchronisations d'état légitimes (réinitialiser un formulaire
       * à l'ouverture d'une modale, amorcer la saisie depuis des données
       * chargées en asynchrone). Utile à surveiller, pas à bloquer.
       */
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/incompatible-library': 'warn',
      // Les variables préfixées d'un « _ » sont des ignorés volontaires.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // `any` est déjà absent du projet : on verrouille pour que ça le reste.
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['warn', { allow: ['error', 'warn'] }],
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
  {
    // Les tests peuvent utiliser les globales de Vitest et des données factices.
    files: ['**/*.test.{ts,tsx}'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off' },
  },
);
