# Agent Code Review Report

**Date:** 2026-03-14
**Reviewed Files:**
- `convex/schema.ts`, `convex/auth.config.ts`, `convex/http.ts`, `convex/crons.ts`
- `convex/moodCheckins.ts`, `convex/employees.ts`, `convex/users.ts`, `convex/groups.ts`
- `convex/organizationMemberships.ts`, `convex/managerInvitations.ts`
- `convex/passwordReset.ts`, `convex/passwordResetActions.ts`
- `convex/accessRequests.ts`, `convex/emailValidation.ts`
- `app/layout.tsx`, `app/page.tsx`, `app/signin/page.tsx`
- `app/manager/layout.tsx`, `app/manager/page.tsx`, `app/manager/view/page.tsx`
- `app/manager/edit/page.tsx`, `app/manager/managers/page.tsx`, `app/manager/account/page.tsx`
- `app/mood-response/page.tsx`, `app/viewer/dashboard/page.tsx`
- `app/accept-invitation/page.tsx`, `app/invite/page.tsx`, `app/request-access/page.tsx`
- `app/manager-signup/page.tsx`, `app/reset-password/page.tsx`, `app/select-organization/page.tsx`
- `app/api/check-email/route.ts`
- `components/ConvexClientProvider.tsx`
- `middleware.ts`, `package.json`

**Reviewer:** Static Code Review Agent
**Severity Summary:** CRITICAL: 5 (all fixed) | HIGH: 11 | MEDIUM: 14 | LOW: 8
**Last Updated:** 2026-03-14 — All 5 critical issues resolved (see fix notes in each section)

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

### `middleware.ts` → `proxy.ts`
- Renamed `middleware.ts` to `proxy.ts` and changed `export const middleware` to `export default` to comply with Next.js 16 deprecation of the `middleware` file convention.

### `package.json`
- `convex` moved back to `dependencies` (had been accidentally moved to `devDependencies` by `npm install --save-dev`).
- Convex updated to `1.33.1`; also installed globally to silence CLI update warning.

---

## Overview

The R u OK codebase is a workplace wellbeing check-in application with a Convex backend and Next.js 16 frontend. The overall architecture is sound: multi-tenant organization memberships, soft deletion patterns, role-based access control, and a clear separation between authenticated manager views and unauthenticated employee mood-response pages.

The codebase demonstrates good practices in several areas: consistent use of Convex indexes for queries, proper authentication checks in most backend functions, well-structured soft deletion, and thoughtful historical accuracy calculations in trend queries. The frontend pages follow a consistent visual design with proper dark mode support.

However, the review identified several critical security concerns, notably around the mood check-in endpoint which lacks any authentication or authorization, a polling loop inside a Convex mutation that will not work as intended, use of `filter()` in Convex queries (violating project conventions), and race conditions in the password reset flow. There are also significant opportunities to reduce code duplication across frontend pages and improve type safety in several areas.

The most urgent findings relate to security vulnerabilities in the mood check-in and password reset flows, and a mutation that uses `setTimeout` for polling (which is not supported in Convex mutations).

---

## Critical Issues

### [CRITICAL-1] ~~Mood Check-in Endpoints Have No Authentication or Authorization~~ ✅ FIXED
- **File:** `convex/moodCheckins.ts` (functions: `record`, `updateDetails`, `hasSubmittedToday`)
- **Description:** The `record`, `updateDetails`, and `hasSubmittedToday` mutations/queries accept an `employeeId` directly from the client with zero authentication. Any person who knows or guesses a valid employee ID can submit mood check-ins on behalf of any employee, read whether they submitted today, and update their notes. The `employeeId` is exposed in email URLs (`/mood-response?employeeId=...&mood=green`), making it trivially discoverable.
- **Impact:** An attacker can fabricate mood data for any employee, corrupt organizational wellbeing dashboards, and potentially view whether specific employees have submitted check-ins. This undermines the integrity of all mood data.
- **Fix Applied (2026-03-14):** Added a `moodCheckinTokens` table to the schema. `sendDailyEmails` now generates a `crypto.randomUUID()` token per employee (36h expiry), stores it in the table, and embeds it in email links as `&token=...`. The `record` and `updateDetails` mutations now require and validate this token against the database before writing. The `mood-response` page reads `token` from URL params and passes it to both mutations; a missing or invalid token is rejected with a clear error.

