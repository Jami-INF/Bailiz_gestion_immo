/** Liens externes du projet, référencés par le pied de page et les mentions légales. */
export const LIEN_LINKEDIN = 'https://www.linkedin.com/in/jami-infante/';
export const LIEN_REPO = 'https://github.com/Jami-INF/Bailiz_gestion_immo';

/**
 * Site vitrine, en **absolu** et non en chemin relatif comme le pied de page.
 *
 * Les guides vivent hors du `scope` du service worker : un chemin relatif
 * fonctionnerait sur bailiz.fr et nulle part ailleurs - ni en développement, ni
 * depuis une application installée dont l'origine est la même mais le contexte
 * autonome. L'URL absolue ouvre le navigateur du système, ce qui est bien ce
 * qu'on veut pour un article qu'on lit et qu'on partage.
 */
export const LIEN_SITE = 'https://bailiz.fr';

/**
 * Guides publiés sur la vitrine.
 *
 * Ils ne sont **pas embarqués** dans l'application : c'est du contenu qui suit
 * la loi, et un article périmé dans un cache hors-ligne vaut moins que pas
 * d'article du tout. La liste est donc un simple maillage, à tenir à jour avec
 * `site/src/content/guides/`.
 */
export const GUIDES: { slug: string; titre: string }[] = [
  { slug: 'bail-meuble-duree-preavis-reconduction', titre: 'Bail meublé : durée, préavis et reconduction' },
  { slug: 'etat-des-lieux-opposable', titre: 'Que doit contenir un état des lieux pour être opposable ?' },
  { slug: 'etat-des-lieux-de-sortie-sans-litige', titre: 'État des lieux de sortie : comparer sans se disputer' },
  { slug: 'retenues-justifiables-depot-de-garantie', titre: 'Quelles retenues sur le dépôt de garantie sont justifiables ?' },
  { slug: 'appliquer-une-grille-de-vetuste', titre: 'Appliquer une grille de vétusté : trois cas chiffrés' },
  { slug: 'diagnostics-a-annexer-au-bail', titre: 'Les diagnostics à annexer au bail meublé' },
  { slug: 'pieces-du-dossier-de-location', titre: "Les pièces qu'un bailleur a le droit de demander" },
  { slug: 'colocation-un-bail-ou-plusieurs', titre: 'Colocation : un bail ou plusieurs ?' },
  { slug: 'encadrement-des-loyers', titre: 'Encadrement des loyers : suis-je concerné ?' },
  { slug: 'lmnp-ce-que-le-statut-change-au-bail', titre: 'LMNP : ce que le statut change pour le bail' },
];

/** URL complète d'un guide de la vitrine. */
export function lienGuide(slug: string): string {
  return `${LIEN_SITE}/guides/${slug}/`;
}

/**
 * Valide une URL saisie par l'utilisateur avant de l'ouvrir dans un lien ou de
 * l'encoder dans un QR code imprimé sur le bail. Seuls `http`/`https` sont
 * acceptés : un schéma `javascript:` ou `data:` deviendrait exécutable au clic,
 * et le QR code est destiné à être scanné par un tiers (le locataire).
 * Retourne l'URL normalisée, ou `undefined` si elle n'est pas sûre.
 */
export function urlExterneSure(url?: string): string | undefined {
  const brut = url?.trim();
  if (!brut) return undefined;
  // Sans schéma explicite, on suppose https (saisie courante « drive.google.com/… »).
  const candidat = /^[a-z][a-z0-9+.-]*:/i.test(brut) ? brut : `https://${brut}`;
  try {
    const u = new URL(candidat);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}
