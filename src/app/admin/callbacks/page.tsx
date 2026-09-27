import { requireAdmin } from "../_components/requireAdmin";
import { AdminShell } from "../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { listCallbacks, type CallbackFilter } from "@/modules/assistant/callbacks";
import { displayPhone } from "@/modules/assistant/phone";
import { FilterChips } from "../assistant/_ui";
import { CallbackQueue, type CallbackCardDTO } from "./CallbackQueue";
import { NewCallbackForm } from "./NewCallbackForm";

interface CallbacksPageProps {
  searchParams: Promise<{ view?: string }>;
}

const VIEWS = ["done", "all"] as const;

export default async function CallbacksPage({ searchParams }: CallbacksPageProps) {
  const user = await requireAdmin(PERMISSIONS.CLIENT_VIEW);
  const canManage = user.permissions.has(PERMISSIONS.CLIENT_MANAGE);
  const params = await searchParams;
  const view: CallbackFilter = params.view === "done" || params.view === "all" ? params.view : "open";
  const rows = await listCallbacks(view);

  const cards: CallbackCardDTO[] = rows.map((r) => ({
    id: r.id,
    name: r.clientName || r.name,
    phone: r.phone,
    phoneDisplay: displayPhone(r.phone),
    locale: r.locale,
    preferredWindow: r.preferredWindow,
    topic: r.topic,
    notes: r.notes,
    source: r.source,
    status: r.status,
    attempts: r.attempts,
    outcome: r.outcome,
    dueAtIso: r.dueAt ? r.dueAt.toISOString() : null,
    overdue: r.overdue,
    createdAtIso: r.createdAt.toISOString(),
    handledAtIso: r.handledAt ? r.handledAt.toISOString() : null,
    clientProfileId: r.clientProfileId,
    chatSessionId: r.chatSessionId,
    assignedToName: r.assignedToName,
    assignedToMe: r.assignedToId === user.id,
    handledByName: r.handledByName,
  }));

  return (
    <AdminShell
      user={user}
      title="Call-backs"
      description="People who asked us to call them. Open requests come first, most overdue on top."
      actions={canManage ? <NewCallbackForm /> : undefined}
    >
      <FilterChips base="/admin/callbacks" param="view" values={VIEWS} active={view === "open" ? undefined : view} defaultLabel="Open" />
      <CallbackQueue cards={cards} canManage={canManage} />
    </AdminShell>
  );
}
