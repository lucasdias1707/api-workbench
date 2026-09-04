import { useCallback } from 'react';
import { useToast } from '@/components/common/Toaster';
import { useWorkspace } from '@/state/workspace-store';
import type { Action } from '@/state/actions';

/**
 * Delete something, and offer to put it back.
 *
 * The snapshot is the whole workspace as it stood before the delete, and
 * `restore` re-adds only what went missing — so undoing does not roll back a
 * value someone typed while the toast was still up.
 */
export function useDeleteWithUndo() {
  const { state, dispatch } = useWorkspace();
  const { toast } = useToast();

  return useCallback(
    (action: Action, description: { title: string; detail?: string }) => {
      const previous = state;
      dispatch(action);
      toast({
        title: description.title,
        description: description.detail,
        kind: 'info',
        action: { label: 'Undo', run: () => dispatch({ type: 'restore', previous }) },
      });
    },
    [state, dispatch, toast],
  );
}
