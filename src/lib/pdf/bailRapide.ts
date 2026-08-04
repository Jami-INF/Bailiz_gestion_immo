import { format } from 'date-fns';
import type { Bail, Bien, Locataire, Parametres, SaisieBail } from '@/types';
import { uid, nowISO } from '@/lib/ids';
import { annexesParDefaut } from '@/features/baux/annexes';

/** Durée par défaut cohérente avec le type de bail. */
export function dureeParDefaut(type: SaisieBail['typeBail']): number {
  return type === 'meuble_1an' ? 12 : type === 'meuble_etudiant_9mois' ? 9 : 1;
}

/** Saisie vierge, bailleur pré-rempli depuis les Paramètres si disponible. */
export function saisieVide(bailleur: Parametres['bailleur'], bienId?: string): SaisieBail {
  return {
    bailleur,
    bienId,
    bien: { adresse: { ligne1: '', codePostal: '', ville: '' } },
    locataires: [{}],
    typeBail: 'meuble_1an',
    dateEffet: format(new Date(), 'yyyy-MM-dd'),
    dureeMois: 12,
    charges: { mode: 'forfait' },
    jourPaiement: 5,
    modePaiement: 'Virement bancaire',
    revisionIRL: { revisable: false },
    clauseSolidarite: true,
    clauseResolutoire: true,
  };
}

/**
 * Pré-remplit la saisie avec les conditions de location portées par le bien
 * (loyer, charges, dépôt). Une valeur **déjà saisie n'est jamais écrasée** :
 * le bien propose, l'utilisateur dispose.
 */
export function appliquerConditionsBien(saisie: SaisieBail, bien?: Bien): SaisieBail {
  const c = bien?.conditionsLocation;
  if (!c) return saisie;
  const montant = saisie.charges.montant ?? c.charges?.montant;
  return {
    ...saisie,
    loyerHC: saisie.loyerHC ?? c.loyerHC,
    charges: {
      // Le mode ne suit le bien que si aucun montant n'a encore été saisi.
      mode: saisie.charges.montant === undefined ? c.charges?.mode ?? saisie.charges.mode : saisie.charges.mode,
      montant,
    },
    depotGarantie: saisie.depotGarantie ?? c.depotGarantie,
  };
}

/**
 * Conditions à réécrire sur le bien après l'enregistrement d'un bail : le loyer
 * évoluant peu, la fiche du bien reste à jour sans saisie supplémentaire. Une
 * valeur nulle du bail (dépôt d'un bail mobilité, loyer non renseigné) ne
 * remplace pas celle déjà connue du bien.
 */
export function conditionsDepuisBail(bien: Bien, bail: Bail): Bien['conditionsLocation'] {
  const c = bien.conditionsLocation;
  return {
    ...c,
    loyerHC: bail.loyerHC || c?.loyerHC,
    charges: { mode: bail.charges.mode, montant: bail.charges.montant || c?.charges?.montant },
    depotGarantie: bail.depotGarantie || c?.depotGarantie,
  };
}

/**
 * Reverse-adapter : repeuple la saisie du formulaire depuis un bail existant
 * (mode « Modifier »). Le bien et les locataires sont référencés par id.
 */
export function bailVersSaisie(bail: Bail, bailleur: Parametres['bailleur']): SaisieBail {
  return {
    bailleur,
    bienId: bail.bienId,
    bien: { adresse: { ligne1: '', codePostal: '', ville: '' } },
    locataires: bail.locataireIds.map((id) => ({ id })),
    typeBail: bail.typeBail,
    dateEffet: bail.dateEffet || undefined,
    dureeMois: bail.dureeMois,
    loyerHC: bail.loyerHC,
    charges: { mode: bail.charges.mode, montant: bail.charges.montant },
    depotGarantie: bail.depotGarantie,
    jourPaiement: bail.jourPaiement,
    modePaiement: bail.modePaiement || undefined,
    revisionIRL: {
      revisable: bail.revisionIRL.revisable,
      trimestreReference: bail.revisionIRL.trimestreReference || undefined,
      valeurIndice: bail.revisionIRL.valeurIndice || undefined,
    },
    clausesParticulieres: bail.clausesParticulieres.join('\n') || undefined,
    clauseSolidarite: bail.clauseSolidarite,
    clauseResolutoire: bail.clauseResolutoire ?? true,
    assuranceMontantAnnuel: bail.assuranceColocataires?.montantAnnuel,
    complementMontant: bail.complementLoyer?.montant,
    complementJustification: bail.complementLoyer?.justification,
    dernierLoyerAncienLocataire: bail.dernierLoyerAncienLocataire,
    travauxDepuis: bail.travaux?.depuisDernierBail,
    travauxMajoration: bail.travaux?.majorationBailleur,
    travauxDiminution: bail.travaux?.diminutionLocataire,
  };
}

