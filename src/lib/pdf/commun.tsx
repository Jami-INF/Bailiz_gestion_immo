import { StyleSheet, Text, View, Image, Svg, Rect } from '@react-pdf/renderer';
import type { ReactNode } from 'react';
import qrcode from 'qrcode-generator';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { SignatureBloc } from '@/types';
import { formatHash } from '@/lib/crypto';

export const pdfStyles = StyleSheet.create({
  page: {
    paddingTop: 42,
    paddingBottom: 62,
    paddingHorizontal: 48,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#2B2925',
    lineHeight: 1.5,
  },
  entete: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 0.5,
    borderBottomColor: '#D5D2CC',
    paddingBottom: 7,
    marginBottom: 18,
  },
  reference: { fontSize: 8, color: '#78746D', letterSpacing: 0.4, textTransform: 'uppercase' },
  // Bloc de titre centré, souligné d'un filet - en tête du document.
  titreBloc: {
    borderBottomWidth: 1.2,
    borderBottomColor: '#1A1815',
    paddingBottom: 8,
    marginBottom: 16,
  },
  titre: {
    fontSize: 17,
    fontFamily: 'Helvetica-Bold',
    color: '#1A1815',
    textAlign: 'center',
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  sousTitre: { fontSize: 9, color: '#5A5751', textAlign: 'center', lineHeight: 1.4, marginBottom: 6 },
  h2: {
    fontSize: 11.5,
    fontFamily: 'Helvetica-Bold',
    color: '#1A1815',
    marginTop: 16,
    marginBottom: 7,
    paddingBottom: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: '#D5D2CC',
    letterSpacing: 0.2,
  },
  h3: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#413F3A', marginTop: 9, marginBottom: 3 },
  p: { marginBottom: 5, textAlign: 'justify' },
  // Bloc d'une partie (bailleur, locataire, garant) - aéré, présentation en liste.
  tiers: { marginBottom: 9 },
  tiersLigne: { marginBottom: 2, paddingLeft: 12, color: '#413F3A' },
  /** Ligne comportant des zones à compléter à la main : interligne élargi. */
  tiersLigneAComplecter: { marginBottom: 9, paddingLeft: 12, color: '#413F3A', lineHeight: 1.9 },
  gras: { fontFamily: 'Helvetica-Bold' },
  petit: { fontSize: 8, color: '#78746D' },
  // Encadré clair (récapitulatifs, mises en avant).
  carte: {
    backgroundColor: '#FAFAF9',
    borderWidth: 0.5,
    borderColor: '#E8E6E2',
    borderRadius: 4,
    padding: 10,
    marginVertical: 8,
  },
  tableau: { borderWidth: 0.5, borderColor: '#918C85', borderRadius: 2, marginVertical: 6 },
  ligneTableau: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#D5D2CC' },
  celluleEnTete: {
    fontFamily: 'Helvetica-Bold',
    backgroundColor: '#F5F4F2',
    padding: 4,
    fontSize: 8.5,
  },
  cellule: { padding: 4, fontSize: 8.5 },
  piedDePage: {
    position: 'absolute',
    bottom: 24,
    left: 48,
    right: 48,
    borderTopWidth: 0.5,
    borderTopColor: '#D5D2CC',
    paddingTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  blocSignature: {
    width: '47%',
    borderWidth: 0.5,
    borderColor: '#918C85',
    borderRadius: 4,
    padding: 10,
    marginBottom: 8,
  },
});

export function formatDateFr(iso: string | undefined, avecHeure = false): string {
  if (!iso) return '-';
  return format(new Date(iso), avecHeure ? "d MMMM yyyy 'à' HH:mm:ss" : 'd MMMM yyyy', {
    locale: fr,
  });
}

/**
 * Dans un flux `<Text>`, rend une valeur ou - en mode brouillon (bail rapide) -
 * une zone pointillée à compléter à la main. En mode normal (flux complet), une
 * valeur vide rend une chaîne vide : le comportement historique est préservé.
 */
export function Rempl({
  v,
  brouillon,
  taille = 16,
}: {
  v?: string | number | null;
  brouillon?: boolean;
  taille?: number;
}) {
  const vide = v === undefined || v === null || v === '' || v === 0;
  if (!vide) return <Text>{v}</Text>;
  return brouillon ? <Text style={{ color: '#918C85' }}>{'.'.repeat(taille)}</Text> : <Text />;
}

/**
 * Ligne de case à cocher : carré dessiné (les glyphes ☐/☒ n'existent pas dans
 * les polices standard PDF). `cochee` marque la case d'un « X ».
 */
export function CaseACocher({ children, cochee }: { children: ReactNode; cochee?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', marginBottom: 4 }}>
      <View
        style={{
          width: 9,
          height: 9,
          borderWidth: 0.8,
          borderColor: '#413F3A',
          borderRadius: 1.5,
          marginRight: 7,
          marginTop: 1.5,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {cochee ? <Text style={{ fontSize: 7, lineHeight: 1, color: '#1A1815' }}>X</Text> : null}
      </View>
      <Text style={{ flex: 1 }}>{children}</Text>
    </View>
  );
}

/**
 * QR code rendu en SVG (généré localement, aucun appel réseau). Les modules
 * sombres d'une même ligne sont fusionnés en un seul rectangle pour alléger le
 * PDF ; une quiet zone de 2 modules entoure le code pour la lisibilité scanner.
 */
export function QrCode({ value, taille = 92 }: { value: string; taille?: number }) {
  const qr = qrcode(0, 'M');
  qr.addData(value);
  qr.make();
  const n = qr.getModuleCount();
  const pad = 2;
  const runs: { x: number; y: number; w: number }[] = [];
  for (let r = 0; r < n; r++) {
    let start = -1;
    for (let c = 0; c <= n; c++) {
      const dark = c < n && qr.isDark(r, c);
      if (dark && start === -1) start = c;
      else if (!dark && start !== -1) {
        runs.push({ x: start, y: r, w: c - start });
        start = -1;
      }
    }
  }
  const total = n + pad * 2;
  return (
    <Svg width={taille} height={taille} viewBox={`${-pad} ${-pad} ${total} ${total}`}>
      <Rect x={-pad} y={-pad} width={total} height={total} fill="#ffffff" />
      {runs.map((m, i) => (
        <Rect key={i} x={m.x} y={m.y} width={m.w} height={1} fill="#000000" />
      ))}
    </Svg>
  );
}

export function EntetePdf({ reference, docTitre }: { reference: string; docTitre: string }) {
  return (
    <View style={pdfStyles.entete} fixed>
      <Text style={pdfStyles.reference}>{docTitre}</Text>
      <Text style={pdfStyles.reference}>Réf. {reference}</Text>
    </View>
  );
}

/**
 * Pied de page : pagination x/y + empreinte SHA-256 (version signée).
 * `paraphes` ajoute les emplacements de paraphe attendus sur un contrat destiné
 * à être signé à la main, page par page.
 */
export function PiedDePagePdf({ hash, paraphes }: { hash?: string; paraphes?: boolean }) {
  return (
    <View style={pdfStyles.piedDePage} fixed>
      <Text style={pdfStyles.petit}>
        {hash ? `Empreinte SHA-256 : ${formatHash(hash)}` : 'Document généré par Bailiz'}
      </Text>
      {paraphes && (
        <Text style={pdfStyles.petit}>Paraphes - bailleur : ......... locataire : .........</Text>
      )}
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
          « Lu et approuvé - je reconnais avoir pris connaissance de l'intégralité du document »
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
        Fait à {signatures.lieu}, le {formatDateFr(signatures.dateSignature, true)}.
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
        Fait à ............................................, le ............................, en
        autant d'exemplaires originaux que de parties. Chaque signature est précédée de la mention
        manuscrite « lu et approuvé » ; chaque page est paraphée.
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <View style={pdfStyles.blocSignature}>
          <Text style={[pdfStyles.petit, pdfStyles.gras]}>Le bailleur</Text>
          <View style={{ height: 72 }} />
          <Text style={pdfStyles.petit}>« Lu et approuvé »</Text>
        </View>
        {locataires.map((nom, i) => (
          <View style={pdfStyles.blocSignature} key={i}>
            <Text style={[pdfStyles.petit, pdfStyles.gras]}>Le locataire - {nom}</Text>
            <View style={{ height: 72 }} />
            <Text style={pdfStyles.petit}>« Lu et approuvé »</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
