import { StyleSheet, Text, View, Image } from '@react-pdf/renderer';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { SignatureBloc } from '@/types';
import { formatHash } from '@/lib/crypto';

export const pdfStyles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 60,
    paddingHorizontal: 45,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#1e293b',
    lineHeight: 1.4,
  },
  entete: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
    paddingBottom: 8,
    marginBottom: 16,
  },
  reference: { fontSize: 9, color: '#64748b' },
  titre: { fontSize: 16, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  sousTitre: { fontSize: 10, color: '#475569', marginBottom: 12 },
  h2: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    marginTop: 14,
    marginBottom: 6,
    color: '#0f172a',
  },
  h3: { fontSize: 10.5, fontFamily: 'Helvetica-Bold', marginTop: 8, marginBottom: 3 },
  p: { marginBottom: 4, textAlign: 'justify' },
  gras: { fontFamily: 'Helvetica-Bold' },
  petit: { fontSize: 8, color: '#64748b' },
  tableau: { borderWidth: 0.5, borderColor: '#94a3b8', marginVertical: 6 },
  ligneTableau: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#cbd5e1' },
  celluleEnTete: {
    fontFamily: 'Helvetica-Bold',
    backgroundColor: '#f1f5f9',
    padding: 4,
    fontSize: 8.5,
  },
  cellule: { padding: 4, fontSize: 8.5 },
  piedDePage: {
    position: 'absolute',
    bottom: 24,
    left: 45,
    right: 45,
    borderTopWidth: 0.5,
    borderTopColor: '#cbd5e1',
    paddingTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  blocSignature: {
    width: '45%',
    borderWidth: 0.5,
    borderColor: '#94a3b8',
    padding: 8,
    marginBottom: 8,
  },
});

export function formatDateFr(iso: string | undefined, avecHeure = false): string {
  if (!iso) return '—';
  return format(new Date(iso), avecHeure ? "d MMMM yyyy 'à' HH:mm:ss" : 'd MMMM yyyy', {
    locale: fr,
  });
}

export function EntetePdf({ reference, docTitre }: { reference: string; docTitre: string }) {
  return (
    <View style={pdfStyles.entete} fixed>
      <Text style={pdfStyles.reference}>{docTitre}</Text>
      <Text style={pdfStyles.reference}>Réf. {reference}</Text>
    </View>
  );
}

/** Pied de page : pagination x/y + empreinte SHA-256 (version signée). */
export function PiedDePagePdf({ hash }: { hash?: string }) {
  return (
    <View style={pdfStyles.piedDePage} fixed>
      <Text style={pdfStyles.petit}>
        {hash ? `Empreinte SHA-256 : ${formatHash(hash)}` : 'Document généré par Bailiz'}
      </Text>
      <Text
        style={pdfStyles.petit}
        render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`}
      />
    </View>
  );
}

/** Bloc de signatures avec horodatage et mention « lu et approuvé ». */
export function SignaturesPdf({ signatures, mention }: { signatures: SignatureBloc; mention?: string }) {
  const item = (titre: string, s: { nomComplet: string; luEtApprouve: boolean; imageDataUrl: string; horodatage: string }) => (
    <View style={pdfStyles.blocSignature} key={titre + s.nomComplet}>
      <Text style={[pdfStyles.petit, pdfStyles.gras]}>{titre}</Text>
      <Text style={{ fontSize: 9, marginTop: 2 }}>{s.nomComplet}</Text>
      {s.luEtApprouve && (
        <Text style={pdfStyles.petit}>
          « Lu et approuvé — je reconnais avoir pris connaissance de l'intégralité du document »
        </Text>
      )}
      {s.imageDataUrl ? (
        <Image src={s.imageDataUrl} style={{ width: 140, height: 60, marginVertical: 4 }} />
      ) : (
        <View style={{ height: 60 }} />
      )}
      <Text style={pdfStyles.petit}>
        Horodatage : {formatDateFr(s.horodatage, true)} ({s.horodatage})
      </Text>
    </View>
  );

  return (
    <View wrap={false} style={{ marginTop: 16 }}>
      <Text style={pdfStyles.h2}>Signatures</Text>
      <Text style={pdfStyles.p}>
        Fait à {signatures.lieu}, le {formatDateFr(signatures.dateSignature)}.
        {mention ? ` ${mention}` : ''}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        {item('Le bailleur', signatures.bailleur)}
        {signatures.locataires.map((l, i) =>
          item(signatures.locataires.length > 1 ? `Locataire ${i + 1}` : 'Le locataire', l),
        )}
      </View>
    </View>
  );
}

/** Zone de signature vide (documents imprimés puis signés à la main). */
export function ZoneSignatureManuscrite({ locataires }: { locataires: string[] }) {
  return (
    <View wrap={false} style={{ marginTop: 20 }}>
      <Text style={pdfStyles.h2}>Signatures</Text>
      <Text style={pdfStyles.p}>
        Fait en autant d'originaux que de parties. Chaque signature est précédée de la mention
        manuscrite « lu et approuvé ».
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <View style={pdfStyles.blocSignature}>
          <Text style={[pdfStyles.petit, pdfStyles.gras]}>Le bailleur</Text>
          <View style={{ height: 70 }} />
        </View>
        {locataires.map((nom, i) => (
          <View style={pdfStyles.blocSignature} key={i}>
            <Text style={[pdfStyles.petit, pdfStyles.gras]}>Le locataire — {nom}</Text>
            <View style={{ height: 70 }} />
          </View>
        ))}
      </View>
    </View>
  );
}