/** Construit un `Bien` complet à partir de la saisie inline (manques = valeurs vides). */
export function construireBienInline(b: SaisieBail['bien']): Bien {
  return {
    id: uid(),
    nom: b.nom?.trim() || 'Logement',
    adresse: b.adresse,
    type: b.type ?? 'autre',
    surfaceBoutin: b.surfaceBoutin ?? 0,
    nbPieces: b.nbPieces ?? 0,
    etage: b.etage,
    batiment: b.batiment,
    identifiantFiscal: b.identifiantFiscal,
    classeDPE: b.classeDPE,
    regimeJuridique: 'copropriete',
    equipementsPrivatifs: [],
    partiesCommunes: [],
    annexes: [],
    chauffage: { type: 'individuel', energie: b.chauffage?.trim() || '—' },
    eauChaude: { type: 'individuel', energie: b.eauChaude?.trim() || '—' },
    zoneEncadrementLoyers: false,
    piecesModele: [],
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
}

/** Emplacement de locataire non renseigné : le PDF affichera des pointillés. */
function locataireVide(): Locataire {
  return {
    id: uid(),
    civilite: 'M',
    nom: '',
    prenom: '',
    email: '',
    telephone: '',
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
}

/** Construit le `Bail` à partir de la saisie et des entités bien/locataires résolues. */
function construireBail(
  saisie: SaisieBail,
  bien: Bien,
  locataires: Locataire[],
  reference: string,
): Bail {
  const mobilite = saisie.typeBail === 'mobilite';
  const coloc = locataires.length > 1;
  return {
    id: uid(),
    reference,
    bienId: bien.id,
    locataireIds: locataires.map((l) => l.id),
    clauseSolidarite: coloc ? saisie.clauseSolidarite : false,
    typeBail: saisie.typeBail,
    dateEffet: saisie.dateEffet ?? '',
    dureeMois: saisie.dureeMois ?? dureeParDefaut(saisie.typeBail),
    loyerHC: saisie.loyerHC ?? 0,
    charges: { mode: saisie.charges.mode, montant: saisie.charges.montant ?? 0 },
    depotGarantie: mobilite ? 0 : saisie.depotGarantie ?? 0,
    jourPaiement: saisie.jourPaiement ?? 1,
    modePaiement: saisie.modePaiement?.trim() ?? '',
    revisionIRL: {
      trimestreReference: saisie.revisionIRL?.trimestreReference?.trim() ?? '',
      valeurIndice: saisie.revisionIRL?.valeurIndice ?? 0,
      revisable: !mobilite && (saisie.revisionIRL?.revisable ?? false),
    },
    complementLoyer:
      saisie.complementMontant && saisie.complementMontant > 0
        ? { montant: saisie.complementMontant, justification: saisie.complementJustification?.trim() ?? '' }
        : undefined,
    dernierLoyerAncienLocataire: saisie.dernierLoyerAncienLocataire,
    clauseResolutoire: saisie.clauseResolutoire,
    assuranceColocataires:
      coloc && saisie.assuranceMontantAnnuel && saisie.assuranceMontantAnnuel > 0
        ? { montantAnnuel: saisie.assuranceMontantAnnuel }
        : undefined,
    travaux:
      saisie.travauxDepuis?.trim() || saisie.travauxMajoration?.trim() || saisie.travauxDiminution?.trim()
        ? {
            depuisDernierBail: saisie.travauxDepuis?.trim() || undefined,
            majorationBailleur: saisie.travauxMajoration?.trim() || undefined,
            diminutionLocataire: saisie.travauxDiminution?.trim() || undefined,
          }
        : undefined,
    clausesParticulieres: (saisie.clausesParticulieres ?? '')
      .split('\n')
      .map((c) => c.trim())
      .filter(Boolean),
    annexesChecklist: annexesParDefaut(bien),
    statut: 'brouillon',
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
}

/**
 * Résout les entités effectives (enregistrées ou inline) puis construit le
 * trio `{ bail, bien, locataires }` prêt pour le PDF ou la persistance.
 */
export function construireDocs(
  saisie: SaisieBail,
  reference: string,
  resolveBien: (id: string) => Bien | undefined,
  resolveLocataire: (id: string) => Locataire | undefined,
): { bail: Bail; bien: Bien; locataires: Locataire[] } {
  const bien = (saisie.bienId ? resolveBien(saisie.bienId) : undefined) ?? construireBienInline(saisie.bien);
  const locataires = (saisie.locataires.length ? saisie.locataires : [{}]).map(
    (l) => (l.id ? resolveLocataire(l.id) : undefined) ?? locataireVide(),
  );
  const bail = construireBail(saisie, bien, locataires, reference);
  return { bail, bien, locataires };
}
