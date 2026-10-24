/*
 * Génère les images bitmap que le HTML référence mais qu'aucun build ne produit :
 * l'image de partage Open Graph et le jeu d'icônes.
 *
 * À exécuter à la main (`npm run images`) quand la marque ou le message
 * changent - pas à chaque build : ces fichiers sont versionnés, et les
 * regénérer à l'identique à chaque déploiement ne ferait que du bruit dans git.
 *
 * `sharp` est déjà présent : Astro en dépend pour son pipeline d'images.
 */
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));

/*
 * Jetons repris de `src/styles/global.css`, qui les tient lui-même de
 * `tailwind.config.js`. Ces valeurs étaient restées au slate d'origine
 * (`#334155`) après la refonte du 11 août (CDC §13.1) : l'image de partage
 * annonçait un site qui n'existait plus. C'est la première chose - souvent la
 * seule - qu'on voit d'un lien partagé.
 */
const ENCRE = '#22524E'; // --m-700
const MARQUE = '#2B6862'; // --m-600
const PAPIER = '#FAFAF9'; // --c-50
const TEXTE = '#1A1815'; // --c-900
const DISCRET = '#78746D'; // --c-500

/** Logo Bailiz, identique à `public/icon.svg` ici et dans l'application. */
const logo = `<rect width="512" height="512" rx="112" fill="${ENCRE}"/>
  <path d="M256 96 96 224v192h112v-96h96v96h112V224Z" fill="${PAPIER}"/>
  <rect x="232" y="272" width="48" height="48" rx="8" fill="${ENCRE}"/>`;

const icone = (taille) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${taille}" height="${taille}">
  ${logo}
</svg>`;

/*
 * Image de partage. Pas de photo, pas d'effet : elle est le plus souvent vue en
 * vignette dans un fil, où seul le texte court reste lisible.
 */
const partage = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#ffffff"/>
  <rect x="0" y="0" width="1200" height="12" fill="${MARQUE}"/>
  <g transform="translate(96, 150)">
    <svg x="0" y="0" width="88" height="88" viewBox="0 0 512 512">${logo}</svg>
    <text x="110" y="64" font-family="Inter, system-ui, sans-serif" font-size="52"
          font-weight="800" fill="${TEXTE}" letter-spacing="-1.5">Bailiz</text>
  </g>
  <text x="96" y="360" font-family="Inter, system-ui, sans-serif" font-size="62"
        font-weight="800" fill="${TEXTE}" letter-spacing="-2">Bail meublé et état des lieux</text>
  <text x="96" y="436" font-family="Inter, system-ui, sans-serif" font-size="62"
        font-weight="800" fill="${TEXTE}" letter-spacing="-2">gratuits et sans compte</text>
  <text x="96" y="514" font-family="Inter, system-ui, sans-serif" font-size="30"
        font-weight="400" fill="${DISCRET}">Vos données restent sur votre appareil · bailiz.fr</text>
</svg>`;

/*
 * Un `.ico` contenant un PNG, et non les bitmaps bruts d'autrefois : le format
 * l'admet depuis Windows Vista, et tout ce qui réclame encore un `favicon.ico`
 * le lit. Vingt-deux octets d'en-tête suffisent, ce qui évite une dépendance
 * de plus pour un fichier que seuls de vieux agrégateurs vont chercher.
 */
function ico(png, taille) {
  const entete = Buffer.alloc(22);
  entete.writeUInt16LE(0, 0); // réservé
  entete.writeUInt16LE(1, 2); // type : icône
  entete.writeUInt16LE(1, 4); // une seule image
  entete.writeUInt8(taille < 256 ? taille : 0, 6); // 0 signifie 256
  entete.writeUInt8(taille < 256 ? taille : 0, 7);
  entete.writeUInt8(0, 8); // palette
  entete.writeUInt8(0, 9); // réservé
  entete.writeUInt16LE(1, 10); // plans
  entete.writeUInt16LE(32, 12); // bits par pixel
  entete.writeUInt32LE(png.length, 14);
  entete.writeUInt32LE(22, 18); // décalage des données
  return Buffer.concat([entete, png]);
}

await mkdir(PUBLIC, { recursive: true });

await sharp(Buffer.from(partage)).png().toFile(`${PUBLIC}og.png`);
await sharp(Buffer.from(icone(180))).png().toFile(`${PUBLIC}apple-touch-icon.png`);
await sharp(Buffer.from(icone(192))).png().toFile(`${PUBLIC}icon-192.png`);
await sharp(Buffer.from(icone(512))).png().toFile(`${PUBLIC}icon-512.png`);

const png32 = await sharp(Buffer.from(icone(32))).png().toBuffer();
await writeFile(`${PUBLIC}favicon.ico`, ico(png32, 32));

console.log(
  'Écrit : og.png (1200×630), apple-touch-icon.png (180), icon-192.png, icon-512.png, favicon.ico (32)',
);
