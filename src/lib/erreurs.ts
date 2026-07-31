/**
 * Description lisible d'une erreur, destinée à être affichée à l'utilisateur
 * (notamment sur tablette, où la console n'est pas accessible). Les causes
 * fréquentes côté navigateur — stockage saturé, mode privé, contrainte de clé —
 * sont traduites en clair ; sinon on expose le nom technique et le message,
 * seuls éléments réellement exploitables pour diagnostiquer.
 */
export function decrireErreur(e: unknown): string {
  if (typeof e === 'string') return e;
  if (!(e instanceof Error)) return String(e);

  const nom = e.name || 'Error';
  const message = e.message || '';

  if (nom === 'QuotaExceededError' || /quota/i.test(message)) {
    return "stockage saturé (QuotaExceededError) — libérez de l'espace sur l'appareil, exportez puis supprimez d'anciens documents, et vérifiez que vous n'êtes pas en navigation privée";
  }
  if (nom === 'ConstraintError') {
    return `conflit de clé en base (ConstraintError) — un enregistrement de même identifiant existe déjà. ${message}`;
  }
  if (nom === 'InvalidStateError' || /closed|closing/i.test(message)) {
    return `base de données indisponible (${nom}) — rechargez la page puis réessayez. ${message}`;
  }
  if (nom === 'DataCloneError') {
    return `donnée non enregistrable (DataCloneError) — ${message}`;
  }
  if (nom === 'AbortError' || nom === 'TransactionInactiveError') {
    return `transaction interrompue (${nom}) — réessayez. ${message}`;
  }
  return `${nom} : ${message}`;
}
