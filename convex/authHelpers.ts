import { getAuthUserId } from "@convex-dev/auth/server";
import { QueryCtx, MutationCtx } from "./_generated/server";

type OrgRole = "owner" | "editor" | "viewer";

interface OrgMembership {
  _id: string;
  userId: string;
  organisation: string;
  role: OrgRole;
  createdAt: number;
}

/**
 * Verifies the current user is authenticated and has a membership in the
 * specified organisation.  Optionally enforces a minimum role level.
 *
 * Returns the membership record on success, or throws a descriptive error.
 */
export async function requireOrgMembership(
  ctx: QueryCtx | MutationCtx,
  organisation: string,
  requiredRole?: OrgRole | OrgRole[],
): Promise<OrgMembership> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new Error("Not authenticated");
  }

  const membership = await ctx.db
    .query("organizationMemberships")
    .withIndex("by_user_and_org", (q) =>
      q.eq("userId", userId).eq("organisation", organisation),
    )
    .first();

  if (!membership) {
    throw new Error("You don't have access to this organization");
  }

  if (requiredRole) {
    const allowed = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    if (!allowed.includes(membership.role)) {
      throw new Error(
        `Requires ${allowed.join(" or ")} role in this organization`,
      );
    }
  }

  return membership as unknown as OrgMembership;
}
