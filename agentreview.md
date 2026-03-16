# Agent Code Review Report

**Date:** 2026-03-16
**Reviewed Files:**
- `convex/schema.ts`, `convex/auth.config.ts`, `convex/http.ts`, `convex/crons.ts`
- `convex/moodCheckins.ts`, `convex/employees.ts`, `convex/users.ts`, `convex/groups.ts`
- `convex/organizationMemberships.ts`, `convex/managerInvitations.ts`
- `convex/passwordReset.ts`, `convex/passwordResetActions.ts`
- `convex/accessRequests.ts`, `convex/emailValidation.ts`, `convex/authHelpers.ts`
- `app/layout.tsx`, `app/page.tsx`, `app/signin/page.tsx`
- `app/manager/layout.tsx`, `app/manager/page.tsx`, `app/manager/view/page.tsx`
- `app/manager/edit/page.tsx`, `app/manager/managers/page.tsx`, `app/manager/account/page.tsx`
- `app/mood-response/page.tsx`, `app/viewer/dashboard/page.tsx`
- `app/accept-invitation/page.tsx`, `app/invite/page.tsx`, `app/request-access/page.tsx`
- `app/reset-password/page.tsx`, `app/select-organization/page.tsx`
- `app/api/check-email/route.ts`
- `components/ConvexClientProvider.tsx`, `components/ui/loading-spinner.tsx`
- `proxy.ts`, `package.json`

**Reviewer:** Static Code Review Agent
**Severity Summary:** CRITICAL: 5 (all fixed) | HIGH: 12 | MEDIUM: 15 | LOW: 8
**Last Updated:** 2026-03-16

---

## Changelog — 2026-03-16 Update

### Changes detected since 2026-03-15

#### `convex/crons.ts`
- **FIXED:** Cron expression changed from `0 14 * * 1-5` (2pm UTC / 4pm SAST) to `0 13 * * 1-5` (1pm UTC / 3pm SAST). The comment now matches both the code and CLAUDE.md documentation. Previously the code said "4pm SAST" but CLAUDE.md said "3pm SAST" — this discrepancy is now resolved.

#### `proxy.ts`
- Confirmed: `middleware.ts` was previously renamed to `proxy.ts` for Next.js 16 compatibility. File is still present and unchanged. However, `proxy.ts` now exports `convexAuthNextjsMiddleware()` as a default export, which is the correct pattern.

#### `app/manager/layout.tsx`
- Inline loading spinner still present (lines 122-132) instead of using `LoadingSpinner` component. Previously tracked as STYLE-2 partial fix.

#### `app/manager/account/page.tsx`
- Inline loading spinner still present (lines 106-116) instead of using `LoadingSpinner` component.

#### `app/select-organization/page.tsx`
- Inline loading spinner still present (lines 73-83) instead of using `LoadingSpinner` component.

#### `app/signin/page.tsx`
- Inline loading spinner still present (lines 485-491) instead of using `LoadingSpinner` component.

#### New Findings
- NEW: `getHistoricalCheckins` still issues N+1 per-day queries (lines 542-551 of moodCheckins.ts) — unlike `getTrends`/`getGroupTrends` which were batch-converted.
- NEW: `acceptInvitation` mutation accepts `userId` as an argument without verifying it matches the authenticated user.
- NEW: `deleteAccount` does not clean up employees, groups, invitations, or access requests associated with the user's organizations.
- NEW: `groups.getMembers` has no authentication check.
- NEW: `getAuthAccount` internal query is missing a `returns` validator.

---

## Changelog — Post-Review Fixes & Changes (2026-03-15)

### `convex/moodCheckins.ts`
- **LOGIC-1**: Added `getSASTDateString()` helper returning YYYY-MM-DD in UTC+2; replaced all 8 instances of `new Date().toISOString().split("T")[0]`.
- **LOGIC-3**: Added `notesOnly: v.optional(v.boolean())` arg to `getHistoricalCheckins`; defaults to current behavior (true).
- **BUG-2**: Refactored `getTrends` and `getGroupTrends` to batch-fetch all check-ins via the `by_organisation` index once, then group by date in JS (eliminates N+1 per-day queries).
- **BUG-3**: `getGroupTodayCheckins` still filters in JS after org-scoped fetch — this is inherent to the data model; documented as acceptable.
- **PERF-1**: Reduced inter-email delay from 500ms to 200ms.
- **PERF-3**: AI messages are now generated once per encouragement type (regular/extra) and reused across all employees on the same day.

