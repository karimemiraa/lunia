import { getSetting } from "@/modules/cms/settings";

function digitsOnly(value: string): string {
  return value.replace(/[^\d+]/g, "").replace(/^\+/, "");
}

// A persistent, gently pulsing WhatsApp button anchored to the bottom inline-
// start corner (mirrors under RTL, opposite the Book CTA). Reads the number
// from Settings; renders nothing if none is set. Server component.
export async function WhatsAppFab() {
  const business = await getSetting("business").catch(() => null);
  if (!business?.whatsapp) return null;
  const href = `https://wa.me/${digitsOnly(business.whatsapp)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label="Chat on WhatsApp"
      className="group fixed bottom-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-[var(--shadow-lg)] transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366] focus-visible:ring-offset-2"
      style={{ insetInlineStart: "1.25rem" }}
    >
      <span aria-hidden="true" className="absolute inset-0 rounded-full bg-[#25D366] opacity-60 motion-safe:animate-ping" />
      <svg viewBox="0 0 24 24" fill="currentColor" className="relative h-7 w-7" aria-hidden="true">
        <path d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.7 4.8-1.3A10 10 0 1 0 12 2Zm5.8 14.2c-.24.68-1.4 1.3-1.94 1.34-.5.05-1.13.24-3.8-.8-3.2-1.26-5.24-4.5-5.4-4.72-.16-.22-1.3-1.73-1.3-3.3 0-1.57.82-2.34 1.1-2.66.28-.32.62-.4.83-.4l.6.01c.2 0 .45-.07.7.54.24.6.83 2.06.9 2.2.07.15.12.32.02.53-.1.22-.15.35-.3.53-.15.18-.32.4-.45.54-.15.15-.3.31-.13.6.17.3.76 1.24 1.63 2.02 1.12 1 2.06 1.3 2.36 1.45.3.15.47.13.64-.08.17-.2.74-.86.94-1.16.2-.3.4-.25.67-.15.27.1 1.7.8 2 .95.28.15.47.22.54.34.07.12.07.72-.17 1.4Z" />
      </svg>
    </a>
  );
}
