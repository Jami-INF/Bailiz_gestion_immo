/*
 * Génère les images bitmap que le HTML référence mais qu'aucun build ne produit :
 * l'image de partage Open Graph et l'icône iOS.
 *
 * À exécuter à la main (`npm run images`) quand la marque ou le message
 * changent - pas à chaque build : ces fichiers sont versionnés, et les
 * regénérer à l'identique à chaque déploiement ne ferait que du bruit dans git.
 *
 * `sharp` est déjà présent : Astro en dépend pour son pipeline d'images.
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));

const ARDOISE = '#334155';
const CLAIR = '#f8fafc';

/** Logo Bailiz, identique à `public/icon.svg` de l'application. */
const logo = (taille) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${taille}" height="${taille}">
  <rect width="512" height="512" rx="96" fill="${ARDOISE}"/>
  <path d="M256 96 96 224v192h112v-96h96v96h112V224Z" fill="${CLAIR}"/>
  <rect x="232" y="272" width="48" height="48" rx="6" fill="${ARDOISE}"/>
</svg>`;

/*
 * Image de partage. Pas de photo, pas d'effet : elle est le plus souvent vue en
 * vignette dans un fil, où seul le texte court reste lisible.
 */
const partage = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#ffffff"/>
  <rect x="0" y="0" width="1200" height="12" fill="${ARDOISE}"/>
  <g transform="translate(96, 150)">
    <svg x="0" y="0" width="88" height="88" viewBox="0 0 512 512">
      <rect width="512" height="512" rx="96" fill="${ARDOISE}"/>
      <path d="M256 96 96 224v192h112v-96h96v96h112V224Z" fill="${CLAIR}"/>
      <rect x="232" y="272" width="48" height="48" rx="6" fill="${ARDOISE}"/>
    </svg>
    <text x="110" y="64" font-family="Inter, system-ui, sans-serif" font-size="52"
          font-weight="800" fill="#0f172a" letter-spacing="-1.5">Bailiz</text>
  </g>
  <text x="96" y="360" font-family="Inter, system-ui, sans-serif" font-size="62"
        font-weight="800" fill="#0f172a" letter-spacing="-2">Bail meublé et état des lieux</text>
  <text x="96" y="436" font-family="Inter, system-ui, sans-serif" font-size="62"
        font-weight="800" fill="#0f172a" letter-spacing="-2">gratuits et sans compte</text>
  <text x="96" y="514" font-family="Inter, system-ui, sans-serif" font-size="30"
        font-weight="400" fill="#475569">Vos données restent sur votre appareil · bailiz.fr</text>
</svg>`;

await mkdir(PUBLIC, { recursive: true });

await sharp(Buffer.from(partage)).png().toFile(`${PUBLIC}og.png`);
await sharp(Buffer.from(logo(180))).png().toFile(`${PUBLIC}apple-touch-icon.png`);

console.log('Écrit : public/og.png (1200×630), public/apple-touch-icon.png (180×180)');
