import { Document, Page, Text, View } from '@react-pdf/renderer';
import type { Bail, Bien, Locataire, Parametres } from '@/types';
import { TYPE_BAIL_LABELS } from '@/types';
import { formatEuros } from '@/lib/calculs';
import { EntetePdf, PiedDePagePdf, ZoneSignatureManuscrite, formatDateFr, pdfStyles as s } from './commun';

interface Props {
  bail: Bail;
  bien: Bien;
  locataires: Locataire[];
  parametres: Parametres;
  hash?: string;
}

/**
 * Bail de location meublée à usage de résidence principale.
 * Trame conforme au contrat type du décret n°2015-587 du 29 mai 2015 (annexe 2).
 */
export function BailPdf({ bail, bien, locataires, parametres, hash }: Props) {
  const b = parametres.bailleur;
  const chargesLabel =
    bail.charges.mode === 'forfait'
      ? 'forfait de charges (révisable dans les mêmes conditions que le loyer)'
      : 'provisions sur charges avec régularisation annuelle';
  const adresseComplete = [
    bien.adresse.ligne1,
    bien.adresse.ligne2,
    `${bien.adresse.codePostal} ${bien.adresse.ville}`,
    bien.batiment && `Bâtiment ${bien.batiment}`,
    bien.etage && `Étage ${bien.etage}`,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Document title={`${bail.reference} — Bail meublé`} language="fr">
      <Page size="A4" style={s.page}>
        <EntetePdf reference={bail.reference} docTitre="Contrat de location meublée" />
        <Text style={s.titre}>Contrat de location de logement meublé</Text>
        <Text style={s.sousTitre}>
          Résidence principale — {TYPE_BAIL_LABELS[bail.typeBail]}. Soumis au titre Ier bis de la
          loi n°89-462 du 6 juillet 1989 et conforme au contrat type annexé au décret n°2015-587
          du 29 mai 2015.
        </Text>

        <Text style={s.h2}>I. Désignation des parties</Text>
        <Text style={s.h3}>Le bailleur</Text>
        <Text style={s.p}>
          {b.civilite === 'Mme' ? 'Mme' : 'M.'} {b.prenom} {b.nom}, demeurant {b.adresse}
          {b.email ? `, courriel : ${b.email}` : ''}
          {b.telephone ? `, téléphone : ${b.telephone}` : ''}. Qualité du bailleur : personne
          physique, loueur en meublé non professionnel (LMNP)
          {b.siret ? `, SIRET : ${b.siret}` : ''}.
        </Text>
        <Text style={s.h3}>Le(s) locataire(s)</Text>
        {locataires.map((l) => (
          <Text style={s.p} key={l.id}>
            {l.civilite === 'Mme' ? 'Mme' : 'M.'} {l.prenom} {l.nom}
            {l.dateNaissance ? `, né(e) le ${formatDateFr(l.dateNaissance)}` : ''}
            {l.lieuNaissance ? ` à ${l.lieuNaissance}` : ''}, courriel : {l.email}, téléphone :{' '}
            {l.telephone}.
          </Text>
        ))}
        {locataires.length > 1 && (
          <Text style={s.p}>
            {bail.clauseSolidarite
              ? 'Clause de solidarité : les locataires sont tenus solidairement et indivisiblement des obligations du présent contrat, notamment du paiement du loyer et des charges. La solidarité d’un locataire ayant donné congé s’éteint au plus tard six mois après la fin de son préavis (art. 8-1 de la loi du 6 juillet 1989).'
              : 'Les locataires ne sont pas tenus solidairement.'}
          </Text>
        )}
        <Text style={s.p}>
          Honoraires de location : néant (location conclue en direct, sans intermédiaire).
        </Text>

        <Text style={s.h2}>II. Objet du contrat</Text>
        <Text style={s.h3}>Consistance du logement</Text>
        <Text style={s.p}>
          Adresse : {adresseComplete}. Type : {bien.type},{' '}
          {bien.nbPieces} pièce{bien.nbPieces > 1 ? 's' : ''} principale
          {bien.nbPieces > 1 ? 's' : ''}. Surface habitable : {bien.surfaceBoutin} m² (loi
          Boutin). Régime juridique de l'immeuble :{' '}
          {bien.regimeJuridique === 'copropriete' ? 'copropriété' : 'monopropriété'}. Période de
          construction : voir dossier de diagnostic technique.
        </Text>
        <Text style={s.p}>
          Chauffage : {bien.chauffage.type} ({bien.chauffage.energie}). Eau chaude sanitaire :{' '}
          {bien.eauChaude.type === 'individuel' ? 'individuelle' : 'collective'} (
          {bien.eauChaude.energie}).
        </Text>
        {bien.equipementsPrivatifs.length > 0 && (
          <>
            <Text style={s.h3}>Équipements privatifs</Text>
            <Text style={s.p}>{bien.equipementsPrivatifs.join(' ; ')}.</Text>
          </>
        )}
        {bien.partiesCommunes.length > 0 && (
          <>
            <Text style={s.h3}>Parties et équipements communs</Text>
            <Text style={s.p}>{bien.partiesCommunes.join(' ; ')}.</Text>
          </>
        )}
        {bien.annexes.length > 0 && (
          <>
            <Text style={s.h3}>Locaux et équipements accessoires</Text>
            <Text style={s.p}>
              {bien.annexes.map((a) => `${a.type} : ${a.description}`).join(' ; ')}.
            </Text>
          </>
        )}
        <Text style={s.p}>
          Destination des locaux : usage d'habitation exclusivement, à titre de résidence
          principale du locataire. Le logement est loué meublé ; l'inventaire et l'état détaillé
          du mobilier sont annexés au présent contrat.
        </Text>

        <Text style={s.h2}>III. Date de prise d'effet et durée du contrat</Text>
        <Text style={s.p}>
          Le contrat prend effet le {formatDateFr(bail.dateEffet)} pour une durée de{' '}
          {bail.dureeMois} mois.
        </Text>
        {bail.typeBail === 'meuble_1an' && (
          <Text style={s.p}>
            À défaut de congé donné dans les conditions légales (préavis d'un mois pour le
            locataire ; trois mois pour le bailleur, congé possible uniquement à l'échéance et
            motivé par la reprise, la vente ou un motif légitime et sérieux), le contrat est
            reconduit tacitement pour un an.
          </Text>
        )}
        {bail.typeBail === 'meuble_etudiant_9mois' && (
          <Text style={s.p}>
            Bail conclu pour neuf mois au bénéfice d'un locataire étudiant. Il n'est pas
            reconductible tacitement et prend fin de plein droit à son terme. Le locataire peut
            résilier à tout moment avec un préavis d'un mois.
          </Text>
        )}
        {bail.typeBail === 'mobilite' && (
          <Text style={s.p}>
            Bail mobilité soumis au titre Ier ter de la loi du 6 juillet 1989 (loi ELAN). Durée
            de 1 à 10 mois, non renouvelable et non reconductible. Le locataire justifie, à la
            date de prise d'effet, être en formation professionnelle, études supérieures,
            contrat d'apprentissage, stage, engagement volontaire de service civique, mutation
            professionnelle ou mission temporaire. Le locataire peut résilier à tout moment avec
            un préavis d'un mois. Aucun dépôt de garantie ne peut être exigé.
          </Text>
        )}

        <Text style={s.h2}>IV. Conditions financières</Text>
        <Text style={s.h3}>Loyer</Text>
        <Text style={s.p}>
          Loyer mensuel hors charges : {formatEuros(bail.loyerHC)}.{' '}
          {bail.charges.mode === 'forfait' ? 'Forfait de charges' : 'Provision sur charges'} :{' '}
          {formatEuros(bail.charges.montant)} par mois ({chargesLabel}). Total mensuel :{' '}
          {formatEuros(bail.loyerHC + bail.charges.montant)}.
        </Text>
        <Text style={s.p}>
          Paiement mensuel, à échoir, le {bail.jourPaiement} de chaque mois. Mode de paiement :{' '}
          {bail.modePaiement || 'virement bancaire'}.
        </Text>
        {bien.zoneEncadrementLoyers && (
          <Text style={s.p}>
            Le logement est situé en zone d'encadrement des loyers. Loyer de référence :{' '}
            {bien.loyerReference != null ? formatEuros(bien.loyerReference) : '—'} ; loyer de
            référence majoré :{' '}
            {bien.loyerReferenceMajore != null ? formatEuros(bien.loyerReferenceMajore) : '—'}.
            {bail.complementLoyer
              ? ` Complément de loyer : ${formatEuros(bail.complementLoyer.montant)} — justification : ${bail.complementLoyer.justification}.`
              : ' Aucun complément de loyer.'}
          </Text>
        )}
        {bail.dernierLoyerAncienLocataire != null && (
          <Text style={s.p}>
            Montant du dernier loyer acquitté par le précédent locataire :{' '}
            {formatEuros(bail.dernierLoyerAncienLocataire)} (précédent locataire parti depuis
            moins de dix-huit mois).
          </Text>
        )}
        <Text style={s.h3}>Révision du loyer</Text>
        <Text style={s.p}>
          {bail.revisionIRL.revisable && bail.typeBail !== 'mobilite'
            ? `Le loyer est révisé annuellement à la date anniversaire du contrat, en fonction de la variation de l'indice de référence des loyers (IRL) publié par l'INSEE. Trimestre de référence : ${bail.revisionIRL.trimestreReference}, valeur de l'indice : ${bail.revisionIRL.valeurIndice}.`
            : 'Le loyer n’est pas révisable pendant la durée du contrat.'}
        </Text>
        <Text style={s.h3}>Dépôt de garantie</Text>
        <Text style={s.p}>
          {bail.typeBail === 'mobilite'
            ? 'Aucun dépôt de garantie (bail mobilité).'
            : `Dépôt de garantie : ${formatEuros(bail.depotGarantie)}, soit au plus deux mois de loyer hors charges (art. 25-6 de la loi du 6 juillet 1989). Il est restitué dans un délai maximal d'un mois après remise des clés si l'état des lieux de sortie est conforme à l'état des lieux d'entrée, deux mois dans le cas contraire, déduction faite des sommes restant dues et des dégradations imputables au locataire. À défaut, le dépôt restant dû est majoré de 10 % du loyer mensuel hors charges par mois de retard commencé.`}
        </Text>

        <Text style={s.h2}>V. Travaux</Text>
        <Text style={s.p}>
          Le cas échéant, la nature et le montant des travaux effectués depuis la fin du dernier
          contrat, ou l'engagement de travaux par le bailleur, sont précisés dans les clauses
          particulières ci-après. Le locataire prend les lieux dans l'état décrit à l'état des
          lieux d'entrée annexé.
        </Text>

        <Text style={s.h2}>VI. Garanties</Text>
        <Text style={s.p}>
          {locataires.some((l) => l.garant)
            ? locataires
                .filter((l) => l.garant)
                .map((l) =>
                  l.garant!.type === 'visale'
                    ? `Le locataire ${l.prenom} ${l.nom} bénéficie de la garantie Visale.`
                    : `Cautionnement de ${l.garant!.prenom} ${l.garant!.nom}, demeurant ${l.garant!.adresse}, pour le locataire ${l.prenom} ${l.nom} (acte de cautionnement joint).`,
                )
                .join(' ')
            : 'Sans objet.'}
        </Text>

        <Text style={s.h2}>VII. Clauses particulières</Text>
        {bail.clausesParticulieres.length === 0 ? (
          <Text style={s.p}>Néant.</Text>
        ) : (
          bail.clausesParticulieres.map((c, i) => (
            <Text style={s.p} key={i}>
              {i + 1}. {c}
            </Text>
          ))
        )}

        <Text style={s.h2}>VIII. Annexes</Text>
        <Text style={s.p}>Sont annexées et jointes au contrat les pièces suivantes :</Text>
        {bail.annexesChecklist.map((a) => (
          <Text style={s.p} key={a.id}>
            {a.jointe ? '☒' : '☐'} {a.libelle}
            {a.genereeParApp ? ' (générée par l’application)' : ''}
          </Text>
        ))}

        <ZoneSignatureManuscrite locataires={locataires.map((l) => `${l.prenom} ${l.nom}`)} />
        <View wrap={false}>
          <Text style={s.petit}>
            Chaque partie reconnaît avoir reçu un exemplaire du contrat et de ses annexes,
            notamment la notice d'information relative aux droits et obligations des locataires
            et des bailleurs (arrêté du 29 mai 2015 modifié).
          </Text>
        </View>
        <PiedDePagePdf hash={hash} />
      </Page>
    </Document>
  );
}
