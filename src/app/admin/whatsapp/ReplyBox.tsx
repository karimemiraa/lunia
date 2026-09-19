"use client";

import { useActionState, useRef } from "react";
import { sendReplyAction, type WhatsappActionState } from "./actions";

const initial: WhatsappActionState = {};

export function ReplyBox({ conversationId }: { conversationId: string }) {
  const [state, action, pending] = useActionState(sendReplyAction, initial);
  const ref = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={ref}
      action={async (fd) => {
        await action(fd);
        ref.current?.reset();
      }}
      className="flex items-end gap-2 border-t border-[var(--line)] p-3"
    >
      <input type="hidden" name="conversationId" value={conversationId} />
      <textarea
        name="body"
        rows={1}
        required
        placeholder="Type a reply…"
        className="lunia-input min-h-[2.5rem] flex-1 resize-none"
      />
      <button type="submit" disabled={pending} className="lunia-btn lunia-btn-forest lunia-btn-sm disabled:opacity-60">
        {pending ? "Sending…" : "Send"}
      </button>
      {state.error && <span role="alert" className="text-xs text-red-700">{state.error}</span>}
    </form>
  );
}
