-- Role clean-up (docs/PRD-commission-discounts-roles.md §3.3), approved by the owner
-- 2026-10-16: the built-in roles get the new responsibility matrix. Custom roles
-- are untouched. Owner/Admin only gain the new keys. Every role's before → after
-- is written to the audit log. Generated from src/modules/iam/permissions.ts.

INSERT INTO "Permission" ("id", "key") VALUES
  (gen_random_uuid()::text, 'booking:manage'),
  (gen_random_uuid()::text, 'booking:view'),
  (gen_random_uuid()::text, 'client:manage'),
  (gen_random_uuid()::text, 'client:view'),
  (gen_random_uuid()::text, 'visitnote:write'),
  (gen_random_uuid()::text, 'catalog:manage'),
  (gen_random_uuid()::text, 'cms:manage'),
  (gen_random_uuid()::text, 'analytics:view'),
  (gen_random_uuid()::text, 'marketing:manage'),
  (gen_random_uuid()::text, 'staff:manage'),
  (gen_random_uuid()::text, 'settings:manage'),
  (gen_random_uuid()::text, 'clinical:manage'),
  (gen_random_uuid()::text, 'billing:manage'),
  (gen_random_uuid()::text, 'accounting:manage'),
  (gen_random_uuid()::text, 'inventory:manage'),
  (gen_random_uuid()::text, 'hr:manage'),
  (gen_random_uuid()::text, 'discount:give'),
  (gen_random_uuid()::text, 'discount:approve'),
  (gen_random_uuid()::text, 'platform:manage')
ON CONFLICT ("key") DO NOTHING;

-- owner
INSERT INTO "AuditLog" ("id", "actorUserId", "action", "entityType", "entityId", "summary")
SELECT gen_random_uuid()::text, 'system', 'ROLE_PERMISSIONS_UPDATE', 'Role', r."id",
  'Role matrix update (owner): ' || COALESCE((SELECT string_agg(p."key", ', ' ORDER BY p."key") FROM "RolePermission" rp JOIN "Permission" p ON p."id" = rp."permissionId" WHERE rp."roleId" = r."id"), 'none')
  || ' → ' || 'accounting:manage, analytics:view, billing:manage, booking:manage, booking:view, catalog:manage, client:manage, client:view, clinical:manage, cms:manage, discount:approve, discount:give, hr:manage, inventory:manage, marketing:manage, platform:manage, settings:manage, staff:manage, visitnote:write'
FROM "Role" r WHERE r."key" = 'owner';
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "Role" r JOIN "Permission" p ON p."key" IN ('booking:manage', 'booking:view', 'client:manage', 'client:view', 'visitnote:write', 'catalog:manage', 'cms:manage', 'analytics:view', 'marketing:manage', 'staff:manage', 'settings:manage', 'clinical:manage', 'billing:manage', 'accounting:manage', 'inventory:manage', 'hr:manage', 'discount:give', 'discount:approve', 'platform:manage')
WHERE r."key" = 'owner'
ON CONFLICT DO NOTHING;

-- admin
INSERT INTO "AuditLog" ("id", "actorUserId", "action", "entityType", "entityId", "summary")
SELECT gen_random_uuid()::text, 'system', 'ROLE_PERMISSIONS_UPDATE', 'Role', r."id",
  'Role matrix update (admin): ' || COALESCE((SELECT string_agg(p."key", ', ' ORDER BY p."key") FROM "RolePermission" rp JOIN "Permission" p ON p."id" = rp."permissionId" WHERE rp."roleId" = r."id"), 'none')
  || ' → ' || 'accounting:manage, analytics:view, billing:manage, booking:manage, booking:view, catalog:manage, client:manage, client:view, clinical:manage, cms:manage, discount:approve, discount:give, hr:manage, inventory:manage, marketing:manage, settings:manage, staff:manage, visitnote:write'
FROM "Role" r WHERE r."key" = 'admin';
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "Role" r JOIN "Permission" p ON p."key" IN ('booking:manage', 'booking:view', 'client:manage', 'client:view', 'visitnote:write', 'catalog:manage', 'cms:manage', 'analytics:view', 'marketing:manage', 'staff:manage', 'settings:manage', 'clinical:manage', 'billing:manage', 'accounting:manage', 'inventory:manage', 'hr:manage', 'discount:give', 'discount:approve')
WHERE r."key" = 'admin'
ON CONFLICT DO NOTHING;

