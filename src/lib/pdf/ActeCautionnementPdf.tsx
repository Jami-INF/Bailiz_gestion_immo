import { Document, Page, Text, View } from '@react-pdf/renderer';
import type { Garant, Parametres } from '@/types';
import { formatEuros } from '@/lib/calculs';
import { montantEnLettres } from '@/lib/lettres';
import { EntetePdf, PiedDePagePdf, Rempl, pdfStyles as s } from './commun';
import { nomBailleur } from '@/lib/bailleur';

interface Props {
  bailleur?: Parametres['bailleur'];
  garant?: Garant;
  locataireNom?: string;
  bienAdresse?: string;
  /** Loyer hors charges : repris seulement s'il est renseigné (> 0). */
  loyerHC?: number;
  charges?: number;
  typeBailLabel?: string;
  dureeMois?: number;
}

/**
 * Acte de cautionnement solidaire (caution personne physique) — art. 22-1 de la
 * loi n°89-462 du 6 juillet 1989. Reprend les éléments connus du bail ; tout ce
 * qui manque devient une zone pointillée à compléter à la main après impression.
 * Ne s'applique pas à la garantie Visale, dont le contrat de cautionnement est
 * émis par Action Logement.
 */
export function ActeCautionnementPdf(props: Props) {
  return (
    <Document title="Acte de cautionnement solidaire" language="fr">
      <ActeCautionnementPage {...props} />
    </Document>
  );
}

/**
 * La page de l'acte, isolée de son `Document` : elle est aussi **jointe à la
 * fiche de visite** quand le candidat se présente avec un garant personne
 * physique, pré-remplie avec ce que le logement connaît déjà (bailleur,
 * adresse, loyer et charges).
 */
