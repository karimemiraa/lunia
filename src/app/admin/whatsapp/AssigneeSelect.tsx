"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignConversationAction } from "./actions";

interface AssigneeSelectProps {
  conversationId: string;
  ownerId: string | null;
  staff: { id: string; name: string }[];
}

// Assigns the active WhatsApp conversation to a staff member. Saves on change
// (no separate button) and refreshes so the list reflects the new owner.
export function AssigneeSelect({ conversationId, ownerId, staff }: AssigneeSelectProps) {
  const router = useRouter();
  const [value, setValue] = useState(ownerId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onChange(next: string) {
    setValue(next);
    setError(null);
    startTransition(async () => {
      const result = await assignConversationAction(conversationId, next);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  return (
    <label className="flex items-center gap-2 text-xs text-[var(--color-ink)]/60">
      <span className="whitespace-nowrap">Assigned to</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={isPending}
        aria-label="Assign conversation to staff"
        className="lunia-input !w-auto py-1.5 text-sm"
        data-testid="whatsapp-assignee"
      >
        <option value="">Unassigned</option>
        {staff.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      {error && <span className="text-red-600">{error}</span>}
    </label>
  );
}