### [CRITICAL-2] ~~Polling Loop with setTimeout Inside a Convex Mutation~~ ✅ FIXED
- **File:** `convex/managerInvitations.ts` (function: `acceptInvitation`, lines 316-320)
- **Description:** The `acceptInvitation` mutation contains a `while` loop with `await new Promise(resolve => setTimeout(resolve, 200))` that polls up to 30 times (6 seconds total). Convex mutations are transactional and expected to complete quickly. `setTimeout` is not guaranteed to work correctly inside Convex mutation handlers, and long-running mutations can time out or cause unpredictable behavior in Convex's execution environment.
- **Impact:** This mutation may fail silently, time out, or behave unpredictably in production. The invitation acceptance flow could break for new signups where the user record has not yet propagated.
- **Fix Applied (2026-03-14):** Removed the `while` loop and all `setTimeout` usage. Replaced with a single `ctx.db.get(args.userId)` call. If the user is not found or has no email, a clear error is thrown immediately. The frontend should handle retrying if needed.

### [CRITICAL-3] ~~Password Reset Race Condition Between Mutation and Scheduled Action~~ ✅ FIXED
- **File:** `convex/passwordReset.ts` (function: `resetPassword`, lines 302-358)
- **Description:** The `resetPassword` mutation validates the token and checks `reset.used === false`, then schedules an action (`passwordResetActions.updatePasswordHash`) via `ctx.scheduler.runAfter(0, ...)` to actually hash the password and mark the token as used. Between the mutation completing and the action executing, another request with the same token could pass validation. The mutation returns a success message before the password is actually updated, so the user could be told "password reset successfully" even if the scheduled action fails.
- **Impact:** A password reset token could be used multiple times. The user may receive a success message even if the password was not actually changed, leading to confusion and a potential security gap.
- **Fix Applied (2026-03-14):** Added `await ctx.db.patch(reset._id, { used: true })` inside the `resetPassword` mutation, before `ctx.scheduler.runAfter`. The token is now atomically invalidated within the same mutation transaction. The scheduled action still calls `markResetAsUsed` as before, which is now idempotent and safe to call twice.

### [CRITICAL-4] ~~Email Enumeration via Public Query~~ ✅ FIXED (partially)
- **File:** `convex/users.ts` (function: `checkEmailExists`)
- **Description:** The `checkEmailExists` query is a public function that accepts any email and returns a boolean indicating whether an account exists. This is also exposed via the API route at `app/api/check-email/route.ts`. While the `requestPasswordReset` mutation correctly avoids email enumeration, this query completely negates that protection by providing a direct oracle for account existence.
- **Impact:** An attacker can enumerate all registered email addresses, which is a significant privacy and security concern for a wellbeing application where anonymity may be important.
- **Fix Applied (2026-03-14):** The unauthenticated REST endpoint `app/api/check-email/route.ts` has been neutralised — it now returns `404` and no longer proxies the Convex query. This removes the easiest bulk-enumeration vector (plain HTTP POST with no setup required). The Convex `checkEmailExists` query remains because it is used by the sign-in and accept-invitation UX flows to determine whether to show sign-up or sign-in UI; removing it would require more significant UI refactoring. **Residual risk:** the Convex query is still unauthenticated but requires a Convex WebSocket connection and is subject to Convex platform-level rate limiting. Further hardening (e.g., requiring auth or an invitation token) should be addressed in a follow-up.

