import { Document, Page, Text, View } from '@react-pdf/renderer';
import type { LigneVetuste } from '@/types';
import { coefficientVetuste, formatEuros, retenueApresVetuste } from '@/lib/calculs';
import { EntetePdf, PiedDePagePdf, formatDateFr, pdfStyles as s } from './commun';

interface Props {
  reference: string;
  grille: LigneVetuste[];
  bailReference?: string; // renseigné quand la grille est annexée à un bail
}

/**
 * Grille de vétusté à annexer au bail (art. 4 du décret n°2016-382 du 30 mars
 * 2016 : les parties peuvent convenir d'appliquer une grille de vétusté dès la
 * signature du bail), accompagnée de son mode d'emploi.
 */
export function GrilleVetustePdf({ reference, grille, bailReference }: Props) {
  const largeurs = ['34%', '18%', '16%', '16%', '16%'];
  const exemple = grille.find((g) => g.poste.toLowerCase().includes('peinture')) ?? grille[0];
  const exempleCoef = exemple ? coefficientVetuste(exemple, 4) : 1;
  const exempleRetenue = exemple ? retenueApresVetuste(500, exemple, 4) : 500;

  return (
    <Document title={`${reference} — Grille de vétusté`} language="fr">
      <Page size="A4" style={s.page}>
        <EntetePdf reference={reference} docTitre="Grille de vétusté — annexe au bail" />
        <Text style={s.titre}>Grille de vétusté</Text>
        <Text style={s.sousTitre}>
          {bailReference ? `Annexe au contrat de location ${bailReference}. ` : ''}
          Convenue entre les parties en application de l'article 4 du décret n°2016-382 du 30
          mars 2016. Document généré le {formatDateFr(new Date().toISOString())}.
        </Text>

        <Text style={s.h2}>1. Qu'est-ce que la vétusté ?</Text>
        <Text style={s.p}>
          La vétusté est « l'état d'usure ou de détérioration résultant du temps ou de l'usage
          normal des matériaux et éléments d'équipement dont est constitué le logement »
          (décret n°2016-382). Elle est à la charge du bailleur : seules les dégradations
          anormales, imputables au locataire, peuvent donner lieu à retenue sur le dépôt de
          garantie (art. 7 c) et d) de la loi du 6 juillet 1989). La présente grille sert à
          distinguer objectivement l'usure normale de la dégradation, et à calculer la part du
          coût de remise en état restant à la charge du locataire.
        </Text>

        <Text style={s.h2}>2. Mode d'emploi</Text>
        <Text style={s.p}>
          a) À la sortie du locataire, comparer poste par poste l'état des lieux de sortie avec
          celui d'entrée : seuls les éléments dégradés (au-delà de l'usure normale) sont
          concernés.
        </Text>
        <Text style={s.p}>
          b) Pour chaque élément dégradé, déterminer son âge (depuis sa pose ou son achat) et le
          poste correspondant de la grille.
        </Text>
        <Text style={s.p}>
          c) Appliquer le coefficient : pendant la durée de franchise, aucun abattement (le
          locataire supporte 100 % du coût de remise en état). Au-delà, le coefficient diminue
          chaque année de l'abattement annuel, sans descendre sous une part résiduelle de 10 %
          tant que la durée de vie théorique n'est pas atteinte. Au-delà de la durée de vie,
          plus rien ne peut être facturé au locataire (0 %).
        </Text>
        <Text style={s.p}>
          d) Retenue = coût de remise en état (devis ou facture à joindre au décompte) ×
          coefficient de vétusté.
        </Text>
        {exemple && (
          <Text style={s.p}>
            Exemple — poste « {exemple.poste} » ({exemple.dureeVieAnnees} ans de durée de vie,
            franchise {exemple.franchiseAnnees} an{exemple.franchiseAnnees > 1 ? 's' : ''},
            abattement {exemple.abattementAnnuelPct} %/an) : pour un élément âgé de 4 ans et un
            devis de remise en état de {formatEuros(500)}, le coefficient est de{' '}
            {Math.round(exempleCoef * 100)} % et la retenue de {formatEuros(exempleRetenue)}.
          </Text>
        )}

        <Text style={s.h2}>3. Grille applicable</Text>
        <View style={s.tableau}>
          <View style={s.ligneTableau}>
            {['Poste', 'Durée de vie', 'Franchise', 'Abattement/an', 'Part résiduelle'].map((t, i) => (
              <Text key={t} style={[s.celluleEnTete, { width: largeurs[i] }]}>
                {t}
              </Text>
            ))}
          </View>
          {grille.map((l, i) => (
            <View style={s.ligneTableau} key={i}>
              <Text style={[s.cellule, { width: largeurs[0] }]}>{l.poste}</Text>
              <Text style={[s.cellule, { width: largeurs[1] }]}>{l.dureeVieAnnees} ans</Text>
              <Text style={[s.cellule, { width: largeurs[2] }]}>
                {l.franchiseAnnees} an{l.franchiseAnnees > 1 ? 's' : ''}
              </Text>
              <Text style={[s.cellule, { width: largeurs[3] }]}>{l.abattementAnnuelPct} %</Text>
              <Text style={[s.cellule, { width: largeurs[4] }]}>10 %</Text>
            </View>
          ))}
        </View>

        <Text style={s.h2}>4. Précisions</Text>
        <Text style={s.p}>
          – La grille s'applique dans les deux sens : elle protège le locataire d'une
          facturation à neuf d'équipements usagés, et objective les retenues du bailleur.
        </Text>
        <Text style={s.p}>
          – Elle ne couvre pas les dégradations volontaires ou les défauts d'entretien courant à
          la charge du locataire (décret n°87-712, réparations locatives), qui restent dus en
          totalité.
        </Text>
        <Text style={s.p}>
          – Les retenues sur dépôt de garantie doivent être justifiées (devis, factures,
          constats) et détaillées dans le décompte remis au locataire.
        </Text>
        <PiedDePagePdf />
      </Page>
    </Document>
  );
}
