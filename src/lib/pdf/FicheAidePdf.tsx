import { Document, Page, Text } from '@react-pdf/renderer';
import { EntetePdf, PiedDePagePdf, formatDateFr, pdfStyles as s } from './commun';

/**
 * Fiche d'aide juridique du bailleur meublé : préavis, congés, formes de
 * notification, impayés, dépôt de garantie, délais de prescription et
 * interlocuteurs en cas de litige. Références : loi n°89-462 du 6 juillet 1989
 * (titre Ier bis), loi n°2023-668 du 27 juillet 2023, décrets 2015-587,
 * 2015-981, 2016-382, 87-712.
 */
export function FicheAidePdf({ reference }: { reference: string }) {
  return (
    <Document title={`${reference} — Fiche d'aide juridique du bailleur meublé`} language="fr">
      <Page size="A4" style={s.page}>
        <EntetePdf reference={reference} docTitre="Fiche d'aide juridique — location meublée" />
        <Text style={s.titre}>Fiche d'aide juridique du bailleur meublé</Text>
        <Text style={s.sousTitre}>
          Résidence principale, location meublée (titre Ier bis de la loi du 6 juillet 1989).
          Générée le {formatDateFr(new Date().toISOString())} — les règles évoluent : vérifiez
          sur service-public.fr avant toute action contentieuse. Ce document est une aide, pas
          un conseil juridique.
        </Text>

        <Text style={s.h2}>1. Préavis et congés</Text>
        <Text style={s.h3}>Congé donné par le locataire</Text>
        <Text style={s.p}>
          – Préavis d'1 mois, à tout moment, sans motif (art. 25-8). Le délai court à compter
          du jour de réception de la lettre recommandée, de la signification par commissaire de
          justice ou de la remise en main propre.
        </Text>
        <Text style={s.p}>
          – Le loyer reste dû pendant tout le préavis, sauf si le logement est reloué avant la
          fin de celui-ci avec votre accord. Le locataire ne peut pas déduire le dépôt de
          garantie du dernier loyer.
        </Text>
        <Text style={s.h3}>Congé donné par le bailleur</Text>
        <Text style={s.p}>
          – Uniquement pour l'échéance du bail, avec un préavis de 3 mois, et pour l'un des
          trois motifs suivants : reprise pour habiter (vous ou un proche — préciser nom et
          lien), vente du logement, ou motif légitime et sérieux (impayés répétés, troubles…).
          Le congé doit être motivé, sous peine de nullité.
        </Text>
        <Text style={s.p}>
          – Bail étudiant 9 mois : prend fin de plein droit au terme, sans congé à donner. Bail
          mobilité : idem au terme prévu.
        </Text>
        <Text style={s.p}>
          – Protection des locataires âgés : si le locataire a plus de 65 ans et des ressources
          modestes, le congé n'est possible qu'en proposant un relogement adapté (sauf si vous
          avez vous-même plus de 65 ans ou de faibles ressources).
        </Text>

        <Text style={s.h2}>2. Notification : les formes qui comptent</Text>
        <Text style={s.p}>
          Tout congé, mise en demeure ou notification importante doit être fait par : lettre
          recommandée avec avis de réception (LRAR), acte de commissaire de justice
          (ex-huissier), ou remise en main propre contre récépissé ou émargement. Un e-mail ou
          un SMS n'a pas de valeur de notification. Les délais courent à la
          <Text style={s.gras}> réception</Text> (LRAR non retirée = non notifiée pour un
          congé : en cas de doute, préférez le commissaire de justice).
        </Text>

        <Text style={s.h2}>3. Impayés de loyer : la marche à suivre</Text>
        <Text style={s.p}>
          a) Dès le premier retard : relance simple (courrier, e-mail), puis mise en demeure en
          LRAR.
        </Text>
        <Text style={s.p}>
          b) Le cas échéant, actionner la caution (LRAR au garant) ou la garantie Visale
          (déclaration en ligne sur visale.fr dès 1 mois d'impayé), et signaler à votre
          assurance loyers impayés si vous en avez une.
        </Text>
        <Text style={s.p}>
          c) Clause résolutoire : faire délivrer par commissaire de justice un commandement de
          payer. Le locataire dispose de 6 semaines pour régler (baux signés depuis le 29
          juillet 2023 — loi n°2023-668 ; 2 mois pour les baux antérieurs). À défaut de
          paiement, saisir le juge des contentieux de la protection pour constater la
          résiliation et ordonner l'expulsion.
        </Text>
        <Text style={s.p}>
          d) À savoir : trêve hivernale du 1er novembre au 31 mars (pas d'expulsion, sauf
          relogement ou squat) ; ne jamais changer les serrures ni couper les fluides soi-même
          (délit, jusqu'à 3 ans d'emprisonnement).
        </Text>

        <Text style={s.h2}>4. Dépôt de garantie</Text>
        <Text style={s.p}>
          – Maximum 2 mois de loyer hors charges (interdit en bail mobilité). Restitution sous
          1 mois après remise des clés si l'EDL de sortie est conforme à l'entrée, 2 mois
          sinon, déduction faite des sommes justifiées (devis/factures à joindre au décompte).
        </Text>
        <Text style={s.p}>
          – Retard = majoration de 10 % du loyer mensuel hors charges par mois de retard
          commencé. En copropriété, vous pouvez conserver jusqu'à 20 % du dépôt jusqu'à
          l'arrêté annuel des comptes de charges.
        </Text>

        <Text style={s.h2}>5. État des lieux et vétusté</Text>
        <Text style={s.p}>
          – Le locataire peut demander à compléter l'EDL d'entrée pendant 10 jours (et pendant
          le 1er mois de la période de chauffe pour le chauffage) : répondez par avenant.
        </Text>
        <Text style={s.p}>
          – Sans EDL d'entrée, le locataire est présumé avoir reçu le logement en bon état…
          mais c'est au bailleur que ce défaut profite le moins : sans comparaison possible,
          aucune retenue pour dégradation ne tient. Faites-le systématiquement.
        </Text>
        <Text style={s.p}>
          – Usure normale (vétusté) = à votre charge ; dégradation anormale = à la charge du
          locataire, après application de la grille de vétusté annexée au bail.
        </Text>

        <Text style={s.h2}>6. Loyer, charges, révision : les délais à connaître</Text>
        <Text style={s.p}>
          – Révision IRL : à demander dans l'année qui suit sa date d'application prévue ;
          elle ne rétroagit pas (elle prend effet à la date de la demande).
        </Text>
        <Text style={s.p}>
          – Prescription générale des loyers, charges et régularisations : 3 ans (art. 7-1) —
          au-delà, les sommes ne sont plus récupérables.
        </Text>
        <Text style={s.p}>
          – Assurance du locataire : attestation exigible à la remise des clés puis chaque
          année. À défaut : mise en demeure, puis résiliation (si clause résolutoire) ou
          souscription d'une assurance pour son compte, récupérable par douzième.
        </Text>

        <Text style={s.h2}>7. En cas de litige : vos interlocuteurs</Text>
        <Text style={s.p}>
          – ADIL de votre département : conseil juridique gratuit pour bailleurs et locataires
          (anil.org).
        </Text>
        <Text style={s.p}>
          – Commission départementale de conciliation (gratuite) : obligatoire avant le juge
          pour certains litiges (dépôt de garantie, EDL, charges…), recommandée pour tous.
        </Text>
        <Text style={s.p}>
          – Juge des contentieux de la protection du tribunal dont dépend le logement
          (représentation par avocat non obligatoire pour la plupart des litiges locatifs).
        </Text>
        <Text style={s.p}>
          – Conservez tout : bail signé et annexes, EDL avec empreintes SHA-256, quittances,
          échanges écrits, décomptes. En procédure, la qualité du dossier fait la décision.
        </Text>
        <PiedDePagePdf />
      </Page>
    </Document>
  );
}