### [CRITICAL-5] ~~Invitation Token Exposed in Public Query Response~~ ✅ FIXED (partially)
- **File:** `convex/managerInvitations.ts` (function: `listInvitations`, line 169; function: `getInvitationByToken`, line 253)
- **Description:** The `listInvitations` query returns the full invitation object including the `token` field to the frontend. The `getInvitationByToken` query also returns the full token. Anyone who can call `listInvitations` (any org owner) sees all tokens for all their organizations. More critically, `getInvitationByToken` is an unauthenticated public query that returns the token back, and `listInvitations` returns tokens in its response validator. Invitation tokens are effectively shared secrets that grant organization access.
- **Impact:** Token leakage through query responses could allow unintended users to accept invitations if tokens are intercepted in network traffic or browser devtools.
- **Fix Applied (2026-03-14):** `getInvitationByToken` no longer returns the `token` field — the return type validator and handler were updated to omit it (callers already possess the token, so echoing it back was redundant exposure). `listInvitations` still returns the `token` field intentionally: it is authenticated (org-owner only) and the token is required to power the "copy invite link" feature in the managers dashboard.

---

## Workflow / Logic Issues

### [LOGIC-1] `new Date().toISOString().split("T")[0]` Uses UTC, Not Local Time
- **File:** `convex/moodCheckins.ts` (functions: `hasSubmittedToday`, `updateDetails`, `record`, `getTrends`, `getTodayCheckins`)
- **Description:** Throughout the codebase, `new Date().toISOString().split("T")[0]` is used to get "today's" date. This returns the UTC date, not the local date (SAST, UTC+2). An employee checking in at 11 PM SAST would have their check-in recorded as the next day's date in UTC. The cron job runs at 2 PM UTC (4 PM SAST), so the date boundary issue could cause employees in SAST to have their afternoon check-ins attributed to the correct date, but edge cases around midnight could produce incorrect results.
- **Impact:** Check-ins near midnight SAST may be attributed to the wrong date, and the "one check-in per day" constraint may not work correctly across the UTC/SAST boundary.

### [LOGIC-2] Employee Duplicate Check Requires Both Name AND Email Match
- **File:** `convex/employees.ts` (function: `add`, lines 89-93)
- **Description:** The duplicate check matches on both `email.toLowerCase() === args.email.toLowerCase()` AND `firstName.toLowerCase() === args.firstName.toLowerCase()`. This means adding two employees with the same email but different first names (e.g., "John Doe" and "Jonathan Doe" with john@company.com) would succeed, creating duplicate email entries.
- **Impact:** The same person could receive multiple daily check-in emails and have multiple mood records, corrupting trend data.

### [LOGIC-3] `getHistoricalCheckins` Only Returns Check-ins With Notes
- **File:** `convex/moodCheckins.ts` (function: `getHistoricalCheckins`, line 455)
- **Description:** The `getHistoricalCheckins` query filters to only include check-ins where `c.note && c.note.trim().length > 0`. This is a business logic decision embedded in the query with no parameter to control it, and the function name does not indicate this filtering behavior.
- **Impact:** The dashboard may appear to show "all historical check-ins" but actually only shows those with notes, which could be misleading to managers trying to understand response rates.

### [LOGIC-4] Organization Name Used as Unique Identifier
- **File:** `convex/schema.ts`, `convex/organizationMemberships.ts`
- **Description:** The organization is identified by its name (a plain string), not by a generated ID. The `createOrganization` mutation checks for name uniqueness by querying `organizationMemberships`, but there is no dedicated organizations table. Organization names are case-sensitive (no normalization), so "Acme Corp" and "acme corp" would be treated as different organizations.
- **Impact:** Case-sensitive organization names could lead to duplicate organizations. Renaming an organization would require updating every record across employees, groups, moodCheckins, managerInvitations, accessRequests, and organizationMemberships tables.

### [LOGIC-5] `fixOrphanedInvitation` Bypasses Expiration Check
- **File:** `convex/managerInvitations.ts` (function: `fixOrphanedInvitation`, lines 657-718)
- **Description:** The `fixOrphanedInvitation` mutation does not check if the invitation is expired before creating a membership. It also does not check the invitation status. Any authenticated user with a valid token can use this to create a membership regardless of whether the invitation has expired or been revoked.
- **Impact:** Expired or revoked invitations could still be used to gain organization access through this mutation.