-- manager
INSERT INTO "AuditLog" ("id", "actorUserId", "action", "entityType", "entityId", "summary")
SELECT gen_random_uuid()::text, 'system', 'ROLE_PERMISSIONS_UPDATE', 'Role', r."id",
  'Role matrix update (manager): ' || COALESCE((SELECT string_agg(p."key", ', ' ORDER BY p."key") FROM "RolePermission" rp JOIN "Permission" p ON p."id" = rp."permissionId" WHERE rp."roleId" = r."id"), 'none')
  || ' → ' || 'accounting:manage, analytics:view, billing:manage, booking:manage, booking:view, catalog:manage, client:manage, client:view, clinical:manage, discount:approve, discount:give, inventory:manage, staff:manage, visitnote:write'
FROM "Role" r WHERE r."key" = 'manager';
DELETE FROM "RolePermission" WHERE "roleId" IN (SELECT "id" FROM "Role" WHERE "key" = 'manager')
  AND "permissionId" NOT IN (SELECT "id" FROM "Permission" WHERE "key" IN ('booking:manage', 'booking:view', 'client:manage', 'client:view', 'visitnote:write', 'clinical:manage', 'catalog:manage', 'analytics:view', 'staff:manage', 'billing:manage', 'discount:give', 'discount:approve', 'accounting:manage', 'inventory:manage'));
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "Role" r JOIN "Permission" p ON p."key" IN ('booking:manage', 'booking:view', 'client:manage', 'client:view', 'visitnote:write', 'clinical:manage', 'catalog:manage', 'analytics:view', 'staff:manage', 'billing:manage', 'discount:give', 'discount:approve', 'accounting:manage', 'inventory:manage')
WHERE r."key" = 'manager'
ON CONFLICT DO NOTHING;

-- reception
INSERT INTO "AuditLog" ("id", "actorUserId", "action", "entityType", "entityId", "summary")
SELECT gen_random_uuid()::text, 'system', 'ROLE_PERMISSIONS_UPDATE', 'Role', r."id",
  'Role matrix update (reception): ' || COALESCE((SELECT string_agg(p."key", ', ' ORDER BY p."key") FROM "RolePermission" rp JOIN "Permission" p ON p."id" = rp."permissionId" WHERE rp."roleId" = r."id"), 'none')
  || ' → ' || 'billing:manage, booking:manage, booking:view, client:manage, client:view, visitnote:write'
FROM "Role" r WHERE r."key" = 'reception';
DELETE FROM "RolePermission" WHERE "roleId" IN (SELECT "id" FROM "Role" WHERE "key" = 'reception')
  AND "permissionId" NOT IN (SELECT "id" FROM "Permission" WHERE "key" IN ('booking:manage', 'booking:view', 'client:manage', 'client:view', 'visitnote:write', 'billing:manage'));
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "Role" r JOIN "Permission" p ON p."key" IN ('booking:manage', 'booking:view', 'client:manage', 'client:view', 'visitnote:write', 'billing:manage')
WHERE r."key" = 'reception'
ON CONFLICT DO NOTHING;

-- specialist
INSERT INTO "AuditLog" ("id", "actorUserId", "action", "entityType", "entityId", "summary")
SELECT gen_random_uuid()::text, 'system', 'ROLE_PERMISSIONS_UPDATE', 'Role', r."id",
  'Role matrix update (specialist): ' || COALESCE((SELECT string_agg(p."key", ', ' ORDER BY p."key") FROM "RolePermission" rp JOIN "Permission" p ON p."id" = rp."permissionId" WHERE rp."roleId" = r."id"), 'none')
  || ' → ' || 'booking:view, client:view, clinical:manage, discount:give, visitnote:write'
FROM "Role" r WHERE r."key" = 'specialist';
DELETE FROM "RolePermission" WHERE "roleId" IN (SELECT "id" FROM "Role" WHERE "key" = 'specialist')
  AND "permissionId" NOT IN (SELECT "id" FROM "Permission" WHERE "key" IN ('booking:view', 'client:view', 'visitnote:write', 'clinical:manage', 'discount:give'));
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "Role" r JOIN "Permission" p ON p."key" IN ('booking:view', 'client:view', 'visitnote:write', 'clinical:manage', 'discount:give')
WHERE r."key" = 'specialist'
ON CONFLICT DO NOTHING;

