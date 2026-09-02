export function purgeConfirmationPhrase(keyIdentity: string) {
  return `PURGE ${keyIdentity}`;
}

export function canConfirmPurge({
  confirmation,
  keyIdentity,
  batchId,
  backupPath,
}: {
  confirmation: string;
  keyIdentity: string;
  batchId: string;
  backupPath: string;
}) {
  return (
    confirmation.trim() === purgeConfirmationPhrase(keyIdentity) &&
    batchId.trim().length > 0 &&
    backupPath.trim().length > 0
  );
}

export function isTerminalAnalyticsJob(state: string) {
  return ['succeeded', 'failed', 'canceled'].includes(state);
}

export async function cancelAndRefreshJob<T>(
  cancel: () => Promise<unknown>,
  refresh: () => Promise<T>
) {
  await cancel();
  return refresh();
}