### `convex/employees.ts`
- **LOGIC-2**: Duplicate employee check now matches on email only (not email+name).

### `convex/groups.ts`
- **LOGIC-6**: `groups.remove` now soft-deletes group members (`ctx.db.patch` with `removedAt`) instead of hard-deleting.
- **BP-1**: Replaced `.filter()` in `addMember` with JS `.find()` after `.collect()`.

### `convex/managerInvitations.ts`
- **LOGIC-5**: `fixOrphanedInvitation` now checks expiration time and status before creating memberships.
- **BP-1**: Replaced `.filter()` in `createInvitation` and both `acceptInvitation*` mutations with index-based queries + JS filtering.
- **BP-3/BUG-4**: Added `returns` validators to `acceptInvitation`, `acceptInvitationForExistingUser`, and `fixOrphanedInvitation`.

### `convex/accessRequests.ts`
- **BP-1**: Replaced `.filter()` in `checkApprovedAccessRequest` with `by_email_and_organisation` index + JS find.
- **BP-3**: Added `returns` validators to `createAccessRequest`, `approveAccessRequest`, and `declineAccessRequest`.

### `convex/passwordReset.ts`
- **BP-1**: Replaced `.filter()` in `requestPasswordReset` with JS `.find()` after `.collect()`.

### `convex/schema.ts`
- Added `by_email_and_organisation` index to `managerInvitations` table.
- Added `by_email_and_organisation` index to `accessRequests` table.

### `convex/authHelpers.ts` (NEW)
- **ARCH-3**: Extracted `requireOrgMembership(ctx, organisation, requiredRole?)` shared helper.

### `app/manager-signup/page.tsx` (DELETED)
- **ARCH-4/DEP-2**: Removed dead code page that always redirected.

### `components/ui/loading-spinner.tsx` (NEW)
- **STYLE-2**: Extracted reusable `LoadingSpinner` component; replaced inline spinners in 6 files.

### `app/page.tsx`
- **BUG-5**: Copyright year now uses `new Date().getFullYear()` instead of hardcoded 2025.
- **STYLE-2**: Replaced inline loading spinner with `LoadingSpinner` component.

### `package.json`
- **DEP-1**: Moved `@types/bcryptjs` from `dependencies` to `devDependencies`.

---

## Changelog — Post-Review Fixes & Changes (2026-03-14)

### Schema
- Added `emailVerificationTime: v.optional(v.number())` to `users` table to match field written by Convex Auth, fixing prod deploy schema validation failure.

### `convex/moodCheckins.ts`
- Removed `encouragement` field entirely from `CHECKIN_MESSAGES`, `FOLLOWUP_ENCOURAGEMENT_MESSAGES`, `getFallbackMessage`, `generateAIMessage`, and `todaysMessage` type — field was unused.
- Removed two unused `dayEndTimestamp` variables (lines ~235, ~610) — ESLint `no-unused-vars` warnings.
- Changed email layout: mood buttons now appear **before** the daily verse (previously verse was above buttons).
- Changed email heading from rotating `todaysMessage.greeting` to fixed `"How are you feeling today, {firstName}?"`.
- Fixed `BUG-1` (partially): Changed `v.id("employees")` to `v.string()` with internal try/catch cast on `hasSubmittedToday`, `record`, and `updateDetails` — invalid/wrong-table IDs now return `false` or throw a user-friendly error instead of crashing with an `ArgumentValidationError`. Also added `as Id<"employees">` casts on index queries and insert to satisfy TypeScript.

### `app/mood-response/page.tsx`
- Added `token` to `useEffect` dependency array (ESLint `react-hooks/exhaustive-deps` warning).
- `useQuery` for `hasSubmittedToday` now skips when `employeeId` is null (was already implemented, confirmed correct).

### `app/page.tsx`
- Added `loading="eager"` to LCP image (`/smile.png` above the fold).
- Added `style={{ width: "auto" }}` to `/smile.png` and `/sad.png` at the top of the page.
- Added `style={{ width: "auto" }}` to `/smile.png` in the footer (line ~279).

### `middleware.ts` -> `proxy.ts`
- Renamed `middleware.ts` to `proxy.ts` and changed `export const middleware` to `export default` to comply with Next.js 16 deprecation of the `middleware` file convention.

### `package.json`
- `convex` moved back to `dependencies` (had been accidentally moved to `devDependencies` by `npm install --save-dev`).
- Convex updated to `1.33.1`; also installed globally to silence CLI update warning.

---

## Overview

