import type { Bail, Bien, Locataire } from '@/types';
import { TYPE_BAIL_LABELS } from '@/types';
import { getParametres } from '@/lib/db';
import { formatAdresse } from '@/lib/adresse';
import { ouvrirBlob } from '@/lib/backup';
import { rendrePdf } from '@/lib/pdf/generer';
import { ActeCautionnementPdf } from '@/lib/pdf/ActeCautionnementPdf';

/**
 * Acte de cautionnement solidaire (art. 22-1 de la loi n°89-462), avec ou sans
 * bail.
 *
 * Partagé entre la fiche d'un bail et la boîte à outils, qui produisaient le
 * même document par deux chemins. Le `contexte` est **facultatif** par nature
 * juridique, pas par commodité : ce qui engage la caution est sa mention
 * manuscrite et sa signature, pas le pré-remplissage. Un modèle vierge imprimé
 * et complété à la main est aussi valable - `ActeCautionnementPdf` laisse
 * précisément une zone pointillée partout où la donnée manque.
 *
 * Simplement ouvert, et non archivé : tant qu'il n'est pas signé, ce n'est pas
 * une pièce du dossier.
 */
export async function ouvrirActeCautionnement(contexte?: {
  bail: Bail;
  bien: Bien;
  locataires: Locataire[];
}): Promise<void> {
  const parametres = await getParametres();
  // La caution visée est la première personne physique : Visale est un
  // organisme, son cautionnement est émis par Action Logement et ne se
  // pré-remplit pas ici.
  const avecCaution = contexte?.locataires.find((l) => l.garant && l.garant.type !== 'visale');
  const cible = avecCaution ?? contexte?.locataires[0];
  const adresse = contexte ? formatAdresse(contexte.bien.adresse) : '';
  const bail = contexte?.bail;

  const blob = await rendrePdf(
    <ActeCautionnementPdf
      bailleur={parametres.bailleur}
      garant={avecCaution?.garant}
      locataireNom={cible ? `${cible.prenom} ${cible.nom}`.trim() : undefined}
      bienAdresse={adresse || undefined}
      loyerHC={bail?.loyerHC}
      charges={bail?.charges.montant}
      typeBailLabel={bail ? TYPE_BAIL_LABELS[bail.typeBail] : undefined}
      dureeMois={bail?.dureeMois}
    />,
  );

  const g = avecCaution?.garant;
  const nomGarant = g ? `${g.prenom ?? ''} ${g.nom ?? ''}`.trim() : '';
  ouvrirBlob(blob, `Acte de cautionnement${nomGarant ? ` - ${nomGarant}` : ''}.pdf`);
}
