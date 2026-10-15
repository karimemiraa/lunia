import { requireAdmin } from "../../_components/requireAdmin";
import { AdminShell } from "../../_components/AdminShell";
import { EmptyState } from "../../_components/EmptyState";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { getStaffLocale, getStaffT } from "../../_i18n/display";
import { intlLocale } from "../../_i18n/t";
import { listAllShowcases, SHOWCASE_CATEGORIES } from "@/modules/clinical/showcase";
import { ShowcaseList } from "./ShowcaseList";

// Website → Results gallery: every before/after pair, published or not.
// Gated on clinical:manage because it shows patient photos.
export default async function ResultsGalleryAdminPage() {
  const user = await requireAdmin(PERMISSIONS.CLINICAL_MANAGE);
  const rows = await listAllShowcases();
  const t = await getStaffT();
  const dFmt = new Intl.DateTimeFormat(intlLocale(await getStaffLocale()), { timeZone: "Asia/Riyadh", dateStyle: "medium" });
  const label = (key: string) => {
    const found = SHOWCASE_CATEGORIES.find((c) => c.key === key)?.label;
    return found ? t(found) : key;
  };

  return (
    <AdminShell
      user={user}
      title="Results gallery"
      description="Before/after pairs shown on the website's Results page. Pairs are added from a customer's clinical photos, only with their recorded consent, and never show names or dates."
    >
      {rows.length === 0 ? (
        <div className="lunia-card">
          <EmptyState
            title={t("No pairs yet")}
            body={t("Open a customer's clinical photos, record their consent to share on a Before and an After photo, compare them, and choose “Add to gallery”.")}
          />
        </div>
      ) : (
        <ShowcaseList
          rows={rows.map((r) => ({
            id: r.id,
            clientProfileId: r.beforePhoto.clientProfileId,
            clientName: r.beforePhoto.client.fullName,
            beforePhotoId: r.beforePhoto.id,
            afterPhotoId: r.afterPhoto.id,
            categoryLabel: label(r.category),
            captionEn: r.captionEn,
            isPublished: r.isPublished,
            consentOk: r.beforePhoto.consentToShare && r.afterPhoto.consentToShare,
            createdLabel: dFmt.format(r.createdAt),
          }))}
        />
      )}
    </AdminShell>
  );
}
