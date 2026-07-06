import { Document, Page, Text, View } from '@react-pdf/renderer';
import type { Bail, Bien, Inventaire, Locataire } from '@/types';
import { ETAT_LABELS } from '@/types';
import {
  EntetePdf,
  PiedDePagePdf,
  SignaturesPdf,
  ZoneSignatureManuscrite,
  formatDateFr,
  pdfStyles as s,
} from './commun';

interface Props {
  inventaire: Inventaire;
  bail: Bail;
  bien: Bien;
  locataires: Locataire[];
  hash?: string;
}

/** Inventaire et état détaillé du mobilier — annexe obligatoire du bail meublé. */
export function InventairePdf({ inventaire, bail, bien, locataires, hash }: Props) {
  const largeurs = ['16%', '34%', '8%', '14%', '28%'];
  const pieces = [...new Set(inventaire.lignes.map((l) => l.pieceNom))];
  const obligatoiresAbsents = inventaire.lignes.filter(
    (l) => l.obligatoireDecret && l.quantite === 0,
  );

  return (
    <Document title={`${inventaire.reference} — Inventaire du mobilier`} language="fr">
      <Page size="A4" style={s.page}>
        <EntetePdf reference={inventaire.reference} docTitre="Inventaire du mobilier" />
        <Text style={s.titre}>Inventaire et état détaillé du mobilier</Text>
        <Text style={s.sousTitre}>
          Annexe au contrat de location meublée {bail.reference} — logement situé{' '}
          {bien.adresse.ligne1}, {bien.adresse.codePostal} {bien.adresse.ville}. Locataire(s) :{' '}
          {locataires.map((l) => `${l.prenom} ${l.nom}`).join(', ')}.
        </Text>
        <Text style={s.p}>
          Le logement est équipé au minimum du mobilier prévu par le décret n°2015-981 du 31
          juillet 2015 (éléments marqués « décret »). État constaté contradictoirement le{' '}
          {formatDateFr(inventaire.signatures?.dateSignature ?? inventaire.updatedAt)}.
        </Text>

        {obligatoiresAbsents.length > 0 && (
          <Text style={[s.p, { color: '#b91c1c' }]}>
            Attention : {obligatoiresAbsents.length} élément(s) obligatoire(s) du décret
            2015-981 sont marqués absents : {obligatoiresAbsents.map((l) => l.designation).join(' ; ')}.
          </Text>
        )}

        {pieces.map((pieceNom) => (
          <View key={pieceNom} wrap={false} style={{ marginTop: 8 }}>
            <Text style={s.h3}>{pieceNom}</Text>
            <View style={s.tableau}>
              <View style={s.ligneTableau}>
                {['Catégorie', 'Désignation', 'Qté', 'État', 'Commentaire'].map((t, i) => (
                  <Text key={t} style={[s.celluleEnTete, { width: largeurs[i] }]}>
                    {t}
                  </Text>
                ))}
              </View>
              {inventaire.lignes
                .filter((l) => l.pieceNom === pieceNom)
                .map((l, i) => (
                  <View style={s.ligneTableau} key={i}>
                    <Text style={[s.cellule, { width: largeurs[0] }]}>
                      {l.obligatoireDecret ? 'Décret 2015-981' : 'Mobilier'}
                    </Text>
                    <Text style={[s.cellule, { width: largeurs[1] }]}>{l.designation}</Text>
                    <Text style={[s.cellule, { width: largeurs[2] }]}>{l.quantite}</Text>
                    <Text style={[s.cellule, { width: largeurs[3] }]}>
                      {l.quantite === 0 ? 'Absent' : ETAT_LABELS[l.etat]}
                    </Text>
                    <Text style={[s.cellule, { width: largeurs[4] }]}>{l.commentaire ?? ''}</Text>
                  </View>
                ))}
            </View>
          </View>
        ))}

        {inventaire.signatures ? (
          <SignaturesPdf signatures={inventaire.signatures} />
        ) : (
          <ZoneSignatureManuscrite locataires={locataires.map((l) => `${l.prenom} ${l.nom}`)} />
        )}
        <PiedDePagePdf hash={hash} />
      </Page>
    </Document>
  );
}