The R u OK codebase is a workplace wellbeing check-in application with a Convex backend and Next.js 16 frontend. The overall architecture is sound: multi-tenant organization memberships, soft deletion patterns, role-based access control, and a clear separation between authenticated manager views and unauthenticated employee mood-response pages.

The codebase has improved substantially since the initial review on 2026-03-14. All 5 critical issues have been resolved, including the unauthenticated mood check-in endpoints (now token-protected), the polling loop in the invitation mutation, the password reset race condition, email enumeration hardening, and invitation token leakage. The cron schedule has been corrected to match the documented 3pm SAST target. The `authHelpers.ts` utility has been extracted, and index-based querying has replaced most `.filter()` usages.

However, several structural issues persist: the organization selection remains localStorage-based, `moodCheckins.ts` is still over 1600 lines with 365 Bible verses embedded inline, several inline loading spinners remain despite the `LoadingSpinner` component existing, and the `authHelpers.ts` helper is not yet adopted by existing functions. New issues identified in this review include a missing authentication check on `groups.getMembers`, `getHistoricalCheckins` still using N+1 per-day queries, and the `acceptInvitation` mutation not verifying that the passed `userId` matches the authenticated user.

---

## Critical Issues

### [CRITICAL-1] ~~Mood Check-in Endpoints Have No Authentication or Authorization~~ ✅ FIXED (2026-03-14)
- **File:** `convex/moodCheckins.ts` (functions: `record`, `updateDetails`, `hasSubmittedToday`)
- **Description:** The `record`, `updateDetails`, and `hasSubmittedToday` mutations/queries accepted an `employeeId` directly from the client with zero authentication.
- **Fix Applied:** Added `moodCheckinTokens` table. `sendDailyEmails` generates a `crypto.randomUUID()` token per employee (36h expiry), stores it in the table, and embeds it in email links. The `record` and `updateDetails` mutations now require and validate this token.

### [CRITICAL-2] ~~Polling Loop with setTimeout Inside a Convex Mutation~~ ✅ FIXED (2026-03-14)
- **File:** `convex/managerInvitations.ts` (function: `acceptInvitation`)
- **Description:** The `acceptInvitation` mutation contained a `while` loop with `setTimeout` polling.
- **Fix Applied:** Removed the `while` loop and all `setTimeout` usage. Replaced with a single `ctx.db.get(args.userId)` call.

### [CRITICAL-3] ~~Password Reset Race Condition Between Mutation and Scheduled Action~~ ✅ FIXED (2026-03-14)
- **File:** `convex/passwordReset.ts` (function: `resetPassword`)
- **Description:** Race condition between mutation completing and scheduled action executing.
- **Fix Applied:** Added `await ctx.db.patch(reset._id, { used: true })` inside the `resetPassword` mutation before scheduling the action.

### [CRITICAL-4] ~~Email Enumeration via Public Query~~ ✅ FIXED (partially, 2026-03-14)
- **File:** `convex/users.ts` (function: `checkEmailExists`), `app/api/check-email/route.ts`
- **Description:** Public functions that reveal whether an email is registered.
- **Fix Applied:** REST endpoint neutralized (returns 404). Convex query remains for UX flow but is subject to platform-level rate limiting. **Residual risk** remains — the query is unauthenticated.

### [CRITICAL-5] ~~Invitation Token Exposed in Public Query Response~~ ✅ FIXED (partially, 2026-03-14)
- **File:** `convex/managerInvitations.ts` (function: `getInvitationByToken`)
- **Description:** Token field was echoed back in the response.
- **Fix Applied:** `getInvitationByToken` no longer returns the `token` field. `listInvitations` intentionally still returns it for the "copy invite link" feature (authenticated, owner-only).

---

## Workflow / Logic Issues

### [LOGIC-1] ~~`new Date().toISOString().split("T")[0]` Uses UTC, Not Local Time~~ ✅ FIXED (2026-03-15)
- **File:** `convex/moodCheckins.ts`
- **Description:** UTC date instead of SAST was used for date calculations.
- **Fix Applied:** `getSASTDateString()` helper now used throughout.

### [LOGIC-2] ~~Employee Duplicate Check Requires Both Name AND Email Match~~ ✅ FIXED (2026-03-15)
- **File:** `convex/employees.ts` (function: `add`)
- **Description:** Duplicate check previously matched on both email and name.
- **Fix Applied:** Now checks email only.