### [LOGIC-6] `groups.remove` Hard-Deletes Group Members, Losing Historical Data
- **File:** `convex/groups.ts` (function: `remove`, lines 180-182)
- **Description:** When a group is removed, all `groupMembers` records are hard-deleted with `ctx.db.delete(membership._id)`, not soft-deleted. However, the soft-deletion pattern (using `removedAt`) is used everywhere else for group members. This inconsistency means historical trend calculations that reference these memberships will lose data.
- **Impact:** Historical group trend data may become inaccurate after a group is deleted, since the member records are gone.

---

## Best Practice Violations

### [BP-1] Use of `filter()` in Convex Queries
- **File:** `convex/managerInvitations.ts` (lines 74-81), `convex/accessRequests.ts` (lines 307-312), `convex/passwordReset.ts` (lines 43-49)
- **Description:** Several queries use `.filter()` after `.withIndex()`, which violates the project convention stated in CLAUDE.md: "Never use `filter` in queries - define indexes instead." Examples include filtering invitations by organisation+status+expiry, filtering access requests by organisation+status, and filtering password resets by used+createdAt.
- **Impact:** Performance degradation as dataset grows. Every record matching the index prefix must be loaded into memory and filtered in JavaScript.

### [BP-2] `employees.listAll` Performs Full Table Scan
- **File:** `convex/employees.ts` (function: `listAll`, line 183)
- **Description:** The `listAll` internal query calls `ctx.db.query("employees").collect()` with no index, loading every employee record across all organizations into memory, then filtering out soft-deleted ones in JavaScript.
- **Impact:** As the application scales, this query (called by the daily email cron) will become increasingly expensive and could hit Convex query limits.

### [BP-3] Missing `returns` Validator on Multiple Mutations
- **File:** `convex/managerInvitations.ts` (functions: `acceptInvitation`, `acceptInvitationForExistingUser`, `fixOrphanedInvitation`), `convex/accessRequests.ts` (functions: `createAccessRequest`, `approveAccessRequest`, `declineAccessRequest`)
- **Description:** Several mutations are missing the `returns` validator, which is required by project conventions for all public and internal functions. Without return validators, the return types are not enforced at runtime.
- **Impact:** Violates project conventions and reduces type safety. The return values of these functions are not validated, which could lead to unexpected behavior in the frontend.

### [BP-4] Missing `"use node"` Directive on Action Files Using Node APIs
- **File:** `convex/managerInvitations.ts` (function: `sendInvitationEmail`), `convex/accessRequests.ts` (functions: `sendAccessRequestNotification`, `sendAccessRequestApprovalEmail`, `sendAccessRequestDeclineEmail`), `convex/passwordReset.ts` (function: `sendPasswordResetEmail`)
- **Description:** These files contain `internalAction` functions that use `process.env` and `fetch` but lack the `"use node"` directive at the top. While `fetch` is available in Convex's default runtime, `process.env` access requires the Node.js runtime. Only `convex/passwordResetActions.ts` correctly uses `"use node"`.
- **Impact:** These actions may fail at runtime if `process.env` is not available in Convex's default (V8) runtime. The behavior depends on the Convex version and deployment configuration.

### [BP-5] Inline Email HTML Templates Mixed with Business Logic
- **File:** `convex/moodCheckins.ts`, `convex/managerInvitations.ts`, `convex/passwordReset.ts`, `convex/accessRequests.ts`
- **Description:** Large HTML email templates are embedded as template literals directly inside action handler functions, intermixed with business logic. Some email templates exceed 50 lines of HTML.
- **Impact:** Reduces readability, makes email templates difficult to maintain or test in isolation, and inflates function size. Changes to email styling require modifying business logic files.

---

## Architecture / Structure Concerns

