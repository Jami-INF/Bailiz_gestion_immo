import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { db } from '@/lib/db';
import { EdlSynthesePage } from './EdlSynthesePage';
import { rendreRoute, semer, unEdl, utilisateur, viderBase } from '@/test/utils';

/**
 * La génération réelle produit un PDF : ce qu'on veut vérifier ici, c'est le
 * décompte qui lui est remis, pas son rendu. On intercepte donc l'archivage et
 * on lit les retenues passées à la lettre.
 */
const archivage = vi.hoisted(() => vi.fn());
vi.mock('@/lib/pdf/generer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/pdf/generer')>()),
  genererEtArchiver: archivage,
}));

/** Retenues remises à la lettre lors du dernier archivage. */
function retenuesDeLaLettre() {
  const appels = archivage.mock.calls;
  const args = appels[appels.length - 1][0] as {
    element: (r: string) => { props: Record<string, unknown> };
  };
  return args.element('DOC-2026-0001').props;
}

beforeEach(async () => {
  vi.useRealTimers();
  await viderBase();
});

/** EDL de sortie portant une dégradation, seul cas où la synthèse s'affiche. */
function uneSortieDegradee() {
  const edl = unEdl({ type: 'sortie' });
  edl.pieces[0].elements[0] = {
    ...edl.pieces[0].elements[0],
    etatEntree: 'bon',
    etat: 'mauvais',
    degradation: true,
  };
  return edl;
}

const GRILLE = [{ poste: 'Peinture', dureeVieAnnees: 10, franchiseAnnees: 2, abattementAnnuelPct: 10 }];

function rendreSynthese() {
  return rendreRoute('/edl/:id/synthese', <EdlSynthesePage />, '/edl/edl-1/synthese');
}

describe('estimation des retenues', () => {
  /**
   * Les champs d'estimation n'écrivent qu'au `blur`, et la liste « Poste » est
   * juste à côté : la quitter d'un clic enchaîne `blur` puis `change` plus vite
   * que l'aller-retour IndexedDB qui rafraîchit la page. Les deux écritures
   * partaient du même instantané et la seconde effaçait la première - le coût
   * saisi disparaissait au moment de choisir le poste de vétusté.
   */
  it('conserve le coût saisi quand on choisit le poste de vétusté juste après', async () => {
    const u = utilisateur();
    await semer({ edl: uneSortieDegradee(), parametres: { grilleVetuste: GRILLE } });
    rendreSynthese();

    const cout = await screen.findByLabelText('Coût de remise en état (€)');
    await u.type(cout, '480');
    // Clic direct sur la liste voisine, sans passer par un autre champ.
    await u.selectOptions(screen.getByLabelText('Poste (grille de vétusté)'), 'Peinture');

    await vi.waitFor(async () => {
      const el = (await db.edls.get('edl-1'))!.pieces[0].elements[0];
      expect(el.posteVetuste).toBe('Peinture');
    });
    const el = (await db.edls.get('edl-1'))!.pieces[0].elements[0];
    expect(el.coutRemiseEnEtat).toBe(480);
  });

  it('conserve l’âge saisi quand on enchaîne sur le poste de vétusté', async () => {
    const u = utilisateur();
    const edl = uneSortieDegradee();
    edl.pieces[0].elements[0].coutRemiseEnEtat = 480;
    await semer({ edl, parametres: { grilleVetuste: GRILLE } });
    rendreSynthese();

    await u.type(await screen.findByLabelText("Âge de l'équipement (années)"), '4');
    await u.selectOptions(screen.getByLabelText('Poste (grille de vétusté)'), 'Peinture');

    await vi.waitFor(async () => {
      const el = (await db.edls.get('edl-1'))!.pieces[0].elements[0];
      expect(el.posteVetuste).toBe('Peinture');
    });
    const el = (await db.edls.get('edl-1'))!.pieces[0].elements[0];
    expect(el.ageEquipementAnnees).toBe(4);
    expect(el.coutRemiseEnEtat).toBe(480);
  });
});

describe('dépôt de garantie saisi faute de bail enregistré', () => {
  it('enregistre le montant sur l’état des lieux', async () => {
    const u = utilisateur();
    // Sans `bailId`, c'est l'EDL qui porte le dépôt - et le champ n'apparaît
    // que tant qu'aucun montant n'est connu.
    const edl = uneSortieDegradee();
    edl.bailId = undefined;
    await semer({ edl, parametres: { grilleVetuste: GRILLE } });
    rendreSynthese();

    await u.type(await screen.findByLabelText('Dépôt de garantie versé (€)'), '1500');
    await u.tab();

    await vi.waitFor(async () => {
      expect((await db.edls.get('edl-1'))!.depotGarantie).toBe(1500);
    });
  });
});

