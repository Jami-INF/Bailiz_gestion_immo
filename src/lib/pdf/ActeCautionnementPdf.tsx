import { Document, Page, Text, View } from '@react-pdf/renderer';
import type { Garant, Parametres } from '@/types';
import { formatEuros } from '@/lib/calculs';
import { montantEnLettres } from '@/lib/lettres';
import { EntetePdf, PiedDePagePdf, pdfStyles as s } from './commun';

interface Props {
  reference?: string;
  bailleur: Parametres['bailleur'];
  garant: Garant;
  locataireNom: string;
  bienAdresse: string;
  loyerHC: number;
  charges: number;
  typeBailLabel: string;
  dureeMois: number;
}

/**
 * Acte de cautionnement solidaire (caution personne physique) — art. 22-1 de la
 * loi n°89-462 du 6 juillet 1989. Pré-rempli à partir du bail ; il reste une
 * aide à la rédaction, à compléter et à signer de la main de la caution.
 */
export function ActeCautionnementPdf({
  reference,
  bailleur,
  garant,
  locataireNom,
  bienAdresse,
  loyerHC,
  charges,
  typeBailLabel,
  dureeMois,
}: Props) {
  const b = bailleur;
  const total = loyerHC + charges;
  return (
    <Document title="Acte de cautionnement solidaire" language="fr">
      <Page size="A4" style={s.page}>
        <EntetePdf reference={reference ?? '—'} docTitre="Acte de cautionnement" />
        <View style={s.titreBloc}>
          <Text style={s.titre}>Acte de cautionnement solidaire</Text>
          <Text style={s.sousTitre}>
            Article 22-1 de la loi n°89-462 du 6 juillet 1989 — engagement de caution d'un bail
            d'habitation ({typeBailLabel}).
          </Text>
        </View>

        <Text style={s.h2}>Parties</Text>
        <Text style={s.p}>
          <Text style={s.gras}>La caution</Text> : {garant.prenom} {garant.nom}, demeurant{' '}
          {garant.adresse}.
        </Text>
        <Text style={s.p}>
          <Text style={s.gras}>Le bailleur</Text> : {b.civilite === 'Mme' ? 'Mme' : 'M.'} {b.prenom}{' '}
          {b.nom}, demeurant {b.adresse}.
        </Text>
        <Text style={s.p}>
          <Text style={s.gras}>Le locataire cautionné</Text> : {locataireNom}, pour le logement situé{' '}
          {bienAdresse}.
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
        <Text style={s.p}>
          Le loyer mensuel s'élève à <Text style={s.gras}>{formatEuros(loyerHC)}</Text> hors charges
          ({montantEnLettres(loyerHC)}), auquel s'ajoutent {formatEuros(charges)} de charges, soit un
          total mensuel de <Text style={s.gras}>{formatEuros(total)}</Text>. Le loyer est révisable
          annuellement selon l'indice de référence des loyers (IRL) publié par l'INSEE ; le
          cautionnement s'étend aux montants révisés.
        </Text>

        <Text style={s.h2}>Durée de l'engagement</Text>
        <Text style={s.p}>
          Le présent cautionnement est consenti pour la durée initiale du bail ({dureeMois} mois) et
          pour ses renouvellements et reconductions successifs. Conformément à l'article 22-1 de la
          loi du 6 juillet 1989, lorsqu'il est à durée indéterminée, la caution peut le résilier
          unilatéralement ; la résiliation prend effet au terme du contrat de location au cours
          duquel le bailleur en reçoit notification.
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
            Recopiez la mention ci-dessous de votre main, puis datez et signez :
          </Text>
          <View style={s.carte}>
            <Text style={s.p}>
              « Bon pour caution solidaire de {locataireNom}, à concurrence de{' '}
              {formatEuros(total)} par mois ({montantEnLettres(total)}) au titre du loyer et des
              charges, pour la durée du bail et de ses renouvellements. J'ai pris connaissance de la
              nature et de l'étendue de mon engagement. Lu et approuvé. »
            </Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
            <View style={{ width: '47%' }}>
              <Text style={s.petit}>Fait à ......................., le .......................</Text>
            </View>
            <View style={[s.blocSignature, { width: '47%' }]}>
              <Text style={[s.petit, s.gras]}>
                La caution — {garant.prenom} {garant.nom}
              </Text>
              <View style={{ height: 70 }} />
              <Text style={s.petit}>Mention manuscrite + signature</Text>
            </View>
          </View>
        </View>

        <Text style={[s.petit, { marginTop: 12 }]}>
          Document généré comme aide à la rédaction ; il ne constitue pas un conseil juridique.
          Vérifiez les mentions et l'étendue de l'engagement avant signature.
        </Text>
        <PiedDePagePdf />
      </Page>
    </Document>
  );
}
