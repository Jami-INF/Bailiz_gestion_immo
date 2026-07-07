import type { AnnexeChecklistItem, Bien } from '@/types';
import { LIEN_NOTICE_INFORMATION } from '@/lib/defauts';
import { uid } from '@/lib/ids';

/** Checklist des annexes obligatoires du bail (§2.1 du cahier des charges). */
export function annexesParDefaut(bien: Bien): AnnexeChecklistItem[] {
  const items: AnnexeChecklistItem[] = [
    {
      id: uid(),
      libelle: 'Inventaire et état détaillé du mobilier',
      jointe: true,
      genereeParApp: true,
    },
    { id: uid(), libelle: "État des lieux d'entrée", jointe: true, genereeParApp: true },
    {
      id: uid(),
      libelle: "Notice d'information (arrêté du 29 mai 2015 modifié)",
      jointe: false,
      genereeParApp: false,
      lien: LIEN_NOTICE_INFORMATION,
    },
    {
      id: uid(),
      libelle: 'Dossier de diagnostic technique (DPE, ERP, CREP, électricité/gaz, surface loi Boutin)',
      jointe: false,
      genereeParApp: false,
    },
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
