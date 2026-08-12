import { Document, Image, Page, Text, View } from '@react-pdf/renderer';
import type { ReactNode } from 'react';
import type { Bien, ConditionSection, ModeleFicheVisite, Parametres } from '@/types';
import { formatEuros } from '@/lib/calculs';
import { formatAdresse } from '@/lib/adresse';
import { ActeCautionnementPage } from './ActeCautionnementPdf';
import { nomBailleur } from '@/lib/bailleur';
import {
  CaseACocher,
  EntetePdf,
  PiedDePagePdf,
  Rempl,
  formatDateFr,
  pdfStyles as s,
} from './commun';

export interface DonneesVisite {
  /** Date de la visite (ISO court). Vide = zone à compléter à la main. */
  date?: string;
  /** Heure de la visite, format libre (« 18 h 30 »). */
  heure?: string;
  /** Situations retenues : conditionnent les sections du dossier. */
  situations: ConditionSection[];
}

/** Ligne « Libellé : valeur », omise si la valeur est absente. */
function Ligne({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Text style={s.tiersLigne}>
      <Text style={s.gras}>{label} : </Text>
      {children}
    </Text>
  );
}

/**
 * Ligne toujours imprimée : une valeur absente devient une zone pointillée, et
 * la ligne s'aère alors pour laisser la place d'écrire à la main.
 */
function LigneAComplecter({ label, valeur, taille }: { label: string; valeur?: string | number; taille?: number }) {
  return (
    <Text style={valeur === undefined ? s.tiersLigneAComplecter : s.tiersLigne}>
      <Text style={s.gras}>{label} : </Text>
      <Rempl v={valeur} brouillon taille={taille} />
    </Text>
  );
}

/** Texte libre du modèle : une ligne saisie = un paragraphe. */
function Paragraphes({ texte, petit }: { texte: string; petit?: boolean }) {
  return (
    <>
      {texte
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((ligne, i) => (
          <Text key={i} style={petit ? [s.p, s.petit] : s.p}>
            {ligne}
          </Text>
        ))}
    </>
  );
}

/**
 * Fiche remise au candidat à la fin d'une visite : page 1, le logement et ses
 * conditions ; page 2, les pièces du dossier de candidature, en cases à cocher ;
 * puis, si le candidat se présente avec un **garant personne physique**, l'acte
 * de cautionnement pré-rempli, prêt à faire signer.
 *
 * La liste des pièces provient du modèle éditable des Paramètres, pré-rempli
 * conformément au décret n°2015-1437 (liste **limitative** des pièces
 * exigibles). La fiche ne mentionne pas le dossier technique du logement : il
 * est remis plus tard, en annexe du bail.
 *
 * Ce document n'est pas un contrat : ni signature, ni empreinte. Seul l'acte de
 * cautionnement joint est destiné à être signé - à la main, après impression.
 */