-- marketing
INSERT INTO "AuditLog" ("id", "actorUserId", "action", "entityType", "entityId", "summary")
SELECT gen_random_uuid()::text, 'system', 'ROLE_PERMISSIONS_UPDATE', 'Role', r."id",
  'Role matrix update (marketing): ' || COALESCE((SELECT string_agg(p."key", ', ' ORDER BY p."key") FROM "RolePermission" rp JOIN "Permission" p ON p."id" = rp."permissionId" WHERE rp."roleId" = r."id"), 'none')
  || ' → ' || 'analytics:view, cms:manage, marketing:manage'
FROM "Role" r WHERE r."key" = 'marketing';
DELETE FROM "RolePermission" WHERE "roleId" IN (SELECT "id" FROM "Role" WHERE "key" = 'marketing')
  AND "permissionId" NOT IN (SELECT "id" FROM "Permission" WHERE "key" IN ('analytics:view', 'marketing:manage', 'cms:manage'));
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "Role" r JOIN "Permission" p ON p."key" IN ('analytics:view', 'marketing:manage', 'cms:manage')
WHERE r."key" = 'marketing'
ON CONFLICT DO NOTHING;

-- sales
INSERT INTO "AuditLog" ("id", "actorUserId", "action", "entityType", "entityId", "summary")
SELECT gen_random_uuid()::text, 'system', 'ROLE_PERMISSIONS_UPDATE', 'Role', r."id",
  'Role matrix update (sales): ' || COALESCE((SELECT string_agg(p."key", ', ' ORDER BY p."key") FROM "RolePermission" rp JOIN "Permission" p ON p."id" = rp."permissionId" WHERE rp."roleId" = r."id"), 'none')
  || ' → ' || 'analytics:view, billing:manage, booking:manage, booking:view, client:manage, client:view, visitnote:write'
FROM "Role" r WHERE r."key" = 'sales';
DELETE FROM "RolePermission" WHERE "roleId" IN (SELECT "id" FROM "Role" WHERE "key" = 'sales')
  AND "permissionId" NOT IN (SELECT "id" FROM "Permission" WHERE "key" IN ('booking:manage', 'booking:view', 'client:manage', 'client:view', 'visitnote:write', 'analytics:view', 'billing:manage'));
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "Role" r JOIN "Permission" p ON p."key" IN ('booking:manage', 'booking:view', 'client:manage', 'client:view', 'visitnote:write', 'analytics:view', 'billing:manage')
WHERE r."key" = 'sales'
ON CONFLICT DO NOTHING;

-- telesales
INSERT INTO "AuditLog" ("id", "actorUserId", "action", "entityType", "entityId", "summary")
SELECT gen_random_uuid()::text, 'system', 'ROLE_PERMISSIONS_UPDATE', 'Role', r."id",
  'Role matrix update (telesales): ' || COALESCE((SELECT string_agg(p."key", ', ' ORDER BY p."key") FROM "RolePermission" rp JOIN "Permission" p ON p."id" = rp."permissionId" WHERE rp."roleId" = r."id"), 'none')
  || ' → ' || 'analytics:view, booking:manage, booking:view, client:manage, client:view, marketing:manage, visitnote:write'
FROM "Role" r WHERE r."key" = 'telesales';
DELETE FROM "RolePermission" WHERE "roleId" IN (SELECT "id" FROM "Role" WHERE "key" = 'telesales')
  AND "permissionId" NOT IN (SELECT "id" FROM "Permission" WHERE "key" IN ('client:manage', 'client:view', 'booking:manage', 'booking:view', 'visitnote:write', 'marketing:manage', 'analytics:view'));
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id" FROM "Role" r JOIN "Permission" p ON p."key" IN ('client:manage', 'client:view', 'booking:manage', 'booking:view', 'visitnote:write', 'marketing:manage', 'analytics:view')
WHERE r."key" = 'telesales'
ON CONFLICT DO NOTHING;

