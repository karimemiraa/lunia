import Link from "next/link";
import { requireAdmin } from "../_components/requireAdmin";
import { AdminShell } from "../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { listConversations, getConversation } from "@/modules/crm/whatsapp";
import { ReplyBox } from "./ReplyBox";

interface WhatsappPageProps {
  searchParams: Promise<{ c?: string }>;
}

const CENTER_TZ = "Asia/Riyadh";
const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: CENTER_TZ, dateStyle: "medium", timeStyle: "short" });

export default async function WhatsappPage({ searchParams }: WhatsappPageProps) {
  const user = await requireAdmin(PERMISSIONS.CLIENT_MANAGE);
  const params = await searchParams;

  const conversations = await listConversations();
  const activeId = params.c && conversations.some((c) => c.id === params.c) ? params.c : conversations[0]?.id ?? null;
  const active = activeId ? await getConversation(activeId) : null;

  return (
    <AdminShell user={user} title="WhatsApp" description="Answer campaign replies and customer messages from one inbox.">
      {conversations.length === 0 ? (
        <p className="rounded-[var(--radius-lg)] border border-dashed border-[var(--line-strong)] px-4 py-16 text-center text-sm text-[var(--color-ink)]/55">
          No conversations yet. Inbound WhatsApp messages will appear here once the provider webhook is connected.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
          {/* Conversation list */}
          <ul className="flex max-h-[70vh] flex-col gap-1 overflow-y-auto lunia-card p-2">
            {conversations.map((c) => {
              const isActive = c.id === activeId;
              return (
                <li key={c.id}>
                  <Link
                    href={`/admin/whatsapp?c=${c.id}`}
                    className={`flex flex-col gap-0.5 rounded-[var(--radius-sm)] px-3 py-2.5 transition-colors ${
                      isActive ? "bg-[var(--color-forest)]/10" : "hover:bg-[var(--color-ink)]/[0.04]"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-[var(--color-ink)]">{c.clientName || c.phone}</span>
                      {c.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--color-teal)]" aria-label="Unread" />}
                    </span>
                    {c.clientName && <span className="truncate text-xs text-[var(--color-ink)]/45">{c.phone}</span>}
                    {c.lastMessagePreview && <span className="truncate text-xs text-[var(--color-ink)]/55">{c.lastMessagePreview}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* Active thread */}
          {active ? (
            <div className="flex max-h-[70vh] flex-col overflow-hidden lunia-card">
              <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-[var(--color-ink)]">{active.conversation.clientName || active.conversation.phone}</p>
                  <p className="truncate text-xs text-[var(--color-ink)]/50">{active.conversation.phone}</p>
                </div>
                {active.conversation.clientProfileId && (
                  <Link href={`/admin/clients/${active.conversation.clientProfileId}`} className="lunia-btn lunia-btn-forest-outline lunia-btn-sm">
                    Open profile
                  </Link>
                )}
              </div>

              <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
                {active.messages.length === 0 ? (
                  <p className="text-center text-sm text-[var(--color-ink)]/45">No messages yet.</p>
                ) : (
                  active.messages.map((m) => (
                    <div key={m.id} className={`flex ${m.direction === "OUT" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm ${
                          m.direction === "OUT"
                            ? "bg-[var(--color-forest)] text-[var(--color-cream)]"
                            : "bg-[var(--surface-2)] text-[var(--color-ink)]"
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{m.body}</p>
                        <p className={`mt-1 text-[0.65rem] ${m.direction === "OUT" ? "text-[var(--color-cream)]/60" : "text-[var(--color-ink)]/45"}`}>
                          {m.direction === "OUT" ? (m.authorName ? `${m.authorName} · ` : "") : ""}
                          {timeFmt.format(m.createdAt)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <ReplyBox conversationId={active.conversation.id} />
            </div>
          ) : (
            <div className="flex items-center justify-center lunia-card p-16 text-sm text-[var(--color-ink)]/55">
              Select a conversation.
            </div>
          )}
        </div>
      )}
    </AdminShell>
  );
}
