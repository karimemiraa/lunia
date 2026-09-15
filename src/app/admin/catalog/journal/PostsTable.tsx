"use client";

import type { BlogPost } from "@prisma/client";
import { DataTable, type DataTableColumn } from "../../_components/DataTable";
import { ConfirmDeleteButton } from "../../_components/ConfirmDeleteButton";
import { deletePostAction } from "./actions";

export function PostsTable({ posts }: { posts: BlogPost[] }) {
  const columns: DataTableColumn<BlogPost>[] = [
    { key: "titleEn", header: "Title", render: (p) => p.titleEn },
    { key: "slug", header: "Slug" },
    {
      key: "publishedAt",
      header: "Published at",
      render: (p) => (p.publishedAt ? new Date(p.publishedAt).toLocaleDateString() : "None"),
    },
    { key: "isPublished", header: "Published", render: (p) => (p.isPublished ? "Yes" : "No") },
    {
      key: "edit",
      header: "",
      render: (p) => (
        <a href={`/admin/catalog/journal/${p.id}`} className="text-sm font-medium text-[var(--color-teal)] hover:underline">
          Edit
        </a>
      ),
    },
    {
      key: "delete",
      header: "",
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
      searchAccessor={(p) => `${p.titleEn} ${p.slug}`}
      searchPlaceholder="Search posts..."
      emptyMessage="No posts yet."
    />
  );
}