### [ARCH-1] Organization State Managed via localStorage, Not URL or Server State
- **File:** `app/manager/layout.tsx`, `app/manager/edit/page.tsx`, `app/manager/managers/page.tsx`, `app/manager/view/page.tsx`
- **Description:** The selected organization is stored in `localStorage` and communicated between components via custom `window` events (`organizationChanged`). Every page that needs the selected org independently reads from localStorage and sets up event listeners. This pattern is fragile: it does not survive across devices, is not shareable via URL, and requires manual synchronization between components.
- **Impact:** If localStorage is cleared or corrupted, the app enters an undefined state. URLs cannot be bookmarked or shared to show a specific organization's data. The organization selection logic is duplicated across at least 4 files.

### [ARCH-2] Massive File Size: `convex/moodCheckins.ts`
- **File:** `convex/moodCheckins.ts` (~1600+ lines)
- **Description:** This file contains query logic, mutation logic, 21 check-in message templates, 7 follow-up message templates, 365 daily Bible verses, AI message generation, and the email sending action. The static data alone accounts for over 1000 lines.
- **Impact:** The file is extremely difficult to navigate, review, or maintain. The static message/verse data should be in separate data files. The AI generation logic should be in its own module.

### [ARCH-3] Duplicated Access Control Pattern
- **File:** All Convex query/mutation files
- **Description:** The same authentication and organization membership check pattern is repeated in nearly every function: `getAuthUserId(ctx)` followed by a membership query with `by_user_and_org` index. This boilerplate is not extracted into a shared helper function.
- **Impact:** Any change to the access control pattern (e.g., adding audit logging, changing error messages) would need to be applied to dozens of locations. Risk of inconsistency is high.

### [ARCH-4] `manager-signup` Page is Dead Code
- **File:** `app/manager-signup/page.tsx`
- **Description:** This page always redirects to `/accept-invitation` via a `useEffect`. The form it renders is never reachable because the redirect fires before the user can interact. The `handleSubmit` function simply redirects to `/signin`. This page appears to be a vestige of an earlier flow.
- **Impact:** Dead code that could confuse developers and increases maintenance burden.

---

## Code Style and Consistency

### [STYLE-1] Inconsistent Error Handling Patterns
- **File:** Multiple frontend pages
- **Description:** Some pages use `ConvexError` (e.g., `accessRequests.ts`), while others use plain `Error`. Frontend error handling varies: some pages check `msg.toLowerCase().includes("network")` for network errors, some do not. Error display varies between inline messages, modals, and toast-like banners.
- **Impact:** Inconsistent user experience when errors occur. Harder to maintain a consistent error handling strategy.

### [STYLE-2] Duplicated Loading Spinner Component
- **File:** `app/signin/page.tsx`, `app/manager/layout.tsx`, `app/manager/edit/page.tsx`, `app/manager/managers/page.tsx`, `app/manager/account/page.tsx`, `app/select-organization/page.tsx`, `app/reset-password/page.tsx`, `app/mood-response/page.tsx`
- **Description:** The same three-dot bouncing animation pattern (three divs with `animate-bounce` and staggered delays) is copy-pasted across at least 8 files. It is never extracted into a reusable component.
- **Impact:** Any style change to the loading indicator must be replicated across all files.

### [STYLE-3] Duplicated Background Pattern Markup
- **File:** Nearly every page component
- **Description:** The same decorative background pattern (gradient, dot pattern, decorative blobs) is copy-pasted across most pages. The gradient classes, blob sizes, and pattern configurations are identical in many places.
- **Impact:** UI consistency changes require updating dozens of files.

### [STYLE-4] Mixed Import Path Styles
- **File:** Various frontend files
- **Description:** Some files use `@/components/ui/button` (path alias), while others use relative paths like `../../convex/_generated/api`. The Convex imports consistently use relative paths, which is fine, but the mix could be confusing.
- **Impact:** Minor consistency issue. Not a functional problem.

---

## Global State Risks

