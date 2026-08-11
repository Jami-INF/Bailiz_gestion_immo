/**
 * Le logo Bailiz, dessiné une fois.
 *
 * Le même glyphe est repris dans `public/icon.svg` (favicon, icône PWA) et dans
 * l'en-tête du site vitrine (`site/src/layouts/Base.astro`). Avant cela, la
 * barre latérale affichait une icône `Building2` de Lucide : l'application, le
 * favicon et la vitrine montraient donc trois dessins différents pour un seul
 * produit.
 *
 * Inline plutôt qu'un `<img src="icon.svg">` : les teintes suivent ainsi la
 * charte sans qu'il faille maintenir un second fichier, et rien n'est chargé.
 */
export function Logo({ taille = 36 }: { taille?: number }) {
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 512 512"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    >
      <rect width="512" height="512" rx="112" className="fill-brand-700" />
      <path d="M256 96 96 224v192h112v-96h96v96h112V224Z" className="fill-accent-50" />
      <rect x="232" y="272" width="48" height="48" rx="8" className="fill-brand-700" />
    </svg>
  );
}
