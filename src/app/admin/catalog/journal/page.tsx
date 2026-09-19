import { requireAdmin } from "../../_components/requireAdmin";
import { AdminShell } from "../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { listPosts } from "@/modules/catalog/journal";
import { listMedia } from "@/modules/cms/media";
import { CreatePostForm } from "./CreatePostForm";
import { PostsTable } from "./PostsTable";

export default async function JournalPage() {
  const user = await requireAdmin(PERMISSIONS.CMS_MANAGE);
  const [posts, media] = await Promise.all([listPosts({ publishedOnly: false }), listMedia()]);

  return (
    <AdminShell user={user} title="Blog" description="Manage blog posts.">
      <div className="mb-8 max-w-2xl">
        <CreatePostForm
          media={media.map((item) => ({ id: item.id, filename: item.filename, storageKey: item.storageKey, kind: item.kind }))}
        />
      </div>
      <PostsTable posts={posts} />
    </AdminShell>
  );
}
