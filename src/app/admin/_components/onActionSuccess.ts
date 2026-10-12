/**
 * Wraps a useActionState action so `onSuccess` runs right after a successful
 * result (e.g. close the popup + router.refresh()). Doing this inside the action
 * instead of a `useEffect` on `state.success` avoids a cascading setState-in-effect
 * render, and also fires on every success (an effect keyed on `success` misses a
 * second consecutive successful save, since the value stays `true`).
 */
export function onActionSuccess<S extends { success?: boolean }>(
  action: (prev: S, formData: FormData) => Promise<S>,
  onSuccess: () => void,
): (prev: S, formData: FormData) => Promise<S> {
  return async (prev, formData) => {
    const next = await action(prev, formData);
    if (next.success) onSuccess();
    return next;
  };
}
