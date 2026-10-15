-- AlterTable
ALTER TABLE "BlogPost" ADD COLUMN     "authorNameAr" TEXT;

-- AlterTable
ALTER TABLE "MembershipTier" ADD COLUMN     "nameAr" TEXT;

-- AlterTable
ALTER TABLE "StaffProfile" ADD COLUMN     "fullNameAr" TEXT;

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "nameAr" TEXT;


-- Arabic names for the built-in defaults (only where the English name is
-- still the seeded default and no Arabic name has been set).
UPDATE "MembershipTier" SET "nameAr" = CASE "key"
  WHEN 'guest' THEN 'زائرة'
  WHEN 'member' THEN 'عضوة'
  WHEN 'vip' THEN 'VIP'
  WHEN 'bride' THEN 'برنامج العروس'
  WHEN 'postsurgery' THEN 'برنامج ما بعد العمليات'
END
WHERE "nameAr" IS NULL AND "key" IN ('guest', 'member', 'vip', 'bride', 'postsurgery');

UPDATE "Room" SET "nameAr" = CASE "name"
  WHEN 'Treatment Room 1' THEN 'غرفة العلاج 1'
  WHEN 'Treatment Room 2' THEN 'غرفة العلاج 2'
  WHEN 'Recovery Lounge' THEN 'صالة التعافي'
END
WHERE "nameAr" IS NULL AND "name" IN ('Treatment Room 1', 'Treatment Room 2', 'Recovery Lounge');

UPDATE "BlogPost" SET "authorNameAr" = 'فريق تحرير لونيا'
WHERE "authorNameAr" IS NULL AND "authorName" = 'Lunia Editorial Team';
