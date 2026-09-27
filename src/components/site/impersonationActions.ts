"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CLIENT_SESSION_COOKIE, destroyClientSession } from "@/modules/iam/clientAuth";
import { IMPERSONATION_COOKIE, endImpersonation } from "@/modules/iam/impersonation";

// Ends a "view as customer" preview: destroys the preview's client session
// and marker, clears both cookies and returns the staff member to the
// customer's admin page.
export async function exitCustomerView(): Promise<void> {
  const store = await cookies();
  const record = await endImpersonation(store.get(IMPERSONATION_COOKIE)?.value);
  const clientToken = store.get(CLIENT_SESSION_COOKIE)?.value;
  if (clientToken) await destroyClientSession(clientToken);
  store.delete(CLIENT_SESSION_COOKIE);
  store.delete(IMPERSONATION_COOKIE);
  redirect(record ? `/admin/clients/${record.clientProfileId}` : "/admin/clients");
}
