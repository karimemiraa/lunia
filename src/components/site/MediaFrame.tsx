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
        className={`${shapeClass} bg-[linear-gradient(135deg,var(--surface-2),color-mix(in_srgb,var(--color-teal)_30%,transparent))]`}
      />
    );
  }

  const objectPosition = `${focalX * 100}% ${focalY * 100}%`;
  const src = `/api/media/${mediaKey}`;

  // An on-brand gradient sits behind the media so, while it decodes, the frame
  // shows a soft brand wash instead of a blank white box (a lightweight
  // blur-up feel without shipping per-asset placeholder data).
  return (
    <div className={`${shapeClass} bg-[linear-gradient(135deg,var(--surface-2),color-mix(in_srgb,var(--color-teal)_25%,transparent))]`}>
      {kind === "VIDEO" ? (
        <video
          // "#t=0.1" makes iOS paint the first frame as a still (there's no
          // poster for uploaded films) instead of a blank box before playback.
          src={`${src}#t=0.1`}
          preload="metadata"
          width={1280}
          height={720}
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
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          width={1200}
          height={1500}
          className="h-full w-full object-cover"
          style={{ objectPosition }}
        />
      )}
    </div>
  );
}