export function ActeCautionnementPage({
  bailleur,
  garant,
  locataireNom,
  bienAdresse,
  loyerHC,
  charges,
  typeBailLabel,
  dureeMois,
}: Props) {
  const nomCaution = garant ? `${garant.prenom ?? ''} ${garant.nom ?? ''}`.trim() : '';
  const designation = bailleur ? nomBailleur(bailleur) : '';
  // Les montants ne sont repris que si le loyer est réellement renseigné.
  const loyerConnu = typeof loyerHC === 'number' && loyerHC > 0;
  const charge = charges ?? 0;
  const total = loyerConnu ? loyerHC + charge : undefined;

  return (
    <Page size="A4" style={s.page}>
      <EntetePdf reference="Acte de cautionnement" docTitre="Acte de cautionnement" />
      <View style={s.titreBloc}>
        <Text style={s.titre}>Acte de cautionnement solidaire</Text>
        <Text style={s.sousTitre}>
          Article 22-1 de la loi n°89-462 du 6 juillet 1989 — engagement de caution d'un bail
          d'habitation{typeBailLabel ? ` (${typeBailLabel})` : ''}. À compléter à la main et à
          signer après impression.
        </Text>
      </View>

      <Text style={s.h2}>Parties</Text>
      <Text style={s.p}>
        <Text style={s.gras}>La caution</Text> : <Rempl v={nomCaution} brouillon taille={30} />,
        demeurant <Rempl v={garant?.adresse} brouillon taille={40} />.
      </Text>
      <Text style={s.p}>
        <Text style={s.gras}>Le bailleur</Text> : <Rempl v={designation} brouillon taille={30} />,
        demeurant <Rempl v={bailleur?.adresse} brouillon taille={40} />.
      </Text>
      <Text style={s.p}>
        <Text style={s.gras}>Le locataire cautionné</Text> :{' '}
        <Rempl v={locataireNom} brouillon taille={30} />, pour le logement situé{' '}
        <Rempl v={bienAdresse} brouillon taille={40} />.
      </Text>

      <Text style={s.h2}>Objet et étendue de l'engagement</Text>
      <Text style={s.p}>
        La caution déclare se porter caution <Text style={s.gras}>solidaire</Text> du locataire
        désigné ci-dessus envers le bailleur, pour l'exécution de toutes les obligations résultant
        du bail : paiement des loyers, des charges et de leurs révisions, des réparations
        locatives, des indemnités d'occupation, ainsi que de tous intérêts, frais et accessoires.
        Étant solidaire, la caution renonce au bénéfice de discussion et de division : le bailleur
        peut la poursuivre sans agir d'abord contre le locataire.
      </Text>

      <Text style={s.h2}>Montant garanti</Text>
      {/* Montants connus : une seule chaîne, car react-pdf rogne les espaces aux
          jointures entre nœuds de texte (le mot suivant se collerait au montant).
          Montants inconnus : zones pointillées à compléter à la main. */}
      {loyerConnu ? (
        <Text style={s.p}>
          {`Le loyer mensuel s'élève à ${formatEuros(loyerHC)} hors charges (en toutes lettres : ` +
            `${montantEnLettres(loyerHC)}), auquel s'ajoutent ${formatEuros(charge)} de charges, ` +
            `soit un total mensuel de ${formatEuros(total!)}.`}
        </Text>
      ) : (
        <Text style={s.p}>
          Le loyer mensuel s'élève à <Rempl v="" brouillon taille={12} /> hors charges (en toutes
          lettres :{' '}
          <Rempl v="" brouillon taille={40} />), auquel s'ajoutent{' '}
          <Rempl v="" brouillon taille={12} /> de charges, soit un total mensuel de{' '}
          <Rempl v="" brouillon taille={12} />.
        </Text>
      )}
      <Text style={s.p}>
        Le loyer est révisable annuellement selon l'indice de référence des loyers (IRL) publié
        par l'INSEE ; le cautionnement s'étend aux montants révisés.
      </Text>

      <Text style={s.h2}>Durée de l'engagement</Text>
      <Text style={s.p}>
        Le présent cautionnement est consenti pour la durée initiale du bail (
        <Rempl v={dureeMois} brouillon taille={6} /> mois) et pour ses renouvellements et
        reconductions successifs. Conformément à l'article 22-1 de la loi du 6 juillet 1989,
        lorsqu'il est à durée indéterminée, la caution peut le résilier unilatéralement ; la
        résiliation prend effet au terme du contrat de location au cours duquel le bailleur en
        reçoit notification.
      </Text>

      <Text style={s.h2}>Information de la caution</Text>
      <Text style={s.p}>
        La caution reconnaît avoir pris connaissance de la nature et de l'étendue de son
        obligation, du montant du loyer et de ses conditions de révision figurant ci-dessus, ainsi
        que de la faculté de résiliation rappelée à l'article précédent. Un exemplaire du bail lui
        est remis.
      </Text>

      <View wrap={false} style={{ marginTop: 16 }}>
        <Text style={s.h2}>Signature de la caution</Text>
        <Text style={s.p}>
          Recopiez la mention ci-dessous de votre main, en complétant les blancs éventuels, puis
          datez et signez :
        </Text>
        <View style={s.carte}>
          <Text style={s.p}>
            « Bon pour caution solidaire de <Rempl v={locataireNom} brouillon taille={24} />
            {/* Montant connu : une seule chaîne (cf. « Montant garanti »). */}
            {total !== undefined ? (
              `, à concurrence de ${formatEuros(total)} par mois (en toutes lettres : ${montantEnLettres(total)})`
            ) : (
              <>
                , à concurrence de <Rempl v="" brouillon taille={12} /> par mois (en toutes lettres
                :{' '}
                <Rempl v="" brouillon taille={40} />)
              </>
            )}
            {/* Espace de largeur nulle en tête : sans elle, react-pdf rogne
                l'espace initiale du nœud et colle le texte à la parenthèse. */}
            {'​ au titre du loyer et des charges, pour la durée du bail et de ses renouvellements.'}
            {"​ J'ai pris connaissance de la nature et de l'étendue de mon engagement. Lu et approuvé. »"}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
          <View style={{ width: '47%' }}>
            <Text style={s.petit}>
              Fait à ...................., le ..............
            </Text>
          </View>
          <View style={[s.blocSignature, { width: '47%' }]}>
            <Text style={[s.petit, s.gras]}>
              La caution — <Rempl v={nomCaution} brouillon taille={20} />
            </Text>
            <View style={{ height: 70 }} />
            <Text style={s.petit}>Mention manuscrite + signature</Text>
          </View>
        </View>
      </View>

      <Text style={[s.petit, { marginTop: 12 }]}>
        Document fourni comme aide à la rédaction ; il ne constitue pas un conseil juridique et ne
        s'applique pas à la garantie Visale (contrat émis par Action Logement). Vérifiez les
        mentions avant signature.
      </Text>
      <PiedDePagePdf />
    </Page>
  );
}
