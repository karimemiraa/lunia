import type { JsonLd as JsonLdData } from "@/modules/seo/jsonld";

// Renders a JSON-LD payload as a <script type="application/ld+json"> tag.
// Server component only — dangerouslySetInnerHTML here is the standard/safe
// pattern for injecting a JSON.stringify of our own structured-data object
// (never user-supplied HTML).
export function JsonLd({ data }: { data: JsonLdData | JsonLdData[] }) {
  return (
    <script
      type="application/ld+json"
      // JSON.stringify of a trusted, self-authored structured-data object — the
      // standard/safe pattern for embedding JSON-LD in the page.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