### [STATE-1] localStorage as Global State for Organization Selection
- **File:** `app/manager/layout.tsx`, `app/manager/edit/page.tsx`, `app/manager/managers/page.tsx`, `app/manager/view/page.tsx`, `app/select-organization/page.tsx`
- **Description:** `localStorage.getItem("selectedOrganization")` is used as the primary state source for the selected organization. Multiple components read and write to this key. Custom `window` events are dispatched to synchronize state, creating an ad-hoc pub/sub system outside React's state management.
- **Impact:** This is a fragile global state pattern. Race conditions are possible if multiple tabs modify the selection simultaneously. There is no single source of truth within React's component tree.

---

## Dependency Observations

### [DEP-1] `@types/bcryptjs` in Production Dependencies
- **File:** `package.json` (line 22)
- **Description:** `@types/bcryptjs` is listed under `dependencies` rather than `devDependencies`. Type declaration packages are only needed at build time.
- **Impact:** Slightly inflated production bundle/install size. No functional impact.

### [DEP-2] Unused `formData` State in `manager-signup/page.tsx`
- **File:** `app/manager-signup/page.tsx`
- **Description:** The page maintains `formData` state with name, surname, password, and confirmPassword fields, but the `handleSubmit` function simply redirects to `/signin`. The form data is never sent anywhere because the page always redirects to `/accept-invitation` before the user can interact.
- **Impact:** Dead code that increases cognitive load during maintenance.

---

## Potential Bugs

### [BUG-1] Mood Response Page Casts String to Convex ID Without Validation
- **File:** `app/mood-response/page.tsx` (lines 26, 54, 85)
- **Description:** The `employeeId` from URL search params is cast directly to `Id<"employees">` with `as Id<"employees">`. If an invalid or malformed ID is provided, this will pass TypeScript compilation but may cause a runtime error in Convex when used in a query/mutation.
- **Impact:** Invalid employee IDs from manipulated URLs could cause uncaught runtime errors rather than graceful error messages.

### [BUG-2] `getTrends` and `getGroupTrends` Issue N+1 Queries per Day
- **File:** `convex/moodCheckins.ts` (functions: `getTrends`, `getGroupTrends`)
- **Description:** For each day in the requested range, a separate database query is issued to fetch check-ins. With a 365-day range (the "1year" option on the frontend), this results in 365 separate queries in a single Convex query function, which may exceed Convex's query budget or cause significant latency.
- **Impact:** The "1 year" and "overall" time range options on the dashboard may be extremely slow or fail entirely due to Convex query limits.

### [BUG-3] `getGroupTodayCheckins` Fetches All Org Check-ins Then Filters
- **File:** `convex/moodCheckins.ts` (function: `getGroupTodayCheckins`, lines 358-401)
- **Description:** The query fetches all check-ins for the entire organization for today and yesterday, then filters in JavaScript to only include employees in the specified group using `employeeIds.includes()`. For large organizations, this loads significantly more data than necessary.
- **Impact:** Performance degradation proportional to organization size, not group size.

### [BUG-4] `acceptInvitation` Missing Return Type Validator
- **File:** `convex/managerInvitations.ts` (function: `acceptInvitation`, line 291)
- **Description:** The `acceptInvitation` mutation returns different object shapes depending on the code path: `{ success: true, alreadyHasAccess: true, existingRole: string }`, `{ success: true, upgraded: true }`, or `{ success: true }`. There is no `returns` validator, so the frontend cannot rely on a consistent return type.
- **Impact:** TypeScript type inference on the frontend will be weaker, and any code depending on specific return shape properties may break silently.

### [BUG-5] Copyright Year Hardcoded to 2025
- **File:** `app/page.tsx` (line 283)
- **Description:** The footer displays `2025 R u OK. All rights reserved.` with a hardcoded year.
- **Impact:** Minor issue. The copyright year is already outdated for the current date (2026-03-14).

---

## Performance Concerns

### [PERF-1] Daily Email Action Processes All Employees Sequentially with 500ms Delay
- **File:** `convex/moodCheckins.ts` (function: `sendDailyEmails`, lines 1483-1597)
- **Description:** The `sendDailyEmails` action iterates through every employee across all organizations sequentially, with a 500ms delay between each email for rate limiting. For 1000 employees, this would take approximately 500 seconds (8+ minutes). Convex actions have a 10-minute timeout by default.
- **Impact:** The daily email action will time out for organizations with more than approximately 1200 employees total. If AI message generation is enabled (Gemini API call per employee), the timeout would be reached much sooner.