export function FicheVisitePdf({
  reference,
  bien,
  parametres,
  modele,
  visite,
  photoDataUrl,
}: {
  reference: string;
  bien: Bien;
  parametres: Parametres;
  modele: ModeleFicheVisite;
  visite: DonneesVisite;
  /** Photo du logement en data-URL (les Blob ne sont pas rendus par react-pdf). */
  photoDataUrl?: string;
}) {
  const c = bien.conditionsLocation ?? {};
  const charges = c.charges?.montant;
  const totalCC = c.loyerHC !== undefined ? c.loyerHC + (charges ?? 0) : undefined;
  const bailleur = parametres.bailleur;
  // Garant personne physique : l'acte de cautionnement est joint à la fiche,
  // pré-rempli avec ce que le logement connaît déjà. Le locataire, le garant et
  // la durée du bail restent des zones à compléter à la main.
  const acteCautionnement = visite.situations.includes('garant_physique');
  const designation = nomBailleur(bailleur);

  const sections = modele.sections
    .filter((sec) => sec.condition === 'toujours' || visite.situations.includes(sec.condition))
    .map((sec) => ({ ...sec, pieces: sec.pieces.filter((p) => p.actif) }))
    .filter((sec) => sec.pieces.length > 0);

  return (
    <Document title={`${reference} - Fiche de visite - ${bien.nom}`} language="fr">
      {/* ---------------------- Page 1 : le logement ---------------------- */}
      <Page size="A4" style={s.page}>
        <EntetePdf reference={reference} docTitre="Fiche de visite" />
        <View style={s.titreBloc}>
          <Text style={s.titre}>Fiche de visite</Text>
          <Text style={s.sousTitre}>{formatAdresse(bien.adresse)}</Text>
        </View>

        {photoDataUrl ? (
          <Image
            src={photoDataUrl}
            style={{ width: '100%', height: 148, objectFit: 'cover', borderRadius: 4, marginBottom: 10 }}
          />
        ) : null}

        <Text style={s.h2}>Le logement</Text>
        <View style={s.tiers}>
          <Ligne label="Adresse">
            {formatAdresse(bien.adresse)}
            {bien.batiment ? `, bâtiment ${bien.batiment}` : ''}
            {bien.etage ? `, ${bien.etage} étage` : ''}
          </Ligne>
          <Ligne label="Type">
            {bien.type} - {bien.nbPieces} pièce{bien.nbPieces > 1 ? 's' : ''} principale
            {bien.nbPieces > 1 ? 's' : ''}
            {bien.surfaceBoutin ? `, ${bien.surfaceBoutin} m² (surface loi Boutin)` : ''}
          </Ligne>
          <Ligne label="Location">
            meublée - le logement est équipé conformément au décret n°2015-981 (literie,
            occultation, plaques de cuisson, four, réfrigérateur, vaisselle, ustensiles, table et
            sièges, rangements, luminaires, matériel d'entretien)
          </Ligne>
          <Ligne label="Chauffage">
            {bien.chauffage.type === 'collectif' ? 'collectif' : 'individuel'} ({bien.chauffage.energie})
            {' - eau chaude '}
            {bien.eauChaude.type === 'collectif' ? 'collective' : 'individuelle'} ({bien.eauChaude.energie})
          </Ligne>
          {bien.classeDPE ? (
            <Ligne label="Diagnostic de performance énergétique">
              classe {bien.classeDPE}
              {['F', 'G'].includes(bien.classeDPE) ? ' (logement énergivore)' : ''}
            </Ligne>
          ) : null}
          {bien.equipementsTIC ? <Ligne label="Internet et télévision">{bien.equipementsTIC}</Ligne> : null}
          {bien.equipementsPrivatifs.length > 0 ? (
            <Ligne label="Équipements">{bien.equipementsPrivatifs.join(', ')}</Ligne>
          ) : null}
          {bien.partiesCommunes.length > 0 ? (
            <Ligne label="Parties communes">{bien.partiesCommunes.join(', ')}</Ligne>
          ) : null}
          {bien.annexes.length > 0 ? (
            <Ligne label="Annexes">{bien.annexes.map((a) => `${a.type} (${a.description})`).join(', ')}</Ligne>
          ) : null}
          <Ligne label="Immeuble">
            {bien.regimeJuridique === 'copropriete' ? 'en copropriété' : 'en monopropriété'}
            {bien.typeHabitat === 'individuel' ? ', habitat individuel' : ', habitat collectif'}
          </Ligne>
        </View>

        {modele.blocs.conditionsFinancieres && (
          <>
            <Text style={s.h2}>Conditions de location</Text>
            <View style={s.carte}>
              {/* La périodicité est portée par le libellé : react-pdf avale
                  l'espace qui suit le symbole « € » en milieu de ligne. */}
              <LigneAComplecter
                label="Loyer hors charges (par mois)"
                valeur={c.loyerHC !== undefined ? formatEuros(c.loyerHC) : undefined}
                taille={14}
              />
              <LigneAComplecter
                label={`Charges, ${c.charges?.mode === 'provisions' ? 'provisions sur charges' : 'forfait'} (par mois)`}
                valeur={charges !== undefined ? formatEuros(charges) : undefined}
                taille={14}
              />
              <LigneAComplecter
                label="Total charges comprises (par mois)"
                valeur={totalCC !== undefined ? formatEuros(totalCC) : undefined}
                taille={14}
              />
              <LigneAComplecter
                label="Dépôt de garantie"
                valeur={c.depotGarantie !== undefined ? formatEuros(c.depotGarantie) : undefined}
                taille={14}
              />
              <LigneAComplecter
                label="Disponible à partir du"
                valeur={c.dateDisponibilite ? formatDateFr(c.dateDisponibilite) : undefined}
                taille={14}
              />
            </View>
            {c.chargesDetail ? <Ligne label="Les charges couvrent">{c.chargesDetail}</Ligne> : null}
            {c.conditionsParticulieres ? (
              <Ligne label="Conditions particulières">{c.conditionsParticulieres}</Ligne>
            ) : null}
            {bien.zoneEncadrementLoyers ? (
              <Text style={s.p}>
                Logement situé en <Text style={s.gras}>zone d'encadrement des loyers</Text>.
                {bien.loyerReference ? ` Loyer de référence : ${formatEuros(bien.loyerReference)}.` : ''}
                {bien.loyerReferenceMajore
                  ? ` Loyer de référence majoré : ${formatEuros(bien.loyerReferenceMajore)}.`
                  : ''}
              </Text>
            ) : null}
            <Text style={s.petit}>
              Le dépôt de garantie est restitué dans le mois qui suit la remise des clés si l'état
              des lieux de sortie est conforme à celui d'entrée, dans les deux mois sinon.
              Une assurance habitation (risques locatifs) est obligatoire : l'attestation est à
              remettre au plus tard le jour de la remise des clés, puis chaque année.
              Aucun frais d'agence ni honoraire n'est facturé.
            </Text>
          </>
        )}

        {modele.blocs.infosPratiques && (
          <>
            <Text style={s.h2}>Votre visite</Text>
            <View style={s.tiers}>
              <LigneAComplecter
                label="Date"
                valeur={visite.date ? formatDateFr(visite.date) : undefined}
                taille={18}
              />
              <LigneAComplecter label="Heure" valeur={visite.heure} taille={10} />
              {c.acces ? <Ligne label="Accès">{c.acces}</Ligne> : null}
              {modele.aApporter.trim() ? <Ligne label="À apporter">{modele.aApporter.trim()}</Ligne> : null}
              {modele.blocs.coordonneesBailleur && (
                <Ligne label="Votre interlocuteur">
                  {designation || 'le propriétaire'}
                  {bailleur.telephone ? ` - ${bailleur.telephone}` : ''}
                  {bailleur.email ? ` - ${bailleur.email}` : ''}
                </Ligne>
              )}
            </View>
          </>
        )}

        <PiedDePagePdf />
      </Page>

      {/* ------------------ Page 2 : le dossier à préparer ----------------- */}
      <Page size="A4" style={s.page}>
        <EntetePdf reference={reference} docTitre="Fiche de visite - dossier de candidature" />
        <View style={s.titreBloc}>
          <Text style={s.titre}>Votre dossier de candidature</Text>
          <Text style={s.sousTitre}>
            Pièces à préparer - {formatAdresse(bien.adresse)}
          </Text>
        </View>

        {modele.introDossier.trim() ? <Paragraphes texte={modele.introDossier} /> : null}

        {sections.map((sec) => (
          // La section peut se couper d'une page à l'autre (sinon une longue
          // liste laisse une demi-page blanche), mais jamais juste après son
          // titre, ni au milieu d'une pièce.
          <View key={sec.id}>
            <View wrap={false} minPresenceAhead={48}>
              <Text style={s.h3}>{sec.titre}</Text>
              {sec.note ? <Text style={s.petit}>{sec.note}</Text> : null}
            </View>
            <View style={{ marginTop: 4 }}>
              {sec.pieces.map((p) => (
                <View key={p.id} wrap={false}>
                  <CaseACocher>{p.libelle}</CaseACocher>
                  {p.precision ? (
                    <Text style={[s.petit, { marginTop: -4, marginBottom: 2, paddingLeft: 16 }]}>
                      {p.precision}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          </View>
        ))}

        {modele.modalitesCandidature.trim() ? (
          <>
            <Text style={s.h2}>Comment candidater</Text>
            <Paragraphes texte={modele.modalitesCandidature} />
          </>
        ) : null}

        {modele.mentions.trim() ? <Paragraphes texte={modele.mentions} petit /> : null}

        <PiedDePagePdf />
      </Page>

      {/* --------- Page jointe : acte de cautionnement (garant physique) -------- */}
      {acteCautionnement && (
        <ActeCautionnementPage
          bailleur={bailleur}
          bienAdresse={formatAdresse(bien.adresse)}
          loyerHC={c.loyerHC}
          charges={charges}
        />
      )}
    </Document>
  );
}
