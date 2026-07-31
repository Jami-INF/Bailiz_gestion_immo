import { Document, Page, Text, View } from '@react-pdf/renderer';
import { EntetePdf, PiedDePagePdf, pdfStyles as s } from './commun';

const L = (largeur = 26) => '.'.repeat(largeur);

/**
 * Acte de cautionnement solidaire (caution personne physique) — art. 22-1 de la
 * loi n°89-462 du 6 juillet 1989. **Modèle vierge, non pré-rempli** : à imprimer
 * et compléter à la main avant signature. Ne s'applique pas à la garantie
 * Visale, dont le contrat de cautionnement est émis par Action Logement.
 */
export function ActeCautionnementPdf() {
  return (
    <Document title="Acte de cautionnement solidaire — modèle vierge" language="fr">
      <Page size="A4" style={s.page}>
        <EntetePdf reference="Modèle vierge" docTitre="Acte de cautionnement" />
        <View style={s.titreBloc}>
          <Text style={s.titre}>Acte de cautionnement solidaire</Text>
          <Text style={s.sousTitre}>
            Article 22-1 de la loi n°89-462 du 6 juillet 1989 — engagement de caution d'un bail
            d'habitation. Modèle à compléter à la main et à signer après impression.
          </Text>
        </View>

        <Text style={s.h2}>Parties</Text>
        <Text style={s.p}>
          <Text style={s.gras}>La caution</Text> : {L(30)}, demeurant {L(40)}.
        </Text>
        <Text style={s.p}>
          <Text style={s.gras}>Le bailleur</Text> : {L(30)}, demeurant {L(40)}.
        </Text>
        <Text style={s.p}>
          <Text style={s.gras}>Le locataire cautionné</Text> : {L(30)}, pour le logement situé{' '}
          {L(40)}.
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
          Le loyer mensuel s'élève à {L(10)} € hors charges (en toutes lettres : {L(40)}), auquel
          s'ajoutent {L(10)} € de charges, soit un total mensuel de {L(10)} €. Le loyer est
          révisable annuellement selon l'indice de référence des loyers (IRL) publié par l'INSEE ;
          le cautionnement s'étend aux montants révisés.
        </Text>

        <Text style={s.h2}>Durée de l'engagement</Text>
        <Text style={s.p}>
          Le présent cautionnement est consenti pour la durée initiale du bail ({L(6)} mois) et
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
            Recopiez la mention ci-dessous de votre main, en complétant les blancs, puis datez et
            signez :
          </Text>
          <View style={s.carte}>
            <Text style={s.p}>
              « Bon pour caution solidaire de {L(24)}, à concurrence de {L(10)} € par mois (en
              toutes lettres : {L(40)}) au titre du loyer et des charges, pour la durée du bail et
              de ses renouvellements. J'ai pris connaissance de la nature et de l'étendue de mon
              engagement. Lu et approuvé. »
            </Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
            <View style={{ width: '47%' }}>
              <Text style={s.petit}>Fait à {L(20)}, le {L(14)}</Text>
            </View>
            <View style={[s.blocSignature, { width: '47%' }]}>
              <Text style={[s.petit, s.gras]}>La caution — {L(20)}</Text>
              <View style={{ height: 70 }} />
              <Text style={s.petit}>Mention manuscrite + signature</Text>
            </View>
          </View>
        </View>

        <Text style={[s.petit, { marginTop: 12 }]}>
          Modèle vierge fourni comme aide à la rédaction ; il ne constitue pas un conseil juridique
          et ne s'applique pas à la garantie Visale (contrat émis par Action Logement). Vérifiez les
          mentions avant signature.
        </Text>
        <PiedDePagePdf />
      </Page>
    </Document>
  );
}
