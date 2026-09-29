import { notFound } from "next/navigation";

// Catch-all under the public site: any URL that no page claims renders the
// branded (site)/not-found.tsx inside the normal header/footer shell, instead
// of Next's bare root 404.
export default function CatchAllPage() {
  notFound();
}
