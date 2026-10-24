import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/*
 * Collection éditoriale, lot L5 du CDC (`docs/CDC-site-vitrine-seo.md` §7).
 *
 * Markdown plutôt que des pages `.astro` : un guide est du texte, et le faire
 * vivre dans un fichier `.md` permet de le corriger sans ouvrir un composant.
 * Le schéma, lui, est une barrière : le §7 impose une date de mise à jour
 * affichée et un lien vers l'outil concerné dans le corps du texte. `outil` est
 * donc obligatoire - une page qui ne mène à aucun outil n'a pas sa place ici.
 *
 * Une convention d'écriture, faute de pouvoir l'imposer par le schéma : les
 * tableaux s'écrivent en HTML, entourés d'un `<div class="tableau-defilant">`.
 * Une table Markdown nue élargit le document sur un téléphone, et c'est la
 * page qui défile latéralement au lieu du tableau.
 */
const guides = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/guides' }),
  schema: z.object({
    titre: z.string(),
    /** `<title>` de la page, soumis aux bornes du §8 (50-60 caractères). */
    titreSeo: z.string(),
    description: z.string(),
    /** Résumé affiché sur l'index, une phrase. */
    chapeau: z.string(),
    /** Affichée dans la page et reprise en `lastmod` du sitemap (§7). */
    misAJour: z.coerce.date(),
    /** Page outil vers laquelle le guide doit mener. */
    outil: z.string(),
    outilLibelle: z.string(),
    /** Ordre sur l'index : du plus utile au plus accessoire. */
    rang: z.number(),
  }),
});

export const collections = { guides };
