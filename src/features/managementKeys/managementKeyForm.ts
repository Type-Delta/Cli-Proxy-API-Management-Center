import type {
  ManagementKeyCreateInput,
  ManagementKeyUpdateInput,
} from '@/services/api/managementKeys';
import type { ManagementKeyMetadata, ManagementScope } from '@/types';

export type ManagementKeyEditorMode = 'create' | 'edit' | 'rotate';

export interface ManagementKeyDraft {
  name: string;
  key: string;
  scope: ManagementScope;
}

export type ManagementKeyFormResult =
  | { ok: true; mode: 'create'; payload: ManagementKeyCreateInput }
  | { ok: true; mode: 'edit' | 'rotate'; payload: ManagementKeyUpdateInput }
  | { ok: false; error: 'name_required' | 'key_required' | 'no_changes' };

export const emptyManagementKeyDraft = (
  original?: ManagementKeyMetadata | null
): ManagementKeyDraft => ({
  name: original?.name ?? '',
  key: '',
  scope: original?.scope ?? 'read-only',
});

/**
 * Builds the request body for the editor mode. Edits send only changed metadata; rotation sends
 * only the new key. A key is never sent blank, and the draft is the only place it lives.
 */
export function buildManagementKeyRequest(
  mode: ManagementKeyEditorMode,
  draft: ManagementKeyDraft,
  original?: ManagementKeyMetadata | null
): ManagementKeyFormResult {
  const name = draft.name.trim();
  const key = draft.key.trim();
  if (mode !== 'rotate' && !name) return { ok: false, error: 'name_required' };
  if (mode !== 'edit' && !key) return { ok: false, error: 'key_required' };
  if (mode === 'create') return { ok: true, mode, payload: { name, key, scope: draft.scope } };
  if (mode === 'rotate') return { ok: true, mode, payload: { key } };

  const payload: ManagementKeyUpdateInput = {};
  if (name !== original?.name) payload.name = name;
  if (draft.scope !== original?.scope) payload.scope = draft.scope;
  return Object.keys(payload).length > 0
    ? { ok: true, mode, payload }
    : { ok: false, error: 'no_changes' };
}