### [LOGIC-3] ~~`getHistoricalCheckins` Only Returns Check-ins With Notes~~ ✅ FIXED (2026-03-15)
- **File:** `convex/moodCheckins.ts` (function: `getHistoricalCheckins`)
- **Description:** Hard-coded filter for notes.
- **Fix Applied:** Added `notesOnly` parameter (defaults to `true` for backward compatibility).

### [LOGIC-4] Organization Name Used as Unique Identifier — STILL OPEN
- **Severity:** HIGH
- **File:** `convex/schema.ts`, `convex/organizationMemberships.ts`
- **Description:** The organization is identified by its name (a plain string), not by a generated ID. There is no dedicated `organizations` table. The `createOrganization` mutation checks for name uniqueness by querying `organizationMemberships`, but organization names are case-sensitive (no normalization). "Acme Corp" and "acme corp" would be treated as different organizations.
- **Impact:** Case-sensitive organization names could lead to duplicate organizations. Renaming an organization would require updating every record across employees, groups, moodCheckins, managerInvitations, accessRequests, and organizationMemberships tables. This is a fundamental data model design issue.

### [LOGIC-5] ~~`fixOrphanedInvitation` Bypasses Expiration Check~~ ✅ FIXED (2026-03-15)
- **File:** `convex/managerInvitations.ts` (function: `fixOrphanedInvitation`)
- **Description:** No expiration or status check before creating membership.
- **Fix Applied:** Now checks `expiresAt` and `status` before proceeding.

### [LOGIC-6] ~~`groups.remove` Hard-Deletes Group Members, Losing Historical Data~~ ✅ FIXED (2026-03-15)
- **File:** `convex/groups.ts` (function: `remove`)
- **Description:** Group members were hard-deleted on group removal.
- **Fix Applied:** Now soft-deletes with `removedAt`.

### [LOGIC-7] `acceptInvitation` Does Not Verify userId Matches Authenticated User — NEW
- **Severity:** HIGH
- **File:** `convex/managerInvitations.ts` (function: `acceptInvitation`, line 292)
- **Description:** The `acceptInvitation` mutation accepts `userId: v.id("users")` as a client-provided argument. It does NOT call `getAuthUserId(ctx)` to verify the authenticated user matches the passed `userId`. A malicious caller could pass any valid user ID to create an organization membership for a different user. In contrast, `acceptInvitationForExistingUser` correctly uses `getAuthUserId(ctx)`.
- **Impact:** An authenticated user could create organization memberships for arbitrary other users by providing their user IDs to this mutation.

### [LOGIC-8] `deleteAccount` Leaves Orphaned Organization Data — NEW
- **Severity:** MEDIUM
- **File:** `convex/users.ts` (function: `deleteAccount`, lines 63-105)
- **Description:** The `deleteAccount` mutation deletes the user record, organization memberships, password resets, and auth accounts. However, it does not clean up: (a) employees owned by organizations where this user was the sole owner, (b) groups in those organizations, (c) manager invitations created by this user, (d) access requests. If this user is the last owner of an organization, the organization becomes orphaned with no one able to manage it.
- **Impact:** Orphaned organizations with employees still receiving daily emails but no manager able to access the dashboard. Invitations created by the deleted user remain active.

---

## Best Practice Violations

### [BP-1] ~~Use of `filter()` in Convex Queries~~ ✅ FIXED (2026-03-15)
- **File:** Multiple files
- **Description:** `.filter()` replaced with index-based queries and JS filtering.

### [BP-2] `employees.listAll` Performs Full Table Scan — STILL OPEN
- **Severity:** HIGH
- **File:** `convex/employees.ts` (function: `listAll`, line 182)
- **Description:** The `listAll` internal query calls `ctx.db.query("employees").collect()` with no index, loading every employee record across all organizations into memory, then filtering out soft-deleted ones in JavaScript.
- **Impact:** As the application scales, this query (called by the daily email cron) will become increasingly expensive and could hit Convex query limits.

### [BP-3] ~~Missing `returns` Validator on Multiple Mutations~~ ✅ FIXED (2026-03-15)
- **File:** Multiple files
- **Description:** Missing validators added.

### [BP-4] Missing `"use node"` Directive on Action Files Using Node APIs — STILL OPEN
- **Severity:** MEDIUM
- **File:** `convex/managerInvitations.ts` (function: `sendInvitationEmail`), `convex/accessRequests.ts` (functions: `sendAccessRequestNotification`, `sendAccessRequestApprovalEmail`, `sendAccessRequestDeclineEmail`), `convex/passwordReset.ts` (function: `sendPasswordResetEmail`)
- **Description:** These files contain `internalAction` functions that use `process.env` but lack the `"use node"` directive at the top. Only `convex/passwordResetActions.ts` correctly uses `"use node"`. While `process.env` is available in Convex actions via the `convex/server` runtime, the explicit directive is best practice and makes the Node.js requirement explicit.
- **Impact:** These actions work currently because Convex provides `process.env` in both runtimes, but reliance on this without the directive is fragile. If the files ever use Node-specific APIs (Buffer, crypto, etc.), they will fail without the directive.

