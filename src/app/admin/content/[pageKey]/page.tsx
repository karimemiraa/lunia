import { notFound } from "next/navigation";
import { requireAdmin } from "../../_components/requireAdmin";
import { AdminShell } from "../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { getPageContent } from "@/modules/cms/pageContent";
import { listMedia } from "@/modules/cms/media";
import { ContentEditorForm } from "./ContentEditorForm";

// Pages with a content editor in this stage. About/Services are added in the
// public-site stage.
const PAGE_LABELS: Record<string, string> = {
  home: "Home",
};

interface ContentEditorPageProps {
  params: Promise<{ pageKey: string }>;
}

export default async function ContentEditorPage({ params }: ContentEditorPageProps) {
  const { pageKey } = await params;
  const user = await requireAdmin(PERMISSIONS.CMS_MANAGE);

  const label = PAGE_LABELS[pageKey];
  if (!label) notFound();

  const [content, media] = await Promise.all([getPageContent(pageKey), listMedia()]);

  const hero = content?.sections.find((section) => section.key === "hero");
  const emptyLocalized = { en: "", ar: "" };

  return (
    <AdminShell user={user} title={`Content: ${label}`} description="Edit the hero section for this page.">
      <ContentEditorForm
        pageKey={pageKey}
        media={media.map((item) => ({
          id: item.id,
          filename: item.filename,
          storageKey: item.storageKey,
          kind: item.kind,
        }))}
        heroMediaId={hero?.heroMediaId ?? null}
        headline={hero?.fields.headline ?? emptyLocalized}
        cta={hero?.fields.cta ?? emptyLocalized}
        intro={hero?.fields.intro ?? emptyLocalized}
      />
    </AdminShell>
  );
}
