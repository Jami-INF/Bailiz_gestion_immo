import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { db } from '@/lib/db';
import { EdlSynthesePage } from './EdlSynthesePage';
import { rendreRoute, semer, unEdl, utilisateur, viderBase } from '@/test/utils';

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
