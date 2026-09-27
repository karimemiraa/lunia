import Link from "next/link";
import { NextIntlClientProvider } from "next-intl";
import { requireAdmin } from "../../../../_components/requireAdmin";
import { AdminShell } from "../../../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { getLatestIntake, parseIntakeAnswers } from "@/modules/clinical/intake";
import { HealthForm } from "@/components/clinical/HealthForm";
import en from "@/messages/en.json";
import { saveIntakeAction } from "../actions";
import { loadClient } from "../_components/loadClient";

interface Props {
  params: Promise<{ id: string }>;
}

// Staff fill in / update the health questionnaire with the customer at the
// desk. Saving appends a new row (history is kept).
export default async function AdminIntakePage({ params }: Props) {
  const { id } = await params;
  const user = await requireAdmin(PERMISSIONS.CLINICAL_MANAGE);
  const client = await loadClient(id);
  const latest = await getLatestIntake(id);

  return (
    <AdminShell
      user={user}
      title="Health questionnaire"
      description={`${client.displayName}. Saving adds a new version; earlier answers stay in the history.`}
      actions={
        <Link href={`/admin/clients/${id}`} className="lunia-btn lunia-btn-ghost min-h-11">
          Back to customer
        </Link>
      }
    >
      <div className="lunia-card p-5 sm:p-8">
        <NextIntlClientProvider locale="en" timeZone="Asia/Riyadh" messages={{ health: en.health }}>
          <HealthForm initial={latest?.answers ?? parseIntakeAnswers({})} onSubmit={saveIntakeAction.bind(null, id)} />
        </NextIntlClientProvider>
      </div>
    </AdminShell>
  );
}
