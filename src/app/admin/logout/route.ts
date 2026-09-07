import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { destroySession } from "@/modules/iam/session";

export async function POST() {
  const store = await cookies();
  const token = store.get("lunia_session")?.value;
  if (token) await destroySession(token);
  store.delete("lunia_session");
  redirect("/admin/login");
}
