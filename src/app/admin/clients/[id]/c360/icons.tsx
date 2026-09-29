import type { TimelineKind } from "@/modules/crm/timelineCore";

// 1.7-stroke line icons, one per timeline kind (same family as the admin nav).
const P: Record<TimelineKind | "phone" | "mail" | "whatsapp" | "plus" | "spark" | "warning" | "check" | "user" | "calendar" | "receipt" | "note" | "bell" | "star" | "clock" | "filter", React.ReactNode> = {
  booking: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></>,
  invoice: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></>,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></>,
  payment: <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18M7 15h3" /></>,
  package: <><path d="M12 3 3 7.5v9L12 21l9-4.5v-9z" /><path d="M3 7.5 12 12l9-4.5M12 12v9" /></>,
  giftcard: <><rect x="3" y="8" width="18" height="13" rx="2" /><path d="M3 12h18M12 8v13M12 8s-4-1-4-3 4 1 4 3-4-1 4-3-4 1-4 3" /></>,
  loyalty: <><circle cx="12" cy="12" r="8" /><path d="m12 8 1.2 2.6 2.8.3-2.1 1.9.6 2.8-2.5-1.5-2.5 1.5.6-2.8-2.1-1.9 2.8-.3z" /></>,
  star: <path d="m12 3 2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 17l-5.4 2.8 1.1-6.1L3.2 9.4l6.1-.8z" />,
  chat: <><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9h8M8 12h5" /></>,
  callback: <><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></>,
  phone: <><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" /></>,
  whatsapp: <><path d="M4 20l1.3-3.9A8 8 0 1 1 8 19.1z" /><path d="M9.5 9.5c0 3 2 5 5 5l1-1.5-2-1-1 .8a4 4 0 0 1-1.8-1.8l.8-1-1-2z" /></>,
  inquiry: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  note: <><path d="M5 3h10l4 4v14H5z" /><path d="M15 3v4h4M8 12h8M8 16h5" /></>,
  lead: <><path d="M4 6h16l-6 7v5l-4 2v-7z" /></>,
  filter: <><path d="M4 6h16l-6 7v5l-4 2v-7z" /></>,
  consent: <><path d="M6 3h9l4 4v14H6z" /><path d="m9 14 2 2 4-4" /></>,
  check: <path d="m5 12 4 4 10-10" />,
  treatment: <><path d="M12 3v18M3 12h18" /><circle cx="12" cy="12" r="8" /></>,
  photo: <><rect x="3" y="6" width="18" height="14" rx="2" /><circle cx="12" cy="13" r="3.5" /><path d="M8 6l1.5-2h5L16 6" /></>,
  review: <path d="m12 3 2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 17l-5.4 2.8 1.1-6.1L3.2 9.4l6.1-.8z" />,
  waitlist: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>,
  clock: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  spark: <><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" /></>,
  warning: <><path d="M12 4 3 20h18z" /><path d="M12 10v4M12 17v.5" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  bell: <><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
};

export type IconName = keyof typeof P;

export function Icon({ name, className = "h-4 w-4" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {P[name]}
    </svg>
  );
}
