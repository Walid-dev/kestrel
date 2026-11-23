// The shared parts' logic that needs no browser, kept apart so node --test can check it: the confirm's one question
// at a time, and a pick among several pills.

// One question at a time: a second ask while one is open answers no at once (a double tap on ✕ must not stack two
// "Delete?" boxes, the second asking about something already gone). Each question is answered once: Esc after a tap
// on Delete changes nothing.
export function asker<Q>() {
  let open: { q: Q; resolve: (yes: boolean) => void } | null = null;
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const fn of listeners) fn();
  };
  return {
    ask(q: Q): Promise<boolean> {
      if (open) return Promise.resolve(false);
      return new Promise<boolean>((resolve) => {
        open = { q, resolve };
        emit();
      });
    },
    answer(yes: boolean) {
      if (!open) return;
      const { resolve } = open;
      open = null;
      resolve(yes);
      emit();
    },
    current: (): Q | null => open?.q ?? null,
    subscribe(fn: () => void): () => void {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

// A tap on a pill when several can be picked: in or out of the list, the list kept in the options' order so the
// value reads the same however it was tapped.
export function toggle<V>(order: readonly V[], picked: readonly V[], v: V): V[] {
  const next = picked.includes(v) ? picked.filter((x) => x !== v) : [...picked, v];
  return order.filter((x) => next.includes(x));
}