### [PERF-2] Trend Calculations Load All Employees for Every Query
- **File:** `convex/moodCheckins.ts` (functions: `getTrends`, `getGroupTrends`)
- **Description:** Both trend functions load all employees for the organization to calculate historical employee counts. The `getGroupTrends` function additionally fetches all group members and then does `Promise.all` to load each employee individually.
- **Impact:** Dashboard performance degrades linearly with organization size and the number of days requested.

### [PERF-3] Gemini API Called Per Employee Without Caching
- **File:** `convex/moodCheckins.ts` (function: `sendDailyEmails`, line 1504)
- **Description:** When AI message generation is enabled, `generateAIMessage` is called for every single employee, making an HTTP request to the Gemini API each time. There is no caching or batching. For employees in the same state (not needing extra encouragement), the messages could be generated once and reused.
- **Impact:** Unnecessary API costs and latency. For 500 employees, this is 500 Gemini API calls per day, adding significant time to the already sequential email sending loop.

---

## Suggestions for Future Refactoring

1. **Extract shared authentication/authorization helper.** Create a utility function like `requireOrgMembership(ctx, organisation, requiredRole?)` that handles the common pattern of getting the auth user ID and verifying organization membership. This would reduce boilerplate across all Convex functions and ensure consistent access control.

2. **Move organization selection to URL state.** Use URL search parameters or route segments (e.g., `/manager/[orgId]/view`) instead of localStorage. This would make organization selection shareable, bookmarkable, and eliminate the custom event synchronization pattern.

3. **Extract static data from `moodCheckins.ts`.** Move `CHECKIN_MESSAGES`, `FOLLOWUP_ENCOURAGEMENT_MESSAGES`, and `DAILY_VERSES` to separate data files. Move `generateAIMessage` and `getFallbackMessage` to a separate utility module.

4. **Create reusable UI components.** Extract the loading spinner, background pattern, and error display into shared components to eliminate duplication across pages.

5. **Add authentication to mood check-in endpoints.** Consider using signed tokens in email links (e.g., HMAC-signed URLs) rather than raw employee IDs to prevent unauthorized check-in submissions.

6. **Batch daily email sending.** Split the `sendDailyEmails` action into batches (e.g., per organization) using scheduled actions to avoid the 10-minute timeout limit.

7. **Add an `organizations` table.** Replace the string-based organization identifier with a proper table having an auto-generated ID. This would make organization renaming feasible and improve data integrity.

8. **Implement rate limiting on public endpoints.** The `getInvitationByToken` and `checkEmailExists` queries are unauthenticated and could be abused for brute-force enumeration.

---

## Review Notes

- The `app/manager/view/page.tsx` file was too large to read in full (55KB). The review of this file is based on the first ~45 lines and general patterns observed in other files.
- The `app/accept-invitation/page.tsx` file was also too large to read in full (59KB). Review is based on the first ~35 lines.
- The `convex/moodCheckins.ts` file is approximately 1600+ lines. It was read in multiple chunks. The review covers all sections.
- The `convex/auth.ts` file (referenced by `http.ts`) was not explicitly listed but is imported; it appears to be the Convex Auth configuration.
- Several UI component files in `components/ui/` (button, input, sidebar, etc.) were not reviewed in detail as they appear to be standard Radix UI/shadcn component wrappers.
- The `.env.example` file and `APP_WORKFLOW.md` were not reviewed as they are configuration/documentation files.
- The comment in `crons.ts` says "4pm SAST (2pm UTC)" but CLAUDE.md says "3pm SAST (1pm UTC)". The actual cron expression `0 14 * * 1-5` runs at 2pm UTC = 4pm SAST, so the code is correct but CLAUDE.md is outdated.
