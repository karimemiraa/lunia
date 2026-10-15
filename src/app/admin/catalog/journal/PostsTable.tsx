"use client";

import type { BlogPost } from "@prisma/client";
import { DataTable, type Column } from "../../_ui/DataTable";
import { useStaffLocale, useStaffT } from "../../_i18n/StaffI18n";
import { intlLocale } from "../../_i18n/t";
import { ConfirmDeleteButton } from "../../_components/ConfirmDeleteButton";
import { deletePostAction } from "./actions";

export function PostsTable({ posts }: { posts: BlogPost[] }) {
  const t = useStaffT();
  const locale = useStaffLocale();
  const columns: Column<BlogPost>[] = [
    { key: "titleEn", header: t("Title"), primary: true, value: (p) => p.titleEn, render: (p) => (locale === "ar" && p.titleAr ? p.titleAr : p.titleEn) },
    { key: "slug", header: t("Slug"), value: (p) => p.slug },
    {
      key: "publishedAt",
      header: t("Published at"),
      value: (p) => (p.publishedAt ? new Date(p.publishedAt) : null),
      render: (p) => (p.publishedAt ? new Date(p.publishedAt).toLocaleDateString(intlLocale(locale, "en-US"), { timeZone: "Asia/Riyadh" }) : t("None")),
    },
    { key: "isPublished", header: t("Published"), value: (p) => (p.isPublished ? t("Yes") : t("No")) },
    {
      key: "edit",
      header: "",
      sortable: false,
      render: (p) => (
        <a href={`/admin/catalog/journal/${p.id}`} className="text-sm font-medium text-[var(--color-teal)] hover:underline">
          {t("Edit")}
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
          <ConfirmDeleteButton action={deletePostAction} confirmMessage={t('Delete post "{title}"? This cannot be undone.', { title: locale === "ar" && p.titleAr ? p.titleAr : p.titleEn })} />
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
      searchPlaceholder={t("Search posts...")}
      empty={t("No posts yet.")}
      ariaLabel={t("Blog posts")}
    />
  );
}
