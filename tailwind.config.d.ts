/*
 * La charte est écrite en JavaScript parce que Tailwind la lit lui-même. Ce
 * fichier ne fait que décrire sa forme pour `src/lib/palette.test.ts`, qui
 * calcule les ratios de contraste des paires réellement employées : sans lui,
 * l'import remonte en `any` implicite et `noImplicitAny` échoue.
 */
declare const config: {
  theme: {
    extend: {
      colors: Record<string, Record<string, string> | string>;
    };
  };
};

export default config;
