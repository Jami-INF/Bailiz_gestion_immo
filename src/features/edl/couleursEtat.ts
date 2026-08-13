import type { EtatNote } from '@/types';

/*
 * Barème d'état, sur le modèle de l'étiquette DPE : trois verts pour les états
 * satisfaisants, ambre pour l'usure, rouge pour le défaut. C'est une échelle que
 * le public français lit sans légende.
 *
 * Toutes les teintes viennent des familles mesurées de `tailwind.config.js`.
 * L'ancien barème employait `emerald` et `lime`, absents de la config, donc
 * jamais soumis à l'audit de contraste : « Bon » sur `lime-500` donnait 1,98:1
 * en texte blanc - illisible en plein jour sur une tablette, exactement la
 * situation d'usage. Les nuances 500 sont exclues d'office (`success-500` à
 * 4,29:1, `warning-500` à 3,42:1) : seules les 600 et au-delà passent AA.
 *
 * Le faible écart entre paliers voisins est sans conséquence : seul le bouton
 * sélectionné est coloré, et le libellé texte est toujours affiché.
 *
 * Dans un fichier à part de `EdlTerrainPage` pour que `palette.test.ts` puisse
 * l'importer sans monter la page : le barème est une donnée de charte, et c'est
 * ce test qui empêche une couleur hors palette d'y revenir.
 */
export const COULEURS_ETAT: Record<EtatNote, string> = {
  neuf: 'bg-success-800 border-success-800', // 11,05:1 avec du blanc
  tres_bon: 'bg-success-700 border-success-700', // 8,62:1
  bon: 'bg-success-600 border-success-600', // 6,21:1
  usage: 'bg-warning-600 border-warning-600', // 5,14:1
  mauvais: 'bg-danger-600 border-danger-600', // 6,13:1
};
