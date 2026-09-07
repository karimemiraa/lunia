interface MediaFrameProps {
  /** MediaAsset.storageKey — served from /api/media/<key>. Omit/null to render the placeholder. */
  mediaKey?: string | null;
  kind?: "IMAGE" | "VIDEO";
  alt: string;
  /** Focal point as a 0–1 fraction (MediaAsset.focalX/focalY), default centered. */
  focalX?: number;
  focalY?: number;
  aspectClassName?: string;
  className?: string;
  rounded?: boolean;
}

// A small four-point "glow" mark, reused here (and in SectionHeading) as
// the one recurring brand motif — kept subtle, never a full illustration.
function GlowMark({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={`fill-[var(--color-teal)]/70 ${className}`}>
      <path d="M12 0c.6 4.8 2.6 8.2 6 9.6L24 12l-6 2.4c-3.4 1.4-5.4 4.8-6 9.6-.6-4.8-2.6-8.2-6-9.6L0 12l6-2.4C9.4 8.2 11.4 4.8 12 0Z" />
    </svg>
  );
}

// Renders an image or video sourced from the media API by storage key, with
// focal-point positioning so a crop stays sensible across aspect ratios. If
// no media is provided (content not uploaded yet), falls back to a quiet,
// on-brand placeholder rather than a broken image or a generic icon — the
// public site should never look unfinished even with placeholder content.
export function MediaFrame({
  mediaKey,
  kind = "IMAGE",
  alt,
  focalX = 0.5,
  focalY = 0.5,
  aspectClassName = "aspect-[4/5]",
  className = "",
  rounded = true,
}: MediaFrameProps) {
  const shapeClass = `${aspectClassName} ${rounded ? "rounded-2xl" : ""} overflow-hidden ${className}`.trim();

  if (!mediaKey) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`${shapeClass} flex items-center justify-center bg-gradient-to-br from-[var(--color-cream)] to-[var(--color-teal)]/25`}
      >
        <GlowMark className="h-10 w-10" />
      </div>
    );
  }

  const objectPosition = `${focalX * 100}% ${focalY * 100}%`;
  const src = `/api/media/${mediaKey}`;

  return (
    <div className={shapeClass}>
      {kind === "VIDEO" ? (
        <video
          src={src}
          className="h-full w-full object-cover"
          style={{ objectPosition }}
          muted
          loop
          autoPlay
          playsInline
          aria-label={alt}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary uploaded assets, no static domain to configure for next/image
        <img src={src} alt={alt} className="h-full w-full object-cover" style={{ objectPosition }} />
      )}
    </div>
  );
}
