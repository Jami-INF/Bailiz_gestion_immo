import { Document, Image, Page, Text, View } from '@react-pdf/renderer';
import type { Bail, Bien, Locataire, Parametres } from '@/types';
import { FAMILLE_CLAUSE_LABELS, PERIODE_CONSTRUCTION_LABELS, TYPE_BAIL_LABELS } from '@/types';

import { planDuContrat } from './bailPlan';
import { formatEuros } from '@/lib/calculs';
import { montantEnLettres } from '@/lib/lettres';
import { urlExterneSure } from '@/lib/liens';
import { formatAdresse } from '@/lib/adresse';
import { bailleurRenseigne, designationBailleur, libelleAdresseBailleur, nomBailleur } from '@/lib/bailleur';
import {
  CaseACocher,
  EntetePdf,
  PiedDePagePdf,
  QrCode,
  Rempl,
  SignaturesPdf,
  ZoneSignatureManuscrite,
  formatDateFr,
  pdfStyles as s,
} from './commun';

/** Ligne « intitulé …… valeur » de l'encadré récapitulatif de la page de garde. */
function LigneGarde({ label, valeur }: { label: string; valeur: string }) {
  return (
    <View style={{ flexDirection: 'row', marginBottom: 3 }}>
      <Text style={{ width: '38%', color: '#475569' }}>{label}</Text>
      <Text style={[s.gras, { flex: 1 }]}>{valeur}</Text>
    </View>
  );
}

interface Props {
  bail: Bail;
  bien: Bien;
  locataires: Locataire[];
  parametres: Parametres;
  hash?: string;
  /** Bail rapide : les champs vides s'affichent en zones à compléter à la main. */
  brouillon?: boolean;
  /** Photo du logement en data-URL, illustrant la page de garde (cf. `photoBienEnDataUrl`). */
  photoDataUrl?: string;
}

/**
 * Bail de location meublée à usage de résidence principale.
 * Trame conforme au contrat type du décret n°2015-587 du 29 mai 2015 (annexe 2),
 * complétée des mentions postérieures : identifiant fiscal du logement
 * (décret n°2023-796, baux signés depuis le 01/01/2024) et niveau de
 * performance énergétique avec rappel des critères de décence
 * (loi Climat et résilience).
 */
