import { describe, expect, it } from 'vitest';
import config from '../../tailwind.config.js';
import { COULEURS_ETAT } from '@/features/edl/couleursEtat';

/*
 * La charte, exécutable.
 *
 * `tailwind.config.js` documente déjà ses ratios en commentaires, et ces
 * commentaires étaient exacts - ils n'ont pourtant empêché ni l'un ni l'autre
 * des deux défauts trouvés à l'audit du 13/08/2026 :
 *
 * - `accent-500` était mesuré **sur blanc** alors que le fond réel de
 *   l'application est `accent-50` (`index.css`, `body`) : 4,65:1 annoncé,
 *   4,45:1 en vrai, donc sous AA sur les 116 usages qui comptent ;
 * - `COULEURS_ETAT` employait `emerald` et `lime`, deux familles absentes de la
 *   config, donc jamais soumises à l'audit : « Bon » donnait 1,98:1.
 *
 * Un commentaire ne peut attraper ni l'un ni l'autre : le premier est une
 * hypothèse implicite sur le fond, le second une couleur qui n'est pas dans le
 * fichier. Ce test attrape les deux, parce qu'il calcule les ratios des paires
 * **réellement employées** et refuse toute teinte hors palette.
 */

const couleurs = config.theme.extend.colors;

/** Résout `accent-500` en `#767268`. Rend `null` si la teinte n'existe pas. */
function teinte(nom: string): string | null {
  const sep = nom.lastIndexOf('-');
  if (sep === -1) return null;
  const famille = couleurs[nom.slice(0, sep)];
  if (typeof famille !== 'object') return null;
  return famille[nom.slice(sep + 1)] ?? null;
}

function luminance(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16);
  const canaux = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * canaux[0] + 0.7152 * canaux[1] + 0.0722 * canaux[2];
}

/** Ratio WCAG entre deux couleurs opaques, arrondi au centième. */
function contraste(a: string, b: string): number {
  const [clair, sombre] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Math.round(((clair + 0.05) / (sombre + 0.05)) * 100) / 100;
}

const BLANC = '#FFFFFF';
/** Le fond réel de la page, posé par `index.css` sur le `body`. */
const FOND = teinte('accent-50')!;

const AA = 4.5;
/** WCAG 1.4.11 : limites de composants d'interface (bordures de champs). */
const COMPOSANT = 3;

describe('contraste de la palette', () => {
  it('mesure juste - témoins connus', () => {
    expect(contraste(BLANC, '#000000')).toBe(21);
    expect(contraste(BLANC, BLANC)).toBe(1);
  });

  /*
   * Le texte discret : `hint` de champ, pied de page, résumés de cartes
   * repliables, compteurs du mode terrain. Il est presque toujours posé sur le
   * fond de page, jamais sur du blanc théorique - c'est cette ligne qui
   * verrouille la correction de L0.1.
   */
  it.each([
    ['accent-500', FOND],
    ['accent-500', BLANC],
    ['accent-600', FOND],
    ['accent-700', FOND],
    ['accent-800', FOND],
    ['accent-900', FOND],
  ])('%s atteint AA sur %s', (nom, fond) => {
    expect(contraste(teinte(nom)!, fond)).toBeGreaterThanOrEqual(AA);
  });

  it('accent-400 tient le seuil des limites de composants sur blanc', () => {
    // La teinte des bordures de champs. « Ne pas l'éclaircir » : voici pourquoi.
    expect(contraste(teinte('accent-400')!, BLANC)).toBeGreaterThanOrEqual(COMPOSANT);
  });

  /*
   * Les fonds pleins portant du texte blanc. `warning-600` est celui des
   * bandeaux de synchronisation : ils annoncent une modification écrasée, une
   * horloge décalée ou une autorisation expirée, et sont donc le pire endroit du
   * produit où être illisible.
   */
  it.each(['brand-600', 'brand-700', 'danger-600', 'warning-600', 'success-600'])(
    'du blanc sur %s atteint AA',
    (nom) => {
      expect(contraste(BLANC, teinte(nom)!)).toBeGreaterThanOrEqual(AA);
    },
  );
});

describe('barème d’état des lieux', () => {
  const teintesDuBareme = Object.entries(COULEURS_ETAT).map(([etat, classes]) => {
    const fond = classes.split(' ').find((c) => c.startsWith('bg-'))!.slice(3);
    const bordure = classes.split(' ').find((c) => c.startsWith('border-'))!.slice(7);
    return { etat, fond, bordure };
  });

  it.each(teintesDuBareme)('« $etat » : $fond est une teinte de la palette', ({ fond }) => {
    // Le vrai garde-fou : `emerald-600` et `lime-500` échouaient ici.
    expect(teinte(fond)).not.toBeNull();
  });

  it.each(teintesDuBareme)('« $etat » : le libellé blanc atteint AA', ({ fond }) => {
    expect(contraste(BLANC, teinte(fond)!)).toBeGreaterThanOrEqual(AA);
  });

  it.each(teintesDuBareme)('« $etat » : la bordure suit le fond', ({ fond, bordure }) => {
    expect(bordure).toBe(fond);
  });

  it('distingue les cinq états', () => {
    expect(new Set(teintesDuBareme.map((t) => t.fond)).size).toBe(5);
  });
});
