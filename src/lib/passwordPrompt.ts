export type PasswordPromptOptions = {
  title: string;
  message: string;
  /** When true, show a second confirm field (set-password flow). */
  confirm?: boolean;
};

type PendingPrompt = {
  options: PasswordPromptOptions;
  resolve: (value: string | null) => void;
};

let pending: PendingPrompt | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function getPasswordPromptState(): PasswordPromptOptions | null {
  return pending?.options ?? null;
}

export function subscribePasswordPrompt(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Show the in-app password dialog. Resolves to the password or null if cancelled. */
export function requestPassword(options: PasswordPromptOptions): Promise<string | null> {
  if (pending) {
    pending.resolve(null);
    pending = null;
  }
  return new Promise((resolve) => {
    pending = { options, resolve };
    notify();
  });
}

export function resolvePasswordPrompt(value: string | null): void {
  const current = pending;
  pending = null;
  notify();
  current?.resolve(value);
}
