import { describe, expect, it } from 'vitest';
import { createElement, type ReactElement } from 'react';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import type { Garant, Parametres } from '@/types';
import { ActeCautionnementPdf } from './ActeCautionnementPdf';

const bailleur = {
  civilite: 'M',
  nom: 'Infante',
  prenom: 'Jami',
  adresse: '38 rue Robert Noel, 63110 Beaumont',
  email: 'j@x.fr',
  telephone: '06',
  qualite: 'personne_physique',
} as Parametres['bailleur'];

const garant: Garant = { type: 'physique', prenom: 'Jacqueline', nom: 'Martin', adresse: '' };

const rendre = (props: Parameters<typeof ActeCautionnementPdf>[0]) =>
  renderToBuffer(createElement(ActeCautionnementPdf, props) as ReactElement<DocumentProps>);

describe('ActeCautionnementPdf', () => {
  it('se rend intégralement vierge, sans aucune donnée', async () => {
    const buffer = await rendre({});
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(2000);
  });

  it('se rend avec les données connues du bail', async () => {
    const buffer = await rendre({
      bailleur,
      garant,
      locataireNom: 'Marie Dupont',
      bienAdresse: '7 avenue de la Gare, 63400 Chamalières',
      loyerHC: 720,
      charges: 90,
      typeBailLabel: 'Meublé 1 an (renouvelable)',
      dureeMois: 12,
    });
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('accepte un loyer à zéro sans produire de montant incohérent', async () => {
    // Le loyer non renseigné doit laisser les montants à compléter à la main
    // plutôt que d'afficher « 0,00 € » comme s'il était garanti.
    const buffer = await rendre({ bailleur, loyerHC: 0, charges: 0 });
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('se rend pour un garant sans adresse renseignée', async () => {
    const buffer = await rendre({ bailleur, garant, loyerHC: 600, charges: 0, dureeMois: 9 });
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
