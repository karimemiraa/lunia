export const PERMISSIONS = {
  BOOKING_MANAGE: "booking:manage",
  BOOKING_VIEW: "booking:view",
  CLIENT_MANAGE: "client:manage",
  CLIENT_VIEW: "client:view",
  VISITNOTE_WRITE: "visitnote:write",
  CATALOG_MANAGE: "catalog:manage",
  CMS_MANAGE: "cms:manage",
  ANALYTICS_VIEW: "analytics:view",
  MARKETING_MANAGE: "marketing:manage",
  STAFF_MANAGE: "staff:manage",
  SETTINGS_MANAGE: "settings:manage",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
export const ALL_PERMISSION_KEYS: PermissionKey[] = Object.values(PERMISSIONS);

export const ROLE_PERMISSIONS: Record<string, PermissionKey[]> = {
  owner: ALL_PERMISSION_KEYS,
  manager: [
    PERMISSIONS.BOOKING_MANAGE,
    PERMISSIONS.BOOKING_VIEW,
    PERMISSIONS.CLIENT_MANAGE,
    PERMISSIONS.CLIENT_VIEW,
    PERMISSIONS.CATALOG_MANAGE,
    PERMISSIONS.ANALYTICS_VIEW,
    PERMISSIONS.STAFF_MANAGE,
  ],
  reception: [
    PERMISSIONS.BOOKING_MANAGE,
    PERMISSIONS.BOOKING_VIEW,
    PERMISSIONS.CLIENT_MANAGE,
    PERMISSIONS.CLIENT_VIEW,
  ],
  specialist: [PERMISSIONS.BOOKING_VIEW, PERMISSIONS.CLIENT_VIEW, PERMISSIONS.VISITNOTE_WRITE],
  marketing: [PERMISSIONS.ANALYTICS_VIEW, PERMISSIONS.MARKETING_MANAGE, PERMISSIONS.CMS_MANAGE],
};
