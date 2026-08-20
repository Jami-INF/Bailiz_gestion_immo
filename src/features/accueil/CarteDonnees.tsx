import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';
import { Cloud, FolderSync, ShieldAlert } from 'lucide-react';
import { getConfigAutosave } from '@/lib/autosave';
import { getConfigGDrive } from '@/lib/gdrive';
import { Button, Card, Modal } from '@/components/ui';
import { ChoixDestination } from './ChoixDestination';

/**
 * Où vont les données, dit en permanence et non sous forme de reproche.
 *
 * Le tableau de bord ne parlait du sujet que par une alerte orange - « Aucune
 * sauvegarde effectuée » - déclenchée après coup, quand il y avait déjà quelque
 * chose à perdre. Un état affiché en continu vaut mieux : il informe avant
 * l'incident, et il se lit aussi comme une confirmation quand tout va bien.
 *
 * Sa place sur l'écran suit ce qu'il y a en jeu : sous l'appel à l'action tant
 * que la base est vide - il n'y a rien à perdre, et rien ne doit passer devant
 * « rédiger un bail » -, en tête dès qu'il existe des fiches.
 *
 * La même carte ouvre les Paramètres (`avecLien` en moins) : la page commence
 * ainsi par la réponse - où sont mes données - au lieu du catalogue des
 * mécanismes qui les mettent à l'abri.
 */
export function CarteDonnees({ avecLien = true }: { avecLien?: boolean } = {}) {
  const [ouvert, setOuvert] = useState(false);
  // `null` = pas de destination ; `undefined` = requête en cours. Sans cette
  // distinction, la carte d'alerte clignoterait à chaque rendu du tableau de bord.
  const dossier = useLiveQuery(() => getConfigAutosave().then((c) => c ?? null));
  const drive = useLiveQuery(() => getConfigGDrive().then((c) => c ?? null));
  if (dossier === undefined || drive === undefined) return null;

  const driveActif = Boolean(drive?.actif);
  const configure = driveActif || Boolean(dossier);

  return (
    <>
      <Card className={configure ? '' : 'border-amber-300 bg-amber-50'}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 font-semibold text-accent-900">
              {configure ? (
                <Cloud size={18} className="text-green-600" />
              ) : (
                <ShieldAlert size={18} className="text-amber-600" />
              )}
              Vos données
            </h2>
            {configure ? (
              <ul className="mt-2 space-y-1 text-sm text-accent-700">
                {driveActif && (
                  <li className="flex items-center gap-2">
                    <Cloud size={14} className="shrink-0 text-accent-500" />
                    Synchronisées avec Google Drive
                    {drive?.derniereSync
                      ? ` - dernier échange le ${format(new Date(drive.derniereSync), "dd/MM 'à' HH'h'mm")}`
                      : ' - premier échange en attente'}
                  </li>
                )}
                {dossier && (
                  <li className="flex items-center gap-2">
                    <FolderSync size={14} className="shrink-0 text-accent-500" />
                    Archivées dans le dossier «&nbsp;{dossier.nomDossier}&nbsp;»
                    {dossier.dernierPush
                      ? ` - dernière archive le ${format(new Date(dossier.dernierPush), "dd/MM 'à' HH'h'mm")}`
                      : ' - aucune archive pour l’instant'}
                  </li>
                )}
              </ul>
            ) : (
              <p className="mt-1 max-w-prose text-sm text-amber-900">
                Elles n’existent que sur cet appareil, dans ce navigateur. Vider les données du
                navigateur ou changer d’appareil les effacerait définitivement.
              </p>
            )}
          </div>
          {configure ? (
            /*
             * Pas de renvoi vers les Paramètres quand on y est déjà : le détail
             * de chaque destination est dans les cartes juste en dessous.
             */
            avecLien && (
              <Link to="/parametres" className="text-sm font-medium text-brand-700 hover:underline">
                Gérer
              </Link>
            )
          ) : (
            <Button size="sm" onClick={() => setOuvert(true)}>
              Choisir une destination
            </Button>
          )}
        </div>
      </Card>

      <Modal
        open={ouvert}
        onClose={() => setOuvert(false)}
        title="Où sont enregistrées vos données ?"
        wide
      >
        <ChoixDestination onChoisi={() => setOuvert(false)} />
      </Modal>
    </>
  );
}
