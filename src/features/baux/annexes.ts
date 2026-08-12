import type { AnnexeChecklistItem, Bien } from '@/types';
import { LIEN_NOTICE_INFORMATION, LIEN_GEORISQUES } from '@/lib/defauts';
import { uid } from '@/lib/ids';

/**
 * Le dossier de diagnostic technique n'est pas le même pour tous les logements :
 * le constat plomb ne concerne que les permis antérieurs au 1er janvier 1949,
 * les états gaz et électricité que les installations de plus de quinze ans, et
 * l'état des risques que les communes concernées par un plan de prévention, un
 * zonage sismique ou radon.
 *
 * Règle appliquée : une pièce n'est **retirée que lorsqu'on sait qu'elle n'est
 * pas due**. Tant que l'information manque sur la fiche du bien, la pièce reste
 * listée avec sa condition en toutes lettres - mieux vaut une ligne à vérifier
 * qu'un diagnostic oublié, dont l'absence est opposable au bailleur.
 */
function diagnostics(bien: Bien): AnnexeChecklistItem[] {
  const items: { libelle: string; lien?: string }[] = [];

  items.push({ libelle: 'Diagnostic de performance énergétique (DPE) - valable 10 ans' });

  // Avant 1949 : constat de risque d'exposition au plomb (art. L.1334-5 et
  // L.1334-7 du code de la santé publique).
  if (bien.periodeConstruction === 'avant_1949') {
    items.push({
      libelle:
        "Constat de risque d'exposition au plomb (CREP) - immeuble construit avant le 1er janvier 1949",
    });
  } else if (!bien.periodeConstruction) {
    items.push({
      libelle:
        "Constat de risque d'exposition au plomb (CREP) - uniquement si le permis de construire est antérieur au 1er janvier 1949",
    });
  }

  // Installations intérieures de plus de quinze ans (art. 3-3, 6° et 7°).
  if (bien.installationGazPlusDe15Ans !== false) {
    items.push({
      libelle:
        "État de l'installation intérieure de gaz" +
        (bien.installationGazPlusDe15Ans
          ? ' - installation de plus de 15 ans'
          : " - uniquement si le logement est alimenté en gaz et que l'installation a plus de 15 ans"),
    });
  }
  if (bien.installationElectriquePlusDe15Ans !== false) {
    items.push({
      libelle:
        "État de l'installation intérieure d'électricité" +
        (bien.installationElectriquePlusDe15Ans
          ? ' - installation de plus de 15 ans'
          : " - uniquement si l'installation a plus de 15 ans"),
    });
  }

  // État des risques et pollutions : dû dès que la commune est concernée par un
  // PPR, un zonage sismique 2 à 5, un potentiel radon 3, un SIS ou le recul du
  // trait de côte. Valable 6 mois : à refaire à chaque relocation.
  if (bien.zoneRisquesERP !== false) {
    items.push({
      libelle:
        'État des risques et pollutions (ERP) - daté de moins de 6 mois à la signature',
      lien: LIEN_GEORISQUES,
    });
  }

  // Zone d'exposition au bruit d'un aérodrome (art. L.112-11 du code de l'urbanisme).
  if (bien.zoneBruitAerodrome) {
    items.push({
      libelle: "État des nuisances sonores aériennes - logement en zone d'exposition au bruit",
    });
  }

  items.push({ libelle: 'Attestation de surface habitable (loi Boutin)' });

  return items.map((i) => ({
    id: uid(),
    libelle: i.libelle,
    jointe: false,
    genereeParApp: false,
    lien: i.lien,
  }));
}

/** Checklist des annexes obligatoires du bail (§2.1 du cahier des charges). */
export function annexesParDefaut(bien: Bien): AnnexeChecklistItem[] {
  const items: AnnexeChecklistItem[] = [
    {
      id: uid(),
      libelle: "État des lieux d'entrée valant inventaire et état détaillé du mobilier",
      jointe: true,
      genereeParApp: true,
    },
    {
      id: uid(),
      libelle: "Notice d'information (arrêté du 29 mai 2015 modifié)",
      jointe: false,
      genereeParApp: false,
      lien: LIEN_NOTICE_INFORMATION,
    },
    ...diagnostics(bien),
    { id: uid(), libelle: 'Grille de vétusté avec mode d’emploi', jointe: true, genereeParApp: true },
    {
      id: uid(),
      libelle: "Attestation d'assurance habitation (risques locatifs) du locataire",
      jointe: false,
      genereeParApp: false,
    },
  ];
  if (bien.regimeJuridique === 'copropriete') {
    items.push({
      id: uid(),
      libelle:
        'Extraits du règlement de copropriété (parties communes, destination de l’immeuble, quote-parts)',
      jointe: false,
      genereeParApp: false,
    });
  }
  return items;
}