### [BP-5] Inline Email HTML Templates Mixed with Business Logic — STILL OPEN
- **Severity:** MEDIUM
- **File:** `convex/moodCheckins.ts`, `convex/managerInvitations.ts`, `convex/passwordReset.ts`, `convex/accessRequests.ts`
- **Description:** Large HTML email templates are embedded as template literals directly inside action handler functions. The mood check-in email template alone is ~50 lines of HTML (lines 1597-1648). The access request notification, approval, and decline emails each contain full HTML documents. Total inline HTML across all files exceeds 300 lines.
- **Impact:** Reduces readability, makes email templates difficult to maintain or test in isolation, and inflates function size. Changes to email styling require modifying business logic files.

### [BP-6] Missing `returns` Validator on Internal Queries/Mutations — NEW
- **Severity:** LOW
- **File:** `convex/passwordReset.ts` (function: `getAuthAccount`, line 165), `convex/passwordReset.ts` (function: `deleteAuthAccount`, line 196), `convex/passwordReset.ts` (function: `deleteUser`, line 206)
- **Description:** Several internal queries and mutations are missing `returns` validators. While not strictly required for internal functions, the project convention (per CLAUDE.md) is to include `args` and `returns` validators on all public and internal functions.
- **Impact:** Minor inconsistency with project conventions. No runtime impact.

### [BP-7] `authHelpers.ts` Exists But Is Not Used Anywhere — NEW
- **Severity:** MEDIUM
- **File:** `convex/authHelpers.ts`
- **Description:** The `requireOrgMembership` helper was extracted (ARCH-3 fix) but none of the existing Convex functions have been updated to use it. Every query and mutation still contains its own inline auth + membership check pattern. The helper exists but is dead code.
- **Impact:** The original goal of reducing boilerplate and ensuring consistent access control has not been achieved. The helper is available but brings no value until adopted.

---

## Architecture / Structure Concerns

### [ARCH-1] Organization State Managed via localStorage, Not URL or Server State — STILL OPEN
- **Severity:** HIGH
- **File:** `app/manager/layout.tsx`, `app/manager/edit/page.tsx`, `app/manager/managers/page.tsx`, `app/manager/view/page.tsx`, `app/select-organization/page.tsx`, `app/signin/page.tsx`
- **Description:** The selected organization is stored in `localStorage` and communicated between components via custom `window` events (`organizationChanged`) and `storage` events. Every manager page independently reads from localStorage and sets up event listeners. Confirmed present in at least 6 files.
- **Impact:** If localStorage is cleared or corrupted, the app enters an undefined state. URLs cannot be bookmarked or shared to show a specific organization's data. The organization selection logic is duplicated across many files.

### [ARCH-2] Massive File Size: `convex/moodCheckins.ts` — STILL OPEN
- **Severity:** HIGH
- **File:** `convex/moodCheckins.ts` (~1686 lines)
- **Description:** This file contains: query/mutation logic (12 exported functions), 21 check-in message templates, 7 follow-up message templates, 365 daily Bible verses, AI message generation via Gemini API, the email sending action, and two helper functions. The `DAILY_VERSES` array alone spans lines 935-1314 (379 lines). The `CHECKIN_MESSAGES` array spans lines 718-872 (154 lines).
- **Impact:** Extremely difficult to navigate, review, or maintain. Static data should be in separate data files. The AI generation logic and email sending should be in their own modules.

### [ARCH-3] ~~Duplicated Access Control Pattern~~ ✅ FIXED (partially, 2026-03-15)
- **File:** All Convex query/mutation files
- **Description:** `requireOrgMembership` helper extracted to `convex/authHelpers.ts`.
- **Note:** The helper exists but is not yet adopted by any existing function. See BP-7.

### [ARCH-4] ~~`manager-signup` Page is Dead Code~~ ✅ FIXED (2026-03-15)
- **File:** `app/manager-signup/page.tsx` (deleted)

