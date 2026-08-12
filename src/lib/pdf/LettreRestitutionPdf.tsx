import { Document, Page, Text, View } from '@react-pdf/renderer';
import type { Bien, Locataire, Parametres } from '@/types';
import { formatEuros, type LigneRetenue } from '@/lib/calculs';
import { EntetePdf, PiedDePagePdf, formatDateFr, pdfStyles as s } from './commun';
import { formatAdresse } from '@/lib/adresse';
import { nomBailleur, signataireBailleur } from '@/lib/bailleur';

interface Props {
  reference: string;
  /**
   * Montant du dépôt à décompter. Passé en clair plutôt que déduit d'un bail :
   * l'état des lieux de sortie peut avoir été établi sans contrat rédigé dans
   * l'application, et c'est alors lui qui porte le montant.
   */
  depotGarantie: number;
  /** Référence du contrat, si l'on en connaît une (bail enregistré ou papier). */
  bailReference?: string;
  bien: Bien;
  locataires: Locataire[];
  parametres: Parametres;
  retenues: LigneRetenue[];
  autresRetenues: { libelle: string; montant: number }[];
  dateEdlSortie: string;
  nouvelleAdresse?: string;
}

/** Lettre de restitution du dépôt de garantie avec décompte détaillé. */
export function LettreRestitutionPdf(p: Props) {
  const b = p.parametres.bailleur;
  const totalDegradations = p.retenues.reduce((sum, l) => sum + l.retenue, 0);
  const totalAutres = p.autresRetenues.reduce((sum, l) => sum + l.montant, 0);
  const total = totalDegradations + totalAutres;
  const aRestituer = Math.max(0, p.depotGarantie - total);
  const conforme = total === 0;
  const largeurs = ['30%', '20%', '17%', '16%', '17%'];

  return (
    <Document title={`${p.reference} - Restitution du dépôt de garantie`} language="fr">
      <Page size="A4" style={s.page}>
        <EntetePdf reference={p.reference} docTitre="Restitution du dépôt de garantie" />
        <View style={{ marginBottom: 12 }}>
          <Text>{nomBailleur(b)}</Text>
          <Text>{b.adresse}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', marginBottom: 12 }}>
          {p.locataires.map((l) => (
            <Text key={l.id}>
              {l.civilite === 'Mme' ? 'Mme' : 'M.'} {l.prenom} {l.nom}
            </Text>
          ))}
          {p.nouvelleAdresse && <Text>{p.nouvelleAdresse}</Text>}
        </View>
        <Text style={s.p}>
          Objet : restitution du dépôt de garantie -{' '}
          {p.bailReference ? `bail ${p.bailReference}, ` : ''}logement situé{' '}
          {formatAdresse(p.bien.adresse)}.
        </Text>
        <Text style={[s.p, { marginTop: 8 }]}>Madame, Monsieur,</Text>
        <Text style={s.p}>
          À la suite de l'état des lieux de sortie établi contradictoirement le{' '}
          {formatDateFr(p.dateEdlSortie)}, je vous adresse le décompte du dépôt de garantie de{' '}
          {formatEuros(p.depotGarantie)} versé à la signature du bail.
        </Text>
        <Text style={s.p}>
          Rappel des délais légaux (art. 22 de la loi du 6 juillet 1989) : restitution sous un
          mois si l'état des lieux de sortie est conforme à l'état des lieux d'entrée, sous deux
          mois dans le cas contraire. À défaut, le solde dû est majoré de 10 % du loyer mensuel
          hors charges par mois de retard commencé.
        </Text>

        <Text style={s.h2}>Décompte des retenues</Text>
        {conforme ? (
          <Text style={s.p}>
            L'état des lieux de sortie étant conforme à l'état des lieux d'entrée, aucune
            retenue n'est appliquée.
          </Text>
        ) : (
          <>
            {p.retenues.length > 0 && (
              <View style={s.tableau}>
                <View style={s.ligneTableau}>
                  {['Élément (pièce)', 'Description', 'Coût remise en état', 'Coef. vétusté', 'Retenue'].map(
                    (t, i) => (
                      <Text key={t} style={[s.celluleEnTete, { width: largeurs[i] }]}>
                        {t}
                      </Text>
                    ),
                  )}
                </View>
                {p.retenues.map((l, i) => (
                  <View style={s.ligneTableau} key={i}>
                    <Text style={[s.cellule, { width: largeurs[0] }]}>
                      {l.elementNom} ({l.pieceNom})
                    </Text>
                    <Text style={[s.cellule, { width: largeurs[1] }]}>{l.description}</Text>
                    <Text style={[s.cellule, { width: largeurs[2] }]}>{formatEuros(l.cout)}</Text>
                    <Text style={[s.cellule, { width: largeurs[3] }]}>
                      {Math.round(l.coefVetuste * 100)} %
                    </Text>
                    <Text style={[s.cellule, { width: largeurs[4] }]}>{formatEuros(l.retenue)}</Text>
                  </View>
                ))}
              </View>
            )}
            {p.autresRetenues.map((l, i) => (
              <Text style={s.p} key={i}>
                {l.libelle} : {formatEuros(l.montant)}
              </Text>
            ))}
            <Text style={s.p}>
              Les justificatifs (devis, factures) des retenues pour dégradations sont joints à la
              présente.
            </Text>
          </>
        )}

        <Text style={s.h2}>Solde</Text>
        <Text style={s.p}>
          Dépôt de garantie versé : {formatEuros(p.depotGarantie)}. Total des retenues :{' '}
          {formatEuros(total)}. <Text style={s.gras}>Montant restitué : {formatEuros(aRestituer)}</Text>
          {total > p.depotGarantie
            ? `, le coût des réparations excédant le dépôt, un solde de ${formatEuros(total - p.depotGarantie)} reste dû par le locataire.`
            : '.'}
        </Text>
        <Text style={s.p}>
          Le règlement intervient dans le délai légal, à compter de la remise des clés, sur le
          compte de votre choix.
        </Text>
        <Text style={s.p}>
          Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.
        </Text>
        <View style={{ alignItems: 'flex-end', marginTop: 20 }}>
          <Text>
            {signataireBailleur(b)}
          </Text>
        </View>
        <PiedDePagePdf />
      </Page>
    </Document>
  );
}
