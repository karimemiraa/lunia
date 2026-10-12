"use client";

import type { BlogPost } from "@prisma/client";
import { DataTable, type Column } from "../../_ui/DataTable";
import { ConfirmDeleteButton } from "../../_components/ConfirmDeleteButton";
import { deletePostAction } from "./actions";

export function PostsTable({ posts }: { posts: BlogPost[] }) {
  const columns: Column<BlogPost>[] = [
    { key: "titleEn", header: "Title", primary: true, value: (p) => p.titleEn, render: (p) => p.titleEn },
    { key: "slug", header: "Slug", value: (p) => p.slug },
    {
      key: "publishedAt",
      header: "Published at",
      value: (p) => (p.publishedAt ? new Date(p.publishedAt) : null),
      render: (p) => (p.publishedAt ? new Date(p.publishedAt).toLocaleDateString() : "None"),
    },
    { key: "isPublished", header: "Published", value: (p) => (p.isPublished ? "Yes" : "No") },
    {
      key: "edit",
      header: "",
      sortable: false,
      render: (p) => (
        <a href={`/admin/catalog/journal/${p.id}`} className="text-sm font-medium text-[var(--color-teal)] hover:underline">
          Edit
        </a>
      ),
    },
    {
      key: "delete",
      header: "",
      sortable: false,
      render: (p) => (
        <form>
          <input type="hidden" name="id" value={p.id} />
          <ConfirmDeleteButton action={deletePostAction} confirmMessage={`Delete post "${p.titleEn}"? This cannot be undone.`} />
        </form>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={posts}
      rowKey={(p) => p.id}
      initialSort={{ key: "publishedAt", dir: "desc" }}
      search={(p) => `${p.titleEn} ${p.slug}`}
      searchPlaceholder="Search posts..."
      empty="No posts yet."
      ariaLabel="Journal posts"
    />
  );
}
