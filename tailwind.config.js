/**
 * Charte visuelle de Bailiz — source unique.
 *
 * Le site vitrine (`site/src/styles/global.css`) reprend ces mêmes valeurs en
 * variables CSS : les deux surfaces doivent être manifestement le même produit,
 * sinon le passage de bailiz.fr à bailiz.fr/app ressemble à une sortie de site.
 * Toute retouche ici se répercute là-bas à la main — il n'y a que deux fichiers,
 * et les faire dépendre l'un de l'autre imposerait une étape de build commune
 * entre deux projets qui n'en partagent aucune.
 *
 * ## Intention
 *
 * « L'encre et le papier ». L'outil produit des documents qui seront imprimés,
 * signés, classés. Le vocabulaire visuel est celui d'un papier bien composé :
 * surfaces neutres tièdes, texte très contrasté, beaucoup de blanc, et une
 * seule couleur d'action employée avec parcimonie.
 *
 * ## Contrastes
 *
 * Toutes les paires réellement employées ont été mesurées avant d'être
 * retenues. Les combinaisons de texte atteignent AA (4,5:1) au minimum, la
 * plupart AAA. Les bordures de champs atteignent 3:1 sur blanc, comme l'exige
 * le critère WCAG 1.4.11 pour les limites de composants d'interface — ce que
 * l'ancienne palette (slate-300, 1,7:1) ne faisait pas.
 */

/** @type {import('tailwindcss').Config} */

/*
 * Familles sémantiques. Elles sont déclarées une fois puis exposées sous deux
 * noms : le nom sémantique (`danger`, à préférer dans tout code nouveau) et le
 * nom Tailwind d'origine (`red`), conservé parce que la centaine d'usages déjà
 * en place s'harmonise ainsi sans être réécrite. Les deux désignent le même
 * objet : aucune divergence possible.
 */
const danger = {
  50: '#FDF3F2', 100: '#FBE4E2', 200: '#F6C9C5', 300: '#EDA39C', 400: '#DF7166',
  500: '#CB4B3E', 600: '#B03728', 700: '#8E2B20', 800: '#70241C', 900: '#4E1913',
};
const warning = {
  50: '#FDF7EC', 100: '#FAEBCF', 200: '#F3D69C', 300: '#E8B85F', 400: '#D99A2B',
  500: '#BC7E14', 600: '#96630F', 700: '#734C0D', 800: '#573A0C', 900: '#3C2708',
};
const success = {
  50: '#F1F8F1', 100: '#DEEFDF', 200: '#BCDFBE', 300: '#8CC790', 400: '#5AA85F',
  500: '#3B8A41', 600: '#2C6E32', 700: '#245628', 800: '#1D4420', 900: '#143016',
};
const info = {
  50: '#F1F6FB', 100: '#DFEAF6', 200: '#BFD5ED', 300: '#8FB6DE', 400: '#5B93CB',
  500: '#3A76B4', 600: '#2B5D95', 700: '#234A77', 800: '#1D3C60', 900: '#152B44',
};

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /*
         * Neutre tiède. Le gris-bleu froid de Tailwind (slate) donnait à
         * l'application l'allure d'un tableau de bord générique ; une pointe de
         * chaleur la rapproche du document.
         */
        accent: {
          50: '#FAFAF9',
          100: '#F5F4F2',
          200: '#E8E6E2',
          300: '#D5D2CC',
          // 3,05:1 sur blanc : c'est la teinte des bordures de champs, et ce
          // seuil est celui qu'exige WCAG 1.4.11. Ne pas l'éclaircir.
          400: '#918C85',
          // 4,65:1 : le texte discret et les libellés de remplacement passent
          // AA. Ne pas l'éclaircir non plus.
          500: '#78746D',
          600: '#5A5751',
          700: '#413F3A',
          800: '#2B2925',
          900: '#1A1815',
        },
        /*
         * Marque. Un teal profond, franchement désaturé : le proptech français
         * est massivement bleu, et s'en écarter aide à être reconnu — sans
         * verser dans une couleur que personne n'oserait sur un document
         * juridique. `brand-600` porte les actions principales (6,4:1 avec du
         * blanc), `brand-700` les liens dans le texte (8,8:1).
         */
        brand: {
          50: '#F1F7F6', 100: '#DFEDEB', 200: '#BFDBD7', 300: '#8FBFB9', 400: '#5B9E97',
          500: '#3A817A', 600: '#2B6862', 700: '#22524E', 800: '#1C423F', 900: '#15302E',
        },
        danger, warning, success, info,
        red: danger, amber: warning, green: success, sky: info,
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      borderRadius: {
        // `lg` porte 97 usages : c'est lui qui donne le ton. 10 px arrondit
        // sans amollir — les documents produits sont à angles droits.
        lg: '0.625rem',
        xl: '0.875rem',
      },
      boxShadow: {
        /*
         * Ombres teintées du neutre plutôt que du noir pur : une ombre grise
         * sur une surface tiède se voit, et fait sale. Volontairement peu
         * nombreuses — l'élévation se dit ici par la bordure, pas par l'ombre.
         */
        sm: '0 1px 2px 0 rgb(26 24 21 / 0.05)',
        md: '0 2px 8px -2px rgb(26 24 21 / 0.08), 0 1px 2px 0 rgb(26 24 21 / 0.04)',
        lg: '0 8px 24px -6px rgb(26 24 21 / 0.12), 0 2px 6px -2px rgb(26 24 21 / 0.06)',
        xl: '0 16px 40px -12px rgb(26 24 21 / 0.18), 0 4px 10px -4px rgb(26 24 21 / 0.08)',
      },
      minHeight: { touch: '44px' },
      minWidth: { touch: '44px' },
    },
  },
  plugins: [],
};