### [ARCH-5] `groups.getMembers` Has No Authentication or Authorization Check — NEW
- **Severity:** HIGH
- **File:** `convex/groups.ts` (function: `getMembers`, lines 48-83)
- **Description:** The `getMembers` query accepts a `groupId` but does not call `getAuthUserId(ctx)` or verify organization membership. Any unauthenticated user who knows a valid group ID can retrieve the list of employees in that group, including their names and email addresses. Every other query in the codebase performs authentication and authorization checks.
- **Impact:** Information disclosure — employee names and emails in any group can be enumerated by unauthenticated callers.

---

## Code Style and Consistency

### [STYLE-1] Inconsistent Error Handling Patterns — STILL OPEN
- **Severity:** MEDIUM
- **File:** Multiple frontend pages
- **Description:** Some backend functions use `ConvexError` (e.g., `accessRequests.ts`), while others use plain `Error`. Frontend error handling varies: some pages check `msg.toLowerCase().includes("network")` for network errors (signin, mood-response, edit, reset-password), some do not. Error display varies between inline messages, modals, and toast-like banners.
- **Impact:** Inconsistent user experience when errors occur. The `ConvexError` vs `Error` split means the frontend has to handle both differently.

### [STYLE-2] ~~Duplicated Loading Spinner Component~~ ✅ FIXED (partially, 2026-03-15)
- **File:** Multiple frontend pages
- **Description:** `LoadingSpinner` component extracted and used in `app/page.tsx`, `app/mood-response/page.tsx`, `app/viewer/dashboard/page.tsx`, `app/request-access/page.tsx`, `app/manager/view/page.tsx`, `app/manager/managers/page.tsx`.
- **Remaining:** Inline three-dot bounce spinners still exist in: `app/manager/layout.tsx` (lines 122-132), `app/manager/account/page.tsx` (lines 106-116), `app/select-organization/page.tsx` (lines 73-83), `app/signin/page.tsx` (lines 485-491). These 4 files still use the copy-pasted pattern instead of the extracted component.

### [STYLE-3] Duplicated Background Pattern Markup — STILL OPEN
- **Severity:** LOW
- **File:** Nearly every page component
- **Description:** The same decorative background pattern (gradient, dot pattern via `radial-gradient`, decorative blobs with `blur-3xl`) is copy-pasted across most pages. Confirmed identical patterns in: `app/page.tsx`, `app/signin/page.tsx`, `app/manager/layout.tsx`, `app/reset-password/page.tsx`, `app/select-organization/page.tsx`, `app/request-access/page.tsx`, `app/invite/page.tsx`, `app/viewer/dashboard/page.tsx`.
- **Impact:** UI consistency changes require updating many files.

### [STYLE-4] Mixed Import Path Styles — STILL OPEN
- **Severity:** LOW
- **File:** Various frontend files
- **Description:** Some files use `@/components/ui/button` (path alias), while Convex imports use relative paths like `../../convex/_generated/api`. This is consistent within each category but the mix could be confusing.
- **Impact:** Minor consistency issue. Not a functional problem.

### [STYLE-5] Metadata Description is a Placeholder — NEW
- **Severity:** LOW
- **File:** `app/layout.tsx` (line 19)
- **Description:** The metadata description is set to `"My very first website"` which appears to be a placeholder from initial project scaffolding.
- **Impact:** This will appear in search engine results and social media previews. Should describe the actual application purpose.

---

## Global State Risks

### [STATE-1] localStorage as Global State for Organization Selection — STILL OPEN
- **Severity:** HIGH
- **File:** `app/manager/layout.tsx`, `app/manager/edit/page.tsx`, `app/manager/managers/page.tsx`, `app/manager/view/page.tsx`, `app/select-organization/page.tsx`, `app/signin/page.tsx`
- **Description:** `localStorage.getItem("selectedOrganization")` is used as the primary state source for the selected organization. Multiple components read and write to this key. Custom `window` events are dispatched to synchronize state, creating an ad-hoc pub/sub system outside React's state management.
- **Impact:** Fragile global state pattern. Race conditions possible if multiple tabs modify the selection simultaneously. There is no single source of truth within React's component tree. The `app/manager/view/page.tsx` file even signs out the user if the stored org doesn't match their membership (lines 68-83), which could trigger unexpectedly if localStorage is corrupted.

---

## Dependency Observations

### [DEP-1] ~~`@types/bcryptjs` in Production Dependencies~~ ✅ FIXED (2026-03-15)
- **File:** `package.json`
- **Description:** Moved to `devDependencies`.

### [DEP-2] ~~Unused `formData` State in `manager-signup/page.tsx`~~ ✅ FIXED (2026-03-15)
- **File:** `app/manager-signup/page.tsx` (deleted)

