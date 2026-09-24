import type { SiteMedia } from "@/lib/siteMedia";
import { MediaFrame } from "../MediaFrame";

interface SmartMediaProps {
  media: SiteMedia;
  alt?: string;
  className?: string;
}

// Renders any SiteMedia (static still, ambient film, or a CMS upload) filling
// its parent. Films are muted loops that only play while on screen
// (CinematicScroll's video[data-inview-play]); SmartMediaEager autoplays
// instead, for above-the-fold heroes.
export function SmartMedia({ media, alt = "", className = "" }: SmartMediaProps) {
  const fill = `h-full w-full object-cover ${className}`.trim();

  if (media.type === "cms") {
    return <MediaFrame mediaKey={media.key} kind={media.kind} alt={alt} aspectClassName="h-full" rounded={false} className="h-full w-full" />;
  }

  if (media.type === "image") {
    // eslint-disable-next-line @next/next/no-img-element -- static brand media from /public
    return <img src={media.src} alt={alt} loading="lazy" decoding="async" className={fill} />;
  }

  return (
    <video data-inview-play muted loop playsInline preload="none" poster={media.poster} aria-hidden={alt ? undefined : true} aria-label={alt || undefined} className={fill}>
      {media.mobileSrc && <source src={media.mobileSrc} type="video/mp4" media="(max-width: 767px)" />}
      <source src={media.src} type="video/mp4" />
    </video>
  );
}

export function SmartMediaEager({ media, alt = "", className = "" }: SmartMediaProps) {
  if (media.type !== "video") return <SmartMedia media={media} alt={alt} className={className} />;
  return (
    <video autoPlay muted loop playsInline preload="auto" poster={media.poster} aria-hidden={alt ? undefined : true} aria-label={alt || undefined} className={`h-full w-full object-cover ${className}`.trim()}>
      {media.mobileSrc && <source src={media.mobileSrc} type="video/mp4" media="(max-width: 767px)" />}
      <source src={media.src} type="video/mp4" />
    </video>
  );
}
