import Link from "next/link";
import { requireAdmin } from "../_components/requireAdmin";
import { AdminShell } from "../_components/AdminShell";
import { getNotificationFeed, NOTIFICATION_TYPE_LABELS, NOTIFICATION_TYPE_HREF, type NotificationType } from "@/modules/notifications/feed";
import { NotificationList } from "./NotificationList";

interface Props {
  searchParams: Promise<{ type?: string; seen?: string }>;
}

const TYPES = Object.keys(NOTIFICATION_TYPE_LABELS) as NotificationType[];

function qs(params: { type?: string; seen?: string }): string {
  const sp = new URLSearchParams();
  if (params.type) sp.set("type", params.type);
  if (params.seen) sp.set("seen", params.seen);
  const s = sp.toString();
  return `/admin/notifications${s ? `?${s}` : ""}`;
}

// Everything that needs attention, in one place, with a type filter. The
// feed caps items per source; the per-type count links to the module list.
export default async function NotificationsPage({ searchParams }: Props) {
  const user = await requireAdmin();
  const params = await searchParams;
  const type = TYPES.includes(params.type as NotificationType) ? (params.type as NotificationType) : undefined;
  const showSeen = params.seen === "1";
  const feed = await getNotificationFeed(user.permissions, { limit: 100 });
  const items = type ? feed.items.filter((i) => i.type === type) : feed.items;
  const activeTypes = TYPES.filter((t) => (feed.counts[t] ?? 0) > 0);

  return (
    <AdminShell user={user} title="Notifications" description="Everything that still needs attention. Items clear on their own once handled." feed={feed}>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link href={qs({ seen: params.seen })} className={`lunia-btn lunia-btn-sm ${!type ? "lunia-btn-forest" : "lunia-btn-ghost"}`} aria-current={!type ? "page" : undefined}>
          All <span className="lunia-tabular opacity-70">{feed.total}</span>
        </Link>
        {activeTypes.map((t) => (
          <Link
            key={t}
            href={qs({ type: t, seen: params.seen })}
            className={`lunia-btn lunia-btn-sm ${type === t ? "lunia-btn-forest" : "lunia-btn-ghost"}`}
            aria-current={type === t ? "page" : undefined}
          >
            {NOTIFICATION_TYPE_LABELS[t]} <span className="lunia-tabular opacity-70">{feed.counts[t]}</span>
          </Link>
        ))}
        <Link href={qs({ type, seen: showSeen ? undefined : "1" })} className="ms-auto text-xs text-[var(--color-ink)]/60 underline-offset-2 hover:underline">
          {showSeen ? "Hide seen" : "Show seen"}
        </Link>
      </div>

      {type && (feed.counts[type] ?? 0) > items.length && (
        <p className="mb-3 text-xs text-[var(--color-ink)]/55">
          Showing the newest {items.length} of {feed.counts[type]}.{" "}
          <Link href={NOTIFICATION_TYPE_HREF[type]} className="font-medium text-[var(--color-teal-ink)] hover:underline">
            Open {NOTIFICATION_TYPE_LABELS[type].toLowerCase()}
          </Link>
        </p>
      )}

      <NotificationList items={items} showSeen={showSeen} />
    </AdminShell>
  );
}
