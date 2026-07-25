import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import {
  getPasswordPromptState,
  resolvePasswordPrompt,
  subscribePasswordPrompt,
} from "@/lib/passwordPrompt";

export function PasswordDialog() {
  const options = useSyncExternalStore(subscribePasswordPrompt, getPasswordPromptState, () => null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const messageId = useId();

  useEffect(() => {
    if (!options) return;
    setPassword("");
    setConfirm("");
    setMismatch(false);
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [options]);

  if (!options) return null;

  const submit = () => {
    if (options.confirm) {
      if (!password) {
        resolvePasswordPrompt(null);
        return;
      }
      if (password !== confirm) {
        setMismatch(true);
        return;
      }
    }
    resolvePasswordPrompt(password || null);
  };

  const cancel = () => resolvePasswordPrompt(null);

  return (
    <div
      data-testid="password-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={cancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") cancel();
          if (e.key === "Enter") submit();
        }}
      >
        <h2 id={titleId} className="text-base font-semibold text-zinc-100">
          {options.title}
        </h2>
        <p id={messageId} className="mt-1 text-sm text-zinc-400">
          {options.message}
        </p>

        <label className="mt-4 block text-xs font-medium text-zinc-400">
          Password
          <input
            ref={inputRef}
            data-testid="password-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setMismatch(false);
            }}
            className="mt-1 w-full rounded-md border border-zinc-600 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500"
          />
        </label>

        {options.confirm && (
          <label className="mt-3 block text-xs font-medium text-zinc-400">
            Confirm password
            <input
              data-testid="password-confirm-input"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value);
                setMismatch(false);
              }}
              className="mt-1 w-full rounded-md border border-zinc-600 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500"
            />
          </label>
        )}

        {mismatch && (
          <p className="mt-2 text-xs text-red-400" data-testid="password-mismatch">
            Passwords do not match.
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            data-testid="password-cancel"
            onClick={cancel}
            className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="password-submit"
            onClick={submit}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
