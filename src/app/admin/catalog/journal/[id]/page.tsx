import { notFound } from "next/navigation";
import { requireAdmin } from "../../../_components/requireAdmin";
import { AdminShell } from "../../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { getPostById } from "@/modules/catalog/journal";
import { listMedia } from "@/modules/cms/media";
import { EditPostForm } from "./EditPostForm";

interface EditPostPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditPostPage({ params }: EditPostPageProps) {
  const { id } = await params;
  const user = await requireAdmin(PERMISSIONS.CMS_MANAGE);

  const [post, media] = await Promise.all([getPostById(id), listMedia()]);
  if (!post) notFound();

  return (
    <AdminShell user={user} title={`Post: ${post.titleEn}`} description="Edit this journal post's content and media.">
      <EditPostForm
        post={post}
        media={media.map((item) => ({ id: item.id, filename: item.filename, storageKey: item.storageKey, kind: item.kind }))}
      />
    </AdminShell>
  );
}
