import { Document, Page, Text, View } from '@react-pdf/renderer';
import type { Bail, Bien, Locataire, Parametres } from '@/types';
import { formatEuros } from '@/lib/calculs';
import { EntetePdf, PiedDePagePdf, formatDateFr, pdfStyles as s } from './commun';
import { formatAdresse } from '@/lib/adresse';
import { nomBailleur, signataireBailleur } from '@/lib/bailleur';

interface Props {
  reference: string;
  bail: Bail;
  bien: Bien;
  locataires: Locataire[];
  parametres: Parametres;
  /**
   * Trimestre servant de base au calcul : celui du contrat pour la première
   * révision, celui de la révision précédente ensuite. Lire
   * `bail.revisionIRL.trimestreReference` citait indéfiniment le trimestre
   * d'origine, faux dès la deuxième année.
   */
  ancienTrimestre: string;
  ancienIndice: number;
  nouvelIndice: number;
  nouveauTrimestre: string;
  ancienLoyer: number;
  nouveauLoyer: number;
  dateApplication: string;
}

/** Courrier de révision annuelle du loyer selon l'IRL. */
export function CourrierIrlPdf(p: Props) {
  const b = p.parametres.bailleur;
  return (
    <Document title={`${p.reference} — Révision de loyer IRL`} language="fr">
      <Page size="A4" style={s.page}>
        <EntetePdf reference={p.reference} docTitre="Révision annuelle du loyer (IRL)" />
        <View style={{ marginBottom: 16 }}>
          <Text>{nomBailleur(b)}</Text>
          <Text>{b.adresse}</Text>
          <Text>{b.email} — {b.telephone}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', marginBottom: 16 }}>
          {p.locataires.map((l) => (
            <Text key={l.id}>
              {l.civilite === 'Mme' ? 'Mme' : 'M.'} {l.prenom} {l.nom}
            </Text>
          ))}
          <Text>
            {formatAdresse(p.bien.adresse)}
          </Text>
        </View>
        <Text style={s.p}>Objet : révision annuelle du loyer — bail {p.bail.reference}</Text>
        <Text style={[s.p, { marginTop: 10 }]}>Madame, Monsieur,</Text>
        <Text style={s.p}>
          Conformément à l'article 17-1 de la loi n°89-462 du 6 juillet 1989 et à la clause de
          révision de votre contrat de location, le loyer est révisé à la date anniversaire du
          bail en fonction de la variation de l'indice de référence des loyers (IRL) publié par
          l'INSEE.
        </Text>
        <Text style={s.p}>
          Indice de référence ({p.ancienTrimestre}) : {p.ancienIndice}. Nouvel indice ({p.nouveauTrimestre}) :{' '}
          {p.nouvelIndice}.
        </Text>
        <Text style={s.p}>
          Le nouveau loyer mensuel hors charges est calculé ainsi :{' '}
          {formatEuros(p.ancienLoyer)} × {p.nouvelIndice} / {p.ancienIndice} ={' '}
          {formatEuros(p.nouveauLoyer)}.
        </Text>
        <Text style={s.p}>
          Ce nouveau loyer de {formatEuros(p.nouveauLoyer)} hors charges s'applique à compter du{' '}
          {formatDateFr(p.dateApplication)}. Les charges restent inchangées.
        </Text>
        <Text style={s.p}>
          Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.
        </Text>
        <View style={{ alignItems: 'flex-end', marginTop: 24 }}>
          <Text>
            {signataireBailleur(b)}
          </Text>
        </View>
        <PiedDePagePdf />
      </Page>
    </Document>
  );
}
