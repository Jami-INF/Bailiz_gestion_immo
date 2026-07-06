import { pdf } from '@react-pdf/renderer';
import type { ReactElement } from 'react';
import type { DocumentProps } from '@react-pdf/renderer';
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

export function telechargerDocument(doc: { blob: Blob; reference: string }): void {
  telechargerBlob(doc.blob, `${doc.reference}.pdf`);
}