describe('lettre de restitution', () => {
  /**
   * Le PDF est archivé dans les Documents et porte le décompte opposable au
   * locataire. Il se calculait sur l'instantané de rendu : cliquer sur le
   * bouton depuis le champ « Coût » qu'on venait de remplir l'enchaînait au
   * `blur` plus vite que le rafraîchissement de la page, et la lettre partait
   * sur les chiffres d'avant la saisie - un décompte à 0 € de retenues.
   */
  it('part du coût qu’on vient de saisir, pas de celui affiché au rendu', async () => {
    const u = utilisateur();
    archivage.mockClear();
    await semer({ edl: uneSortieDegradee(), parametres: { grilleVetuste: GRILLE } });
    rendreSynthese();

    await u.type(await screen.findByLabelText('Coût de remise en état (€)'), '480');
    // Clic direct sur « Générer », sans passer par un autre champ.
    await u.click(screen.getByRole('button', { name: /Générer la lettre/ }));

    await vi.waitFor(() => expect(archivage).toHaveBeenCalled());
    expect(retenuesDeLaLettre().retenues).toEqual([
      expect.objectContaining({ elementNom: 'Sol', cout: 480, retenue: 480 }),
    ]);
  });

  it('part du dépôt de garantie qu’on vient de saisir', async () => {
    const u = utilisateur();
    archivage.mockClear();
    const edl = uneSortieDegradee();
    edl.bailId = undefined;
    edl.pieces[0].elements[0].coutRemiseEnEtat = 200;
    await semer({ edl, parametres: { grilleVetuste: GRILLE } });
    rendreSynthese();

    await u.type(await screen.findByLabelText('Dépôt de garantie versé (€)'), '1500');
    await u.click(screen.getByRole('button', { name: /Générer la lettre/ }));

    await vi.waitFor(() => expect(archivage).toHaveBeenCalled());
    expect(retenuesDeLaLettre().depotGarantie).toBe(1500);
  });
});

describe('double-clic sur « Générer la lettre »', () => {
  /**
   * Chaque génération tire une référence neuve et archive un document : deux
   * clics produisaient deux lettres et consommaient deux numéros, que le
   * dédoublonnage par référence d'`enregistrerDocument` ne pouvait pas
   * rapprocher. Le bouton doit se désarmer le temps de l'opération.
   */
  it('n’archive qu’une seule lettre', async () => {
    const u = utilisateur();
    archivage.mockClear();
    // Génération lente, comme sur une tablette : la fenêtre du second clic.
    archivage.mockImplementation(() => new Promise((r) => setTimeout(r, 80)));
    const edl = uneSortieDegradee();
    edl.pieces[0].elements[0].coutRemiseEnEtat = 300;
    await semer({ edl, parametres: { grilleVetuste: GRILLE } });
    rendreSynthese();

    const bouton = await screen.findByRole('button', { name: /Générer la lettre/ });
    await u.click(bouton);
    await u.click(bouton);

    await vi.waitFor(() => expect(archivage).toHaveBeenCalled());
    expect(archivage).toHaveBeenCalledTimes(1);
    archivage.mockReset();
  });

  it('réarme le bouton quand la génération échoue', async () => {
    // Un verrou qui ne se relâche pas serait une panne pire que le double-clic.
    const u = utilisateur();
    const erreurs = vi.spyOn(console, 'error').mockImplementation(() => {});
    archivage.mockClear();
    archivage.mockRejectedValueOnce(new DOMException('quota', 'QuotaExceededError'));
    const edl = uneSortieDegradee();
    edl.pieces[0].elements[0].coutRemiseEnEtat = 300;
    await semer({ edl, parametres: { grilleVetuste: GRILLE } });
    rendreSynthese();

    const bouton = await screen.findByRole('button', { name: /Générer la lettre/ });
    await u.click(bouton);
    await vi.waitFor(() => expect(bouton).toBeEnabled());

    // Et une seconde tentative part bien.
    archivage.mockResolvedValueOnce(undefined);
    await u.click(bouton);
    await vi.waitFor(() => expect(archivage).toHaveBeenCalledTimes(2));

    archivage.mockReset();
    erreurs.mockRestore();
  });
});