export function BailPdf({
  bail,
  bien,
  locataires,
  parametres,
  hash,
  brouillon,
  photoDataUrl,
}: Props) {
  const b = parametres.bailleur;
  const chargesLabel =
    bail.charges.mode === 'forfait'
      ? 'forfait de charges (révisable dans les mêmes conditions que le loyer)'
      : 'provisions sur charges avec régularisation annuelle';
  const adresseComplete = [
    formatAdresse(bien.adresse),
    bien.batiment && `Bâtiment ${bien.batiment}`,
    bien.etage && `Étage ${bien.etage}`,
  ]
    .filter(Boolean)
    .join(', ');
  const totalMensuel =
    bail.loyerHC +
    bail.charges.montant +
    (bail.assuranceColocataires ? Math.round((bail.assuranceColocataires.montantAnnuel / 12) * 100) / 100 : 0);

  // Le QR code est scanné par un tiers : seule une URL http(s) valide est encodée.
  const lienDossierTechnique = urlExterneSure(bien.dossierTechniqueUrl);

  // Numérotation et regroupement des clauses : calculés à part, donc testables.
  const { num, sommaire, sousObjet, sousFinances, clausesParFamille } = planDuContrat({
    bail,
    bien,
    locataires,
  });

  // Aide-mémoire des pièces que le locataire doit remettre (adapté au dossier).
  const garants = locataires.filter((l) => l.garant);
  const garantsPhysiques = garants.filter((l) => l.garant!.type !== 'visale');
  const garantsVisale = garants.filter((l) => l.garant!.type === 'visale');
  const piecesLocataire: string[] = [
    `Pièce d'identité en cours de validité (chaque locataire${garantsPhysiques.length ? ' et chaque garant' : ''})`,
    "Attestation d'assurance habitation couvrant les risques locatifs, en cours de validité",
    ...(bail.typeBail !== 'mobilite' ? ['Justificatif du versement du dépôt de garantie'] : []),
    ...(garantsPhysiques.length
      ? [
          'Acte de cautionnement signé par le garant',
          "Pièce d'identité du garant en cours de validité",
          "Dernier avis d'imposition du garant",
          'Trois derniers bulletins de salaire du garant',
          'Justificatif de domicile du garant',
        ]
      : []),
    ...(garantsVisale.length
      ? ['Attestation de garantie Visale en cours de validité (contrat activé par le bailleur sur visale.fr)']
      : []),
    ...(bail.typeBail === 'meuble_etudiant_9mois' ? ["Certificat de scolarité de l'année en cours"] : []),
    ...(bail.typeBail === 'mobilite'
      ? ['Justificatif du motif de mobilité (formation, études, stage, mutation, mission…)']
      : []),
    'Coordonnées bancaires (RIB) pour le paiement du loyer',
    "État des lieux d'entrée signé",
    'Inventaire et état détaillé du mobilier signé',
  ];

  const nomsLocataires = locataires
    .map((l) => `${l.prenom} ${l.nom}`.trim())
    .filter(Boolean)
    .join(', ');

  return (
    <Document title={`${bail.reference} — Bail meublé`} language="fr">
      {/* ------------------------- Page de garde ------------------------- */}
      <Page size="A4" style={s.page}>
        <EntetePdf reference={bail.reference} docTitre="Contrat de location meublée" />
        <View style={[s.titreBloc, { marginTop: photoDataUrl ? 12 : 40 }]}>
          <Text style={s.titre}>Contrat de location de logement meublé</Text>
          <Text style={s.sousTitre}>
            Résidence principale — {TYPE_BAIL_LABELS[bail.typeBail]}. Soumis au titre Ier bis de la
            loi n°89-462 du 6 juillet 1989 et conforme au contrat type annexé au décret n°2015-587
            du 29 mai 2015 modifié.
          </Text>
        </View>

        {photoDataUrl ? (
          <Image
            src={photoDataUrl}
            style={{ width: '100%', height: 150, objectFit: 'cover', borderRadius: 4, marginBottom: 10 }}
          />
        ) : null}

        <View style={s.carte}>
          <LigneGarde label="Bailleur" valeur={nomBailleur(b) || '—'} />
          <LigneGarde label="Locataire(s)" valeur={nomsLocataires || '—'} />
          <LigneGarde label="Logement" valeur={adresseComplete || '—'} />
          <LigneGarde
            label="Durée"
            valeur={`${bail.dureeMois} mois à compter du ${formatDateFr(bail.dateEffet)}`}
          />
          <LigneGarde label="Loyer hors charges (par mois)" valeur={formatEuros(bail.loyerHC)} />
          <LigneGarde
            label={
              bail.charges.mode === 'forfait'
                ? 'Forfait de charges (par mois)'
                : 'Provisions sur charges (par mois)'
            }
            valeur={formatEuros(bail.charges.montant)}
          />
          <LigneGarde
            label="Total mensuel charges comprises"
            valeur={formatEuros(totalMensuel)}
          />
          <LigneGarde
            label="Dépôt de garantie"
            valeur={
              bail.typeBail === 'mobilite' ? 'aucun (bail mobilité)' : formatEuros(bail.depotGarantie)
            }
          />
        </View>

        <Text style={s.h2}>Sommaire</Text>
        {sommaire.map((titre) => (
          <Text key={titre} style={s.tiersLigne}>
            {titre}
          </Text>
        ))}
        <Text style={[s.petit, { marginTop: 6 }]}>
          Le contrat est établi en autant d'exemplaires originaux que de parties,
          chacune en conservant un exemplaire accompagné de ses annexes.
        </Text>

        <PiedDePagePdf hash={hash} paraphes={!bail.signatures} />
      </Page>

      <Page size="A4" style={s.page}>
        <EntetePdf reference={bail.reference} docTitre="Contrat de location meublée" />

        {/* ============================ I ============================ */}
        <Text style={s.h2}>{num('parties')}. Désignation des parties</Text>
        <Text style={s.h3}>{b.qualite === 'indivision' ? 'Les bailleurs' : 'Le bailleur'}</Text>
        <View style={s.tiers}>
          {/* Personne physique, indivision ou société : la rédaction change, et
              c'est `designationBailleur` qui en décide (règle testée à part). */}
          {designationBailleur(b).map((ligne, i) => (
            <Text style={s.p} key={i}>
              {i === 0 && !bailleurRenseigne(b) ? (
                <Rempl v="" brouillon={brouillon} taille={60} />
              ) : (
                ligne
              )}
            </Text>
          ))}
          <Text style={brouillon ? s.tiersLigneAComplecter : s.tiersLigne}>
            {libelleAdresseBailleur(b)} : <Rempl v={b.adresse} brouillon={brouillon} taille={55} />
          </Text>
          <Text style={brouillon ? s.tiersLigneAComplecter : s.tiersLigne}>
            Mail : <Rempl v={b.email} brouillon={brouillon} taille={55} />
            {'     '}Téléphone : <Rempl v={b.telephone} brouillon={brouillon} taille={32} />
          </Text>
        </View>
        <Text style={s.p}>
          {b.qualite === 'personne_morale'
            ? "Le bailleur agit par son représentant légal et n'a pas recours à un mandataire de gestion : la location est conclue en direct, sans intermédiaire."
            : "Le bailleur n'est pas représenté par un mandataire : la location est conclue en direct, sans intermédiaire."}
        </Text>
        <Text style={s.h3}>Le(s) locataire(s)</Text>
        {locataires.map((l) => (
          <View style={s.tiers} key={l.id}>
            <Text style={s.p}>
              {l.civilite === 'Mme' ? 'Mme' : 'M.'} <Rempl v={`${l.prenom} ${l.nom}`.trim()} brouillon={brouillon} taille={40} />
              {(l.dateNaissance || l.lieuNaissance || brouillon) && (
                <>
                  , né(e) le <Rempl v={l.dateNaissance ? formatDateFr(l.dateNaissance) : undefined} brouillon={brouillon} taille={20} /> à{' '}
                  <Rempl v={l.lieuNaissance} brouillon={brouillon} taille={28} />
                </>
              )}
            </Text>
            <Text style={brouillon ? s.tiersLigneAComplecter : s.tiersLigne}>
              Mail : <Rempl v={l.email} brouillon={brouillon} taille={55} />
              {'     '}Téléphone : <Rempl v={l.telephone} brouillon={brouillon} taille={32} />
            </Text>
            {(l.adresseActuelle || brouillon) && (
              <Text style={brouillon ? s.tiersLigneAComplecter : s.tiersLigne}>
                Adresse actuelle : <Rempl v={l.adresseActuelle} brouillon={brouillon} taille={55} />
              </Text>
            )}
          </View>
        ))}
        {locataires.some((l) => l.garant) && (
          <>
            <Text style={s.h3}>Garant(s)</Text>
            {locataires
              .filter((l) => l.garant)
              .map((l) =>
                l.garant!.type === 'visale' ? (
                  <Text style={s.tiersLigne} key={l.id}>
                    Garantie Visale (Action Logement) au bénéfice de {l.prenom} {l.nom}
                    {l.garant!.numeroVisa ? ` — visa n°${l.garant!.numeroVisa}` : ''}.
                  </Text>
                ) : (
                  <Text style={s.tiersLigne} key={l.id}>
                    {l.garant!.prenom} {l.garant!.nom}, demeurant{' '}
                    <Rempl v={l.garant!.adresse} brouillon={brouillon} taille={55} /> — caution de{' '}
                    {l.prenom} {l.nom} (acte de cautionnement joint).
                  </Text>
                ),
              )}
          </>
        )}

        {/* ============================ II ============================ */}
        <Text style={s.h2}>{num('objet')}. Objet du contrat</Text>
        <Text style={s.h3}>{sousObjet.consistance}. Consistance du logement</Text>
        <Text style={s.p}>
          Adresse : <Rempl v={adresseComplete} brouillon={brouillon} taille={55} />.{' '}
          {bail.typeBail !== 'mobilite' && (
            <>
              Identifiant fiscal du logement :{' '}
              {bien.identifiantFiscal ?? 'non communiqué à la date de rédaction'}.{' '}
            </>
          )}
          Type : <Rempl v={bien.type} brouillon={brouillon} taille={6} />,{' '}
          <Rempl v={bien.nbPieces || undefined} brouillon={brouillon} taille={5} /> pièce
          {bien.nbPieces > 1 ? 's' : ''} principale{bien.nbPieces > 1 ? 's' : ''}. Surface habitable :{' '}
          <Rempl v={bien.surfaceBoutin || undefined} brouillon={brouillon} taille={8} /> m² (loi
          Boutin).
        </Text>
        <Text style={s.p}>
          Type d'habitat :{' '}
          {bien.typeHabitat === 'individuel' ? 'immeuble individuel' : 'immeuble collectif'}.
          Régime juridique de l'immeuble :{' '}
          {bien.regimeJuridique === 'copropriete' ? 'copropriété' : 'monopropriété'}. Période de
          construction :{' '}
          {bien.periodeConstruction
            ? PERIODE_CONSTRUCTION_LABELS[bien.periodeConstruction]
            : 'non renseignée (voir dossier de diagnostic technique)'}
          .
        </Text>
        <Text style={s.p}>
          Chauffage : {bien.chauffage.type}
          {bien.chauffage.energie.trim() ? ` (${bien.chauffage.energie.trim()})` : ''}. Eau chaude
          sanitaire : {bien.eauChaude.type === 'individuel' ? 'individuelle' : 'collective'}
          {bien.eauChaude.energie.trim() ? ` (${bien.eauChaude.energie.trim()})` : ''}.
          {(bien.chauffage.type === 'collectif' || bien.eauChaude.type === 'collectif') &&
            ' Pour les installations collectives, la consommation du locataire est répartie via les charges récupérables.'}
        </Text>
        <Text style={s.p}>
          Niveau de performance énergétique (DPE) :{' '}
          {bien.classeDPE ? `classe ${bien.classeDPE}` : 'voir diagnostic joint au dossier de diagnostic technique'}
          . Rappel : un logement décent doit atteindre au minimum la classe F depuis le 1er
          janvier 2025, la classe E à compter du 1er janvier 2028 et la classe D à compter du
          1er janvier 2034 (France métropolitaine, art. 6 de la loi du 6 juillet 1989 modifié
          par la loi Climat et résilience).
        </Text>
        {bien.equipementsPrivatifs.length > 0 && (
          <>
            <Text style={s.h3}>Équipements du logement</Text>
            <Text style={s.p}>{bien.equipementsPrivatifs.join(' ; ')}.</Text>
          </>
        )}
        <Text style={s.h3}>{sousObjet.destination}. Destination des locaux</Text>
        <Text style={s.p}>
          Usage d'habitation exclusivement, à titre de résidence principale du locataire. Le
          logement est loué meublé ; l'inventaire et l'état détaillé du mobilier sont annexés au
          présent contrat.
        </Text>
        {bien.servitudeResidencePrincipale && (
          <Text style={s.p}>
            <Text style={s.gras}>Servitude de résidence principale</Text> : le logement objet du
            présent contrat est soumis à l'obligation prévue à l'article L.151-14-1 du code de
            l'urbanisme ; il est à usage exclusif de résidence principale, au sens de l'article 2
            de la loi du 6 juillet 1989.
          </Text>
        )}
        {bien.annexes.length > 0 && (
          <>
            <Text style={s.h3}>
              {sousObjet.accessoires}. Locaux et équipements accessoires à usage privatif
            </Text>
            <Text style={s.p}>
              {bien.annexes.map((a) => `${a.type} : ${a.description}`).join(' ; ')}.
            </Text>
          </>
        )}
        {bien.partiesCommunes.length > 0 && (
          <>
            <Text style={s.h3}>
              {sousObjet.communs}. Parties, équipements et accessoires à usage commun
            </Text>
            <Text style={s.p}>{bien.partiesCommunes.join(' ; ')}.</Text>
          </>
        )}
        <Text style={s.h3}>
          {sousObjet.tic}. Accès aux technologies de l'information et de la communication
        </Text>
        <Text style={s.p}>
          {bien.equipementsTIC ??
            'Non renseigné (modalités de réception de la télévision et de raccordement internet à préciser).'}
        </Text>

        {/* ============================ III ============================ */}
        <Text style={s.h2}>{num('duree')}. Date de prise d'effet et durée du contrat</Text>
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

        {/* ============================ IV ============================ */}
        <Text style={s.h2}>{num('finances')}. Conditions financières</Text>
        <Text style={s.h3}>{sousFinances.loyer}. Loyer</Text>
        <Text style={s.p}>
          Loyer mensuel hors charges :{' '}
          <Rempl v={bail.loyerHC ? formatEuros(bail.loyerHC) : undefined} brouillon={brouillon} taille={12} />.
        </Text>
        <Text style={s.p}>
          {bien.zoneTendue
            ? "Le logement est situé en zone d'urbanisation continue de plus de 50 000 habitants (zone tendue) : le loyer est soumis au décret fixant annuellement le montant maximum d'évolution des loyers à la relocation."
            : "Le loyer n'est pas soumis au décret fixant annuellement le montant maximum d'évolution des loyers à la relocation."}
        </Text>
        {bien.zoneEncadrementLoyers && (
          <Text style={s.p}>
            Le logement est en outre soumis au loyer de référence majoré fixé par arrêté
            préfectoral. Loyer de référence :{' '}
            {bien.loyerReference != null ? formatEuros(bien.loyerReference) : '—'} ; loyer de
            référence majoré :{' '}
            {bien.loyerReferenceMajore != null ? formatEuros(bien.loyerReferenceMajore) : '—'}.
            {bail.complementLoyer
              ? ` Complément de loyer : ${formatEuros(bail.complementLoyer.montant)} — caractéristiques le justifiant : ${bail.complementLoyer.justification}.`
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
        {bail.revisionIRL.revisable && bail.typeBail !== 'mobilite' ? (
          <>
            <Text style={s.p}>
              Le loyer est révisé de plein droit chaque année à la date anniversaire de la prise
              d'effet du contrat, en fonction de la variation de l'indice de référence des loyers
              (IRL) publié par l'INSEE, sans que cette révision puisse excéder cette variation.
              Trimestre de référence :{' '}
              <Rempl v={bail.revisionIRL.trimestreReference || undefined} brouillon={brouillon} taille={22} />
              , valeur de l'indice :{' '}
              <Rempl v={bail.revisionIRL.valeurIndice || undefined} brouillon={brouillon} taille={10} />.
            </Text>
            <Text style={s.petit}>
              La révision doit être demandée dans l'année qui suit la date à laquelle elle est
              exigible ; à défaut, elle est perdue pour l'année écoulée et ne prend effet qu'à la
              date de la demande, sans rétroactivité.
            </Text>
          </>
        ) : (
          <Text style={s.p}>
            {bail.typeBail === 'mobilite'
              ? "Le loyer n'est pas révisable : le bail mobilité n'est ni renouvelable ni reconductible."
              : "Le loyer n'est pas révisable pendant la durée du contrat, faute de clause d'indexation."}
          </Text>
        )}
        <Text style={s.h3}>{sousFinances.charges}. Charges récupérables</Text>
        <Text style={s.p}>
          {bail.charges.mode === 'forfait' ? 'Forfait de charges' : 'Provisions sur charges'} :{' '}
          {formatEuros(bail.charges.montant)} par mois ({chargesLabel}).
        </Text>
        {bail.assuranceColocataires && (
          <>
            <Text style={s.h3}>
              {sousFinances.assurance}. Assurance pour le compte des colocataires
            </Text>
            <Text style={s.p}>
              Le bailleur a souscrit une assurance pour le compte des colocataires (art. 8-1 de
              la loi du 6 juillet 1989). Montant annuel récupérable :{' '}
              {formatEuros(bail.assuranceColocataires.montantAnnuel)}, récupérable par douzième
              chaque mois, soit {formatEuros(Math.round((bail.assuranceColocataires.montantAnnuel / 12) * 100) / 100)}{' '}
              par mois.
            </Text>
          </>
        )}
        <Text style={s.h3}>{sousFinances.paiement}. Modalités de paiement</Text>
        <Text style={s.p}>
          Le loyer est payé mensuellement, à échoir, avant le {bail.jourPaiement} de chaque
          mois. Mode de paiement : {bail.modePaiement || 'virement bancaire'}. Montant total dû
          pour un mois de location : {formatEuros(totalMensuel)} (loyer {formatEuros(bail.loyerHC)}
          {' + '}charges {formatEuros(bail.charges.montant)}
          {bail.assuranceColocataires ? ' + assurance récupérable' : ''}).
        </Text>

        {/* ============================ V ============================ */}
        <Text style={s.h2}>{num('travaux')}. Travaux</Text>
        <Text style={s.p}>
          A. Travaux d'amélioration ou de mise en conformité avec les caractéristiques de
          décence effectués depuis la fin du dernier contrat :{' '}
          {bail.travaux?.depuisDernierBail ?? 'néant'}.
        </Text>
        <Text style={s.p}>
          B. Majoration de loyer en cours de bail consécutive à des travaux d'amélioration
          entrepris par le bailleur : {bail.travaux?.majorationBailleur ?? 'néant'}.
        </Text>
        <Text style={s.p}>
          C. Diminution de loyer en cours de bail consécutive à des travaux entrepris par le
          locataire : {bail.travaux?.diminutionLocataire ?? 'néant'}.
        </Text>

        {/* ============================ VI ============================ */}
        <Text style={s.h2}>{num('garanties')}. Garanties</Text>
        <Text style={s.p}>
          {bail.typeBail === 'mobilite'
            ? 'Aucun dépôt de garantie ne peut être exigé (bail mobilité).'
            : `Dépôt de garantie : ${formatEuros(bail.depotGarantie)} (en toutes lettres : ${montantEnLettres(bail.depotGarantie)}), soit au plus deux mois de loyer hors charges (art. 25-6 de la loi du 6 juillet 1989). Il est restitué dans un délai maximal d'un mois après remise des clés si l'état des lieux de sortie est conforme à l'état des lieux d'entrée, deux mois dans le cas contraire, déduction faite des sommes restant dues et des dégradations imputables au locataire. À défaut, le dépôt restant dû est majoré de 10 % du loyer mensuel hors charges par mois de retard commencé.`}
        </Text>
        {locataires.some((l) => l.garant) && (
          <Text style={s.p}>
            {locataires
              .filter((l) => l.garant)
              .map((l, i) => (
                <Text key={l.id}>
                  {i > 0 ? ' ' : ''}
                  {l.garant!.type === 'visale' ? (
                    <>Le locataire {l.prenom} {l.nom} bénéficie de la garantie Visale (Action Logement).</>
                  ) : (
                    <>
                      Cautionnement de {l.garant!.prenom} {l.garant!.nom}, demeurant{' '}
                      <Rempl v={l.garant!.adresse} brouillon={brouillon} taille={30} />, pour le
                      locataire {l.prenom} {l.nom} (acte de cautionnement joint).
                    </>
                  )}
                </Text>
              ))}
          </Text>
        )}

        {/* ============================ VII ============================ */}
        {/* Locataire unique : la partie entière est omise plutôt que de porter
            une mention « sans objet » qui décale la numérotation pour rien. */}
        {locataires.length > 1 && (
          <>
            <Text style={s.h2}>{num('solidarite')}. Clause de solidarité</Text>
            <Text style={s.p}>
              {bail.clauseSolidarite
                ? "Pour l'exécution de toutes les obligations du présent contrat, il y aura solidarité et indivisibilité entre les locataires, ainsi qu'entre eux et leurs cautions. La solidarité d'un colocataire ayant donné congé s'éteint à la date d'effet de son congé si un nouveau colocataire le remplace, et au plus tard six mois après cette date (art. 8-1 de la loi du 6 juillet 1989)."
                : 'Les locataires ne sont pas tenus solidairement.'}
            </Text>
          </>
        )}

        {/* ============================ VIII ============================ */}
        <Text style={s.h2}>{num('resolutoire')}. Clause résolutoire</Text>
        <Text style={s.p}>
          Le présent contrat sera résilié de plein droit, après délivrance d'un commandement de
          payer ou d'un commandement demeuré infructueux, dans les conditions des articles 24 de
          la loi du 6 juillet 1989 et 1225 du code civil :
        </Text>
        <View style={s.carte}>
          <Text style={s.p}>
            – en cas de <Text style={s.gras}>défaut de paiement du loyer ou des charges</Text>{' '}
            (forfait, provisions ou régularisation annuelle) aux termes convenus ;
          </Text>
          <Text style={s.p}>
            – en cas de <Text style={s.gras}>non-versement du dépôt de garantie</Text> ;
          </Text>
          <Text style={s.p}>
            – en cas de <Text style={s.gras}>défaut d'assurance</Text> des risques locatifs par le
            locataire (sauf assurance souscrite par le bailleur pour son compte) — le locataire
            justifie de cette assurance à la remise des clés puis chaque année à la demande du
            bailleur ;
          </Text>
          <Text style={s.p}>
            – en cas de <Text style={s.gras}>troubles de voisinage</Text> constatés par une
            décision de justice passée en force de chose jugée
            {bien.servitudeResidencePrincipale && bail.resiliationResidencePrincipale ? ' ;' : '.'}
          </Text>
          {bien.servitudeResidencePrincipale && bail.resiliationResidencePrincipale && (
            <Text style={s.p}>
              – en cas de <Text style={s.gras}>non-respect de l'obligation de résidence
              principale</Text> prévue à l'article L.151-14-1 du code de l'urbanisme.
            </Text>
          )}
        </View>
        <Text style={s.petit}>
          Les deux premiers motifs sont obligatoires (loi n°2023-668 du 27 juillet 2023). La
          clause ne produit effet que six semaines après un commandement de payer demeuré
          infructueux, délai porté à deux mois pour les contrats conclus avant le 29 juillet 2023.
          Le juge peut accorder des délais de paiement au locataire, qui suspendent les effets de
          la clause.
        </Text>

        {/* ============================ IX ============================ */}
        <Text style={s.h2}>{num('honoraires')}. Honoraires de location</Text>
        <Text style={s.p}>
          Néant : la location est conclue directement entre le bailleur et le locataire, sans le
          concours d'une personne mandatée et rémunérée à cette fin (art. 5-I de la loi du 6
          juillet 1989).
        </Text>

        {/* ============================ X ============================ */}
        {clausesParFamille.length > 0 && (
          <>
            <Text style={s.h2}>{num('clauses')}. Conditions générales d'occupation</Text>
            <Text style={s.petit}>
              Les stipulations qui suivent complètent les obligations légales des parties. Aucune
              ne déroge aux dispositions d'ordre public de la loi du 6 juillet 1989.
            </Text>
            {clausesParFamille.map(([famille, clauses], iFamille) => (
              <View key={famille}>
                <Text style={s.h3}>
                  {`${num('clauses')}.${String.fromCharCode(65 + iFamille)}. `}
                  {FAMILLE_CLAUSE_LABELS[famille]}
                </Text>
                {clauses.map((clause, i) => (
                  <View key={clause.id} wrap={false} style={{ marginBottom: 6 }}>
                    <Text style={s.p}>
                      <Text style={s.gras}>
                        {`${num('clauses')}.${String.fromCharCode(65 + iFamille)}.${i + 1} — ${clause.titre}. `}
                      </Text>
                      {clause.texte}
                    </Text>
                    {clause.baseLegale && <Text style={s.petit}>({clause.baseLegale})</Text>}
                  </View>
                ))}
              </View>
            ))}
          </>
        )}

        {/* ============================ XI ============================ */}
        <Text style={s.h2}>{num('particulieres')}. Autres conditions particulières</Text>
        {bail.clausesParticulieres.length === 0 ? (
          <Text style={s.p}>Néant.</Text>
        ) : (
          bail.clausesParticulieres.map((c, i) => (
            <Text style={s.p} key={i}>
              {i + 1}. {c}
            </Text>
          ))
        )}

        {/* ============================ XII ============================ */}
        <Text style={s.h2}>{num('annexes')}. Annexes</Text>
        <Text style={s.p}>Sont annexées et jointes au contrat les pièces suivantes :</Text>
        {bail.annexesChecklist.map((a) => (
          <CaseACocher key={a.id} cochee={a.jointe}>
            {a.libelle}
            {a.genereeParApp ? ' (générée par l’application)' : ''}
          </CaseACocher>
        ))}
        {lienDossierTechnique && (
          <View style={[s.carte, { flexDirection: 'row', alignItems: 'center' }]} wrap={false}>
            <QrCode value={lienDossierTechnique} taille={92} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[s.gras, { marginBottom: 3 }]}>
                Dossier de diagnostic technique — accès en ligne
              </Text>
              <Text style={s.petit}>
                Scannez ce QR code pour consulter les diagnostics du logement (DPE, ERP,
                électricité/gaz, surface…) mis à disposition par le bailleur.
              </Text>
              <Text style={[s.petit, { marginTop: 4 }]}>{lienDossierTechnique}</Text>
            </View>
          </View>
        )}

        {bail.signatures ? (
          <SignaturesPdf
            signatures={bail.signatures}
            mention="Signature électronique simple réalisée sur écran (art. 1366 et 1367 du Code civil), assortie d'un horodatage et de l'empreinte SHA-256 du document."
          />
        ) : (
          <ZoneSignatureManuscrite locataires={locataires.map((l) => `${l.prenom} ${l.nom}`)} />
        )}
        <View wrap={false}>
          <Text style={s.petit}>
            Chaque partie reconnaît avoir reçu un exemplaire du contrat et de ses annexes,
            notamment la notice d'information relative aux droits et obligations des locataires
            et des bailleurs (arrêté du 29 mai 2015 modifié).
          </Text>
        </View>
        <View wrap={false} style={{ marginTop: 18 }}>
          <Text style={s.h2}>Pièces à remettre par le locataire</Text>
          <Text style={s.petit}>
            Aide-mémoire non contractuel — à cocher lors de la remise des clés pour vérifier que le
            dossier est complet.
          </Text>
          <View style={{ marginTop: 6 }}>
            {piecesLocataire.map((p, i) => (
              <CaseACocher key={i}>{p}</CaseACocher>
            ))}
          </View>
        </View>
        <PiedDePagePdf hash={hash} paraphes={!bail.signatures} />
      </Page>
    </Document>
  );
}
