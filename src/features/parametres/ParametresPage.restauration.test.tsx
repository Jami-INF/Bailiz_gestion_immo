import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { db } from '@/lib/db';
import { exporterSauvegarde } from '@/lib/backup';
import { rendre, semer, unBien, utilisateur, viderBase } from '@/test/utils';
import { ParametresPage } from './ParametresPage';

/*
 * La restauration d'une sauvegarde est le seul geste du produit qui peut
 * **effacer** des données : en mode « remplacer », les tables sont vidées avant
 * d'être réécrites. Il n'était couvert par aucun test d'écran.
 *
 * Les archives ne sont pas fabriquées à la main : chaque cas exporte pour de
 * bon avec `exporterSauvegarde`, puis réimporte. Un test qui écrirait lui-même
 * le `data.json` attendu ne vérifierait que sa propre idée du format, et
 * passerait encore le jour où l'export changerait de forme.
 */
vi.mock('@/lib/pdf/generer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/pdf/generer')>()),
  genererEtArchiver: vi.fn(async () => undefined),
}));

beforeEach(async () => {
  await viderBase();
  // `CarteRepliable` retient son pli dans `localStorage` : sans ce nettoyage, un
  // test ouvrirait la carte que le précédent a laissée ouverte, donc la
  // refermerait - et le champ de fichier, démonté, resterait introuvable.
  localStorage.clear();
});

/** Exporte l'état courant de la base sous forme de fichier téléversable. */
async function archiveDeLaBase(nom = 'bailiz-sauvegarde.zip'): Promise<File> {
  const blob = await exporterSauvegarde();
  return new File([await blob.arrayBuffer()], nom, { type: 'application/zip' });
}

/**
 * Téléverse `fichier` dans le champ caché du panneau de sauvegarde.
 *
 * La carte doit être dépliée d'abord : `CarteRepliable` **démonte** son contenu
 * quand elle est fermée, le champ n'existe donc pas dans le DOM avant.
 */
async function televerser(fichier: File) {
  const u = utilisateur();
  const { container } = rendre(<ParametresPage />);
  const carte = await screen.findByRole('button', { name: /Sauvegarde et restauration/ });
  if (carte.getAttribute('aria-expanded') !== 'true') await u.click(carte);
  const champ = await waitFor(() => {
    const el = container.querySelector<HTMLInputElement>('input[type="file"][accept=".zip"]');
    expect(el).not.toBeNull();
    return el!;
  });
  await u.upload(champ, fichier);
  return u;
}

describe('restauration d’une sauvegarde', () => {
  it('restitue les données exportées à l’identique après un effacement', async () => {
    await semer({ edl: {} });
    const archive = await archiveDeLaBase();
    // Sinistre : la base est perdue, l'utilisateur repart de son archive.
    await viderBase();

    const u = await televerser(archive);
    const modale = await screen.findByRole('dialog', { name: /Restaurer la sauvegarde/ });
    expect(within(modale).getByText(/Aucun conflit détecté/)).toBeInTheDocument();
    await u.click(within(modale).getByRole('button', { name: /Tout remplacer/ }));

    await waitFor(async () => expect(await db.biens.count()).toBe(1));
    expect(await db.baux.count()).toBe(1);
    expect(await db.locataires.count()).toBe(1);
    const edl = await db.edls.get('edl-1');
    // Le contenu, pas seulement le compte : les pièces sont ce qui fait l'EDL.
    expect(edl?.pieces.map((p) => p.nom)).toEqual(['Séjour', 'Cuisine']);
    expect((await db.parametres.get('singleton'))?.bailleur.nom).toBe('Infante');
  });

  it('signale les conflits et, en fusion, conserve ce qui n’est pas dans l’archive', async () => {
    await semer({ edl: {} });
    const archive = await archiveDeLaBase();
    // Un second logement, créé après l'export : la fusion ne doit pas l'effacer.
    await db.biens.add(unBien({ id: 'bien-2', nom: 'Studio Jaude' }));

    const u = await televerser(archive);
    const modale = await screen.findByRole('dialog', { name: /Restaurer la sauvegarde/ });
    expect(within(modale).getByText(/existent déjà sur/)).toBeInTheDocument();
    await u.click(within(modale).getByRole('button', { name: /Fusionner par identifiant/ }));

    await waitFor(async () => expect(await db.biens.count()).toBe(2));
    expect((await db.biens.get('bien-2'))?.nom).toBe('Studio Jaude');
  });

  it('efface ce qui ne figure pas dans l’archive quand on remplace tout', async () => {
    /*
     * C'est la différence entre les deux modes, et elle est irréversible : si
     * « remplacer » se mettait à fusionner, personne ne s'en apercevrait avant
     * d'en avoir besoin.
     */
    await semer({ edl: {} });
    const archive = await archiveDeLaBase();
    await db.biens.add(unBien({ id: 'bien-2', nom: 'Studio Jaude' }));

    const u = await televerser(archive);
    const modale = await screen.findByRole('dialog', { name: /Restaurer la sauvegarde/ });
    await u.click(within(modale).getByRole('button', { name: /Tout remplacer/ }));

    await waitFor(async () => expect(await db.biens.count()).toBe(1));
    expect(await db.biens.get('bien-2')).toBeUndefined();
  });
});

describe('refus d’une archive inexploitable', () => {
  it('affiche tel quel le motif du refus, sans rien toucher en base', async () => {
    /*
     * Les messages de `validerSauvegarde` sont rédigés pour être lus (« Mettez
     * l'application à jour… ») : les faire passer par `decrireErreur` les
     * préfixerait d'un `Error :` sans rien traduire. C'est le sens de la
     * distinction `ErreurSauvegarde` / panne technique.
     */
    await semer();
    const archive = await archiveDeLaBase();
    // Une archive produite par une version future de l'application.
    const zip = await (await import('jszip')).default.loadAsync(await archive.arrayBuffer());
    const data = JSON.parse(await zip.file('data.json')!.async('string'));
    zip.file('data.json', JSON.stringify({ ...data, version: 99 }));
    const futur = new File([await zip.generateAsync({ type: 'arraybuffer' })], 'futur.zip');

    await televerser(futur);

    expect(await screen.findByText(/version plus récente de Bailiz/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /Restaurer la sauvegarde/ })).not.toBeInTheDocument();
    // Rien n'a été touché : le refus intervient avant toute écriture.
    expect(await db.biens.count()).toBe(1);
  });

  it('refuse une archive sans data.json', async () => {
    await semer();
    const JSZip = (await import('jszip')).default;
    const vide = new JSZip();
    vide.file('autre.txt', 'rien');
    const fichier = new File([await vide.generateAsync({ type: 'arraybuffer' })], 'vide.zip');

    await televerser(fichier);

    expect(await screen.findByText(/data\.json introuvable/)).toBeInTheDocument();
  });

  it('présente autrement une panne technique qu’un refus de validation', async () => {
    /*
     * Archive corrompue (transfert interrompu, support défaillant) : l'échec
     * vient de la bibliothèque ZIP et non de nos règles, son message n'est pas
     * rédigé pour l'utilisateur. Il passe donc par `decrireErreur`, sous un
     * préfixe qui dit de quoi il s'agit - c'est l'autre branche du correctif.
     */
    await semer();
    const fichier = new File(['ceci n’est pas une archive'], 'corrompue.zip', {
      type: 'application/zip',
    });

    await televerser(fichier);

    expect(await screen.findByText(/Import impossible - /)).toBeInTheDocument();
    expect(await db.biens.count()).toBe(1);
  });
});