### [DEP-3] `ts-prune` Package in devDependencies — NEW
- **Severity:** LOW
- **File:** `package.json` (line 44)
- **Description:** `ts-prune` is listed in devDependencies but there is no npm script or configuration that uses it. It appears to be an installed-but-unused development tool.
- **Impact:** No functional impact. Slightly increases install time.

---

## Potential Bugs

### [BUG-1] ~~Mood Response Page Casts String to Convex ID Without Validation~~ ✅ FIXED (2026-03-14)
- **File:** `convex/moodCheckins.ts`
- **Description:** Fixed with try/catch around `ctx.db.get()` calls.

### [BUG-2] ~~`getTrends` and `getGroupTrends` Issue N+1 Queries per Day~~ ✅ FIXED (2026-03-15)
- **File:** `convex/moodCheckins.ts`
- **Description:** Now batch-fetches all check-ins via org index.

### [BUG-3] `getGroupTodayCheckins` Fetches All Org Check-ins Then Filters — STILL OPEN
- **Severity:** MEDIUM
- **File:** `convex/moodCheckins.ts` (function: `getGroupTodayCheckins`, lines 412-502)
- **Description:** The query fetches all check-ins for the entire organization for today and yesterday, then filters in JavaScript to only include employees in the specified group using `employeeIds.includes()`. Documented as acceptable given the data model (no index combining organisation+date+employeeId).
- **Impact:** Performance degradation proportional to organization size, not group size.

### [BUG-4] ~~`acceptInvitation` Missing Return Type Validator~~ ✅ FIXED (2026-03-15)
- **File:** `convex/managerInvitations.ts`
- **Description:** Added `returns` validator.

### [BUG-5] ~~Copyright Year Hardcoded to 2025~~ ✅ FIXED (2026-03-15)
- **File:** `app/page.tsx`
- **Description:** Now uses `new Date().getFullYear()`.

### [BUG-6] `getHistoricalCheckins` Still Uses N+1 Per-Day Queries — NEW
- **Severity:** MEDIUM
- **File:** `convex/moodCheckins.ts` (function: `getHistoricalCheckins`, lines 542-551)
- **Description:** While `getTrends` and `getGroupTrends` were refactored (BUG-2 fix) to batch-fetch check-ins, `getHistoricalCheckins` still uses `Promise.all` over individual per-day queries with `by_organisation_and_date`. For 30 days (default), this issues 30 separate queries. For large date ranges, this could hit Convex query budgets.
- **Impact:** For the default 30-day range, 30 queries are issued. This is less severe than the original BUG-2 (which could be 365 queries) but follows the same problematic pattern that was fixed in the trend functions.

### [BUG-7] `hasSubmittedToday` Query Passes String Directly to Index — NEW
- **Severity:** LOW
- **File:** `convex/moodCheckins.ts` (function: `hasSubmittedToday`, line 28)
- **Description:** The `hasSubmittedToday` query uses `employeeId: v.string()` in its args validator (to avoid crashes with invalid IDs), but at line 70 it passes `args.employeeId as Id<"employees">` directly to the `by_employee_and_date` index. While the `try/catch` around `ctx.db.get()` above protects against invalid IDs, the index query at line 70 is NOT wrapped in a try/catch and will throw if the cast is invalid. If `ctx.db.get()` happens to succeed (e.g., ID from a different table), the code proceeds to the index query which could fail.
- **Impact:** Edge case — if `ctx.db.get()` succeeds but the ID is not a valid employee ID, the subsequent index query could throw an unhandled error.

---

## Performance Concerns

### [PERF-1] ~~Daily Email Action Processes All Employees Sequentially with 500ms Delay~~ ✅ FIXED (partially, 2026-03-15)
- **Severity:** MEDIUM (was HIGH)
- **File:** `convex/moodCheckins.ts` (function: `sendDailyEmails`)
- **Description:** Delay reduced from 500ms to 200ms. For 1000 employees, this is now ~200 seconds (3.3 minutes). The 10-minute timeout is still a concern for approximately 3000+ employees. Additionally, each employee now also requires a `createCheckinToken` mutation call (line 1564), adding overhead per employee.
- **Impact:** The daily email action will time out for very large deployments.

