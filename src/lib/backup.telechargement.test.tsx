import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ouvrirBlob, telechargerBlob } from './backup';

/*
 * Le téléchargement d'un document généré.
 *
 * Défaut corrigé : l'ancre de téléchargement n'était jamais insérée dans le
 * document. Chrome l'accepte détachée, **Safari non** - et Safari, c'est l'iPad,
 * la cible principale du produit. Le `download` était alors ignoré, le
 * navigateur naviguait vers l'URL `blob:` (sans nom ni extension), et le bail
 * atterrissait dans les téléchargements sous un identifiant opaque auquel
 * l'appareil inventait un type - une archive, le plus souvent.
 *
 * Ces tests observent donc ce que jsdom ne vérifie pas tout seul : **où** se
 * trouve l'ancre à l'instant du clic.
 */

/** Ancres cliquées, avec leur état d'attachement **au moment du clic**. */
let clics: { nom: string; attachee: boolean; href: string }[];
let clicOriginal: () => void;

beforeEach(() => {
  clics = [];
  clicOriginal = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    clics.push({
      nom: this.download,
      attachee: this.isConnected,
      href: this.href,
    });
  };
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => 'blob:test/123'),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  HTMLAnchorElement.prototype.click = clicOriginal;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const unPdf = () => new Blob(['%PDF'], { type: 'application/pdf' });

describe('téléchargement d’un document', () => {
  it('clique une ancre attachée au document, sous le nom demandé', () => {
    telechargerBlob(unPdf(), 'BAIL-2026-0001 - Bail meublé.pdf');

    expect(clics).toHaveLength(1);
    // Le cœur du correctif : détachée, Safari ignore `download`.
    expect(clics[0].attachee).toBe(true);
    expect(clics[0].nom).toBe('BAIL-2026-0001 - Bail meublé.pdf');
  });

  it('ne laisse aucune ancre derrière elle', () => {
    telechargerBlob(unPdf(), 'document.pdf');
    expect(document.querySelectorAll('a[download]')).toHaveLength(0);
  });

  it('ouvre un onglet quand le navigateur l’autorise, sans rien télécharger', () => {
    vi.spyOn(window, 'open').mockReturnValue({} as Window);

    ouvrirBlob(unPdf(), 'document.pdf');

    expect(window.open).toHaveBeenCalledWith('blob:test/123', '_blank');
    expect(clics).toHaveLength(0);
  });

  /*
   * Le repli n'a rien d'exceptionnel : vérifié dans un vrai navigateur, la
   * fenêtre est refusée y compris sur un clic utilisateur authentique. C'est le
   * chemin emprunté la plupart du temps.
   */
  it('retombe sur un téléchargement nommé quand la fenêtre est bloquée', () => {
    vi.spyOn(window, 'open').mockReturnValue(null);

    ouvrirBlob(unPdf(), 'EDL-2026-0001 - État des lieux (signé).pdf');

    expect(clics).toHaveLength(1);
    expect(clics[0].attachee).toBe(true);
    expect(clics[0].nom).toBe('EDL-2026-0001 - État des lieux (signé).pdf');
  });
});
