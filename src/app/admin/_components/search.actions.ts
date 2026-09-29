"use server";

import { requireAdmin } from "./requireAdmin";
import { globalSearch, emptySearchResult, type GlobalSearchResult } from "@/modules/search/globalSearch";

/**
 * Command-palette search. The viewer's permissions are resolved server-side
 * from the session (never trusted from the client) and passed into
 * globalSearch, which drops every group the viewer may not see.
 */
export async function paletteSearchAction(query: string): Promise<GlobalSearchResult> {
  const user = await requireAdmin();
  const q = typeof query === "string" ? query.trim().slice(0, 80) : "";
  if (q.length < 2) return emptySearchResult();
  return globalSearch(q, user.permissions);
}
