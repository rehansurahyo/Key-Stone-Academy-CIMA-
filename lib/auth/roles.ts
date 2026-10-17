export const PORTAL_ROLES = ["admin", "tutor", "student"] as const;
export type PortalRole = typeof PORTAL_ROLES[number];

export function isPortalRole(value: unknown): value is PortalRole {
  return PORTAL_ROLES.includes(value as PortalRole);
}

// /dashboard resolves the authenticated database role before choosing a workspace.
export const DASHBOARD_PATH = "/dashboard";
