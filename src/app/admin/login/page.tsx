"use client";
import { useActionState } from "react";
import { login } from "./actions";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const [state, action] = useActionState(login, null);
  return (
    <main className="mx-auto max-w-sm mt-32 px-6">
      <h1 className="text-2xl mb-6">Lunia Admin</h1>
      <form action={action} className="flex flex-col gap-4">
        <input name="email" type="email" placeholder="Email" className="border p-3" required />
        <input name="password" type="password" placeholder="Password" className="border p-3" required />
        {state?.error && <p className="text-red-600 text-sm">{state.error}</p>}
        <Button type="submit">Sign in</Button>
      </form>
    </main>
  );
}
