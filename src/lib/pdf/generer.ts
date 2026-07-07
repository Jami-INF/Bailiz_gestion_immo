import { pdf } from '@react-pdf/renderer';
import type { ReactElement } from 'react';
import type { DocumentProps } from '@react-pdf/renderer';
import { format } from 'date-fns';
import { sha256Hex } from '@/lib/crypto';
import { db } from '@/lib/db';
import { uid, nowISO } from '@/lib/ids';
import type { DocumentGenere, TypeDocument } from '@/types';
import { telechargerBlob } from '@/lib/backup';

type DocElement = ReactElement<DocumentProps>;

/** Rend un document React-PDF en Blob. */
export async function rendrePdf(document: DocElement): Promise<Blob> {
  return pdf(document).toBlob();
}

/**
 * Rend un PDF signé en deux passes : première passe pour calculer l'empreinte
 * SHA-256 du contenu, seconde passe pour l'inscrire en pied de page.
 * L'empreinte affichée est celle du PDF de première passe (contenu signé) ;
 * elle est aussi conservée en base pour vérification.
 */
export async function rendrePdfAvecHash(
  fabrique: (hash?: string) => DocElement,
): Promise<{ blob: Blob; hash: string }> {
  const premierePasse = await rendrePdf(fabrique(undefined));
  const hash = await sha256Hex(premierePasse);
  const blob = await rendrePdf(fabrique(hash));
  return { blob, hash };
}

export async function enregistrerDocument(params: {
  reference: string;
  type: TypeDocument;
  titre: string;
  blob: Blob;
  hash?: string;
  signe?: boolean;
  bienId?: string;
  bailId?: string;
  edlId?: string;
}): Promise<DocumentGenere> {
  const doc: DocumentGenere = {
    id: uid(),
    reference: params.reference,
    type: params.type,
    titre: params.titre,
    bienId: params.bienId,
    bailId: params.bailId,
    edlId: params.edlId,
    blob: params.blob,
    hash: params.hash,
    signe: params.signe ?? false,
    createdAt: nowISO(),
  };
  // Un document non signé regénéré remplace l'ancienne version de même référence.
  const existants = await db.documents.where('reference').equals(params.reference).toArray();
  for (const e of existants) {
    if (!e.signe) await db.documents.delete(e.id);
  }
  await db.documents.add(doc);
  return doc;
}

/** « Marie Dupont » / « Marie Dupont et Jean Martin » / « Marie Dupont et 2 autres ». */
export function nomsPersonnes(personnes: { prenom: string; nom: string }[]): string {
  const noms = personnes.map((p) => `${p.prenom} ${p.nom}`.trim()).filter(Boolean);
  if (noms.length === 0) return '';
  if (noms.length === 1) return noms[0];
  if (noms.length === 2) return `${noms[0]} et ${noms[1]}`;
  return `${noms[0]} et ${noms.length - 1} autres`;
}

/**
 * Nom de fichier explicite : « BAIL-2026-0001 - Bail meublé — T2 Chamalières —
 * Marie Dupont - 2026-07-07.pdf ». Caractères interdits remplacés.
 */
export function nomFichierDocument(doc: {
  reference: string;
  titre?: string;
  createdAt?: string;
}): string {
  const date = format(doc.createdAt ? new Date(doc.createdAt) : new Date(), 'yyyy-MM-dd');
  const titre = doc.titre
    ?.replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return titre ? `${doc.reference} - ${titre} - ${date}.pdf` : `${doc.reference} - ${date}.pdf`;
}

export function telechargerDocument(doc: {
  blob: Blob;
  reference: string;
  titre?: string;
  createdAt?: string;
}): void {
  telechargerBlob(doc.blob, nomFichierDocument(doc));
}
