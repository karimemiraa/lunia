import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/iam/rbac";

export default async function AdminHome() {
  const token = (await cookies()).get("lunia_session")?.value;
  const user = await getCurrentUser(token);
  if (!user) redirect("/admin/login");
  return (
    <main className="p-8">
      <h1 className="text-2xl">Dashboard</h1>
      <p>Signed in. Permissions: {user.permissions.size}</p>
    </main>
  );
}