### [PERF-2] Trend Calculations Load All Employees for Every Query — STILL OPEN
- **Severity:** MEDIUM
- **File:** `convex/moodCheckins.ts` (functions: `getTrends`, `getGroupTrends`)
- **Description:** Both `getTrends` (line 255) and `getGroupTrends` (lines 620-631) load all employees for the organization to calculate historical employee counts. `getGroupTrends` additionally fetches each employee individually via `Promise.all` over `employeeIds.map(id => ctx.db.get(id))`.
- **Impact:** Dashboard performance degrades linearly with organization size and the number of days requested.

### [PERF-3] ~~Gemini API Called Per Employee Without Caching~~ ✅ FIXED (2026-03-15)
- **File:** `convex/moodCheckins.ts`
- **Description:** AI messages now pre-generated per encouragement type and cached for reuse.

### [PERF-4] `getTrends` Loads ALL Organization Check-ins Into Memory — NEW
- **Severity:** MEDIUM
- **File:** `convex/moodCheckins.ts` (function: `getTrends`, lines 262-265)
- **Description:** The batch-fetch refactoring (BUG-2 fix) changed the N+1 pattern to a single fetch, but it now loads ALL check-ins for the organization into memory at once (line 262-265: `ctx.db.query("moodCheckins").withIndex("by_organisation"...).collect()`). For an organization with 100 employees over 2 years, this could be ~50,000+ records loaded into memory. The function only needs check-ins within the requested date range, but it fetches everything.
- **Impact:** Memory usage grows unboundedly with organization history. For long-running organizations, this could become a significant performance issue or hit Convex memory limits.

---

## Suggestions for Future Refactoring

1. **Adopt `requireOrgMembership` helper.** The helper exists in `convex/authHelpers.ts` but is unused. Migrating existing functions to use it would reduce boilerplate across all Convex functions and ensure consistent access control.

2. **Move organization selection to URL state.** Use URL search parameters or route segments (e.g., `/manager/[orgId]/view`) instead of localStorage. This would make organization selection shareable, bookmarkable, and eliminate the custom event synchronization pattern.

3. **Extract static data from `moodCheckins.ts`.** Move `CHECKIN_MESSAGES`, `FOLLOWUP_ENCOURAGEMENT_MESSAGES`, and `DAILY_VERSES` to separate data files (e.g., `convex/data/verses.ts`). Move `generateAIMessage` and `getFallbackMessage` to a separate utility module.

4. **Use `by_organisation_and_date` index with range queries.** Instead of loading all org check-ins and filtering by date in JS, use the composite index with date range bounds to only fetch relevant check-ins for `getTrends`, `getGroupTrends`, and `getHistoricalCheckins`.

5. **Add an `organizations` table.** Replace the string-based organization identifier with a proper table having an auto-generated ID. This would make organization renaming feasible and improve data integrity.

6. **Implement rate limiting on public endpoints.** The `getInvitationByToken` and `checkEmailExists` queries are unauthenticated and could be abused for brute-force enumeration.

7. **Add authentication to `groups.getMembers`.** This query exposes employee data without any auth check.

8. **Batch daily email sending.** Split the `sendDailyEmails` action into batches (e.g., per organization) using scheduled actions to avoid the 10-minute timeout limit.

9. **Complete the `LoadingSpinner` migration.** Four files still use inline spinner markup instead of the extracted component.

10. **Handle sole-owner deletion gracefully.** The `deleteAccount` mutation should either prevent deletion when the user is the sole owner of an organization, or cascade the cleanup properly.

---

## Review Notes

- The `app/manager/view/page.tsx` file is large (~55KB). The review is based on the first ~100 lines and the patterns observed. The org-selection and auth logic at the top follows the same localStorage pattern as other manager pages.
- The `app/accept-invitation/page.tsx` file is large (~52KB). Review is based on the persisted output summary and the first ~35 lines. It follows the same invitation flow patterns seen in the backend.
- The `convex/moodCheckins.ts` file was read in multiple chunks across its full ~1686 lines.
- The `proxy.ts` file correctly exports `convexAuthNextjsMiddleware()` as a default export, compatible with the expected pattern. No `middleware.ts` file exists at the project root.
- The cron schedule discrepancy noted in the previous review (code said 2pm UTC but CLAUDE.md said 1pm UTC) has been resolved. The cron expression is now `0 13 * * 1-5` (1pm UTC = 3pm SAST), matching the CLAUDE.md documentation.
- The `app/invite/page.tsx` was not listed in the original review scope but was found and reviewed. It serves as the entry point for shareable invitation links.
- Several UI component files in `components/ui/` (button, input, sidebar, etc.) were not reviewed in detail as they appear to be standard Radix UI/shadcn component wrappers.
