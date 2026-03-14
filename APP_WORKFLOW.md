# R u OK — App Workflow & Page-Level Best Practices

This document gives Claude (and developers) a complete mental model of the app: how data flows, how pages connect, and what to watch out for on every page.

---

## High-Level Architecture

```
[Cron Job] ──sends emails──► [Employee Email Inbox]
                                      │
                                      ▼ (clicks mood link)
[mood-response] ──records mood──► [Convex DB]
                                      │
                                      ▼ (manager logs in)
[signin] ──auth──► [manager/layout] ──► [manager/view] (dashboard)
                         │
                         ├──► [manager/edit]     (employees & groups)
                         ├──► [manager/managers] (access control)
                         └──► [manager/account]  (profile settings)
```

---

## Full User Journey Flows

### Flow 1: New Manager Onboarding
1. Receives invitation email → `/accept-invitation?token=X`
2. Creates account (or signs in if existing user)
3. Membership created in `organizationMemberships`
4. Redirected to `/manager/view`

### Flow 2: Existing User Invited
1. Receives email → `/accept-invitation?token=X`
2. Already signed in → `acceptInvitationForExistingUser` called
3. Role upgraded if invitation role is higher
4. Redirected to `/manager/view`

### Flow 3: Link Invitation (Access Request)
1. Owner shares link → `/invite?token=X`
2. User enters email → checks if email-specific or link invitation
3. Link invite → `/request-access?invitationId=X&email=Y`
4. Access request created → owners notified via email
5. Owner approves in `/manager/managers` → membership created
6. Requestor receives approval email → signs in

### Flow 4: Daily Employee Mood Check-in
1. Cron fires at 14:00 UTC (16:00 SAST) Mon–Fri
2. `internal.moodCheckins.sendDailyEmails` emails all active employees
3. Employee clicks green/amber/red link in email
4. Lands on `/mood-response?employeeId=X&mood=Y`
5. Mood auto-recorded; employee can add note, toggle anonymity
6. Page closes or shows "already submitted" if duplicate

### Flow 5: Password Reset
1. User on `/signin` clicks "Forgot Password"
2. Email submitted → `api.passwordReset.requestPasswordReset` (rate-limited 5 min)
3. Email sent with link → `/reset-password?token=X`
4. Token verified (1-hour expiry, single-use)
5. New password set → redirected to `/signin` with success message

### Flow 6: Organization Selection (Multiple Orgs)
1. User has multiple memberships → `/select-organization`
2. Selects org → stored in `localStorage.selectedOrganization`
3. Redirected to `/manager/view`
4. Org switch in sidebar triggers `window` custom event to sync across tabs

---

## Page-by-Page Reference

---

### `/` — Landing Page
**File:** `app/page.tsx`
**Reads:** `useAuthActions`, Convex auth state
**Writes:** Nothing
**Links to:** `/signin`, `/manager/view` (auto-redirect if authenticated)

**What it does:**
- Unauthenticated: marketing page with features showcase and CTAs
- Authenticated without org: shows "Waiting for Access" message
- Authenticated with org: redirects to `/manager/view`

**Best Practices & Common Issues:**
- Always handle the loading/`undefined` auth state — flash of wrong UI is jarring
- "Waiting for Access" state must be distinct; users who create an org should see `/select-organization` or `/manager/view`, not this state
- Ensure the redirect to `/manager/view` only fires when `isAuthenticated` AND org exists — premature redirect breaks the "no org" state
- CTAs "Get Started" and "Sign In" should navigate identically to `/signin` — confirm both point there

---

### `/signin` — Sign In / Sign Up
**File:** `app/signin/page.tsx`
**Reads:** `api.users.checkEmailExists`, Convex auth state
**Writes:** Auth (via `signIn`), `api.passwordReset.requestPasswordReset`
**Links to:** `/manager/view` (on auth success), `/accept-invitation` (if token in URL), `/reset-password` (via email)

**What it does:**
- Single page handles: sign-in, sign-up, forgot-password
- Email check step determines if user exists → shows sign-in or sign-up form
- 60-second cooldown on password reset requests (client-side enforced)
- Detects sign-in errors to prevent wrong redirect

**Best Practices & Common Issues:**
- **Auth redirect race condition:** The `isAuthenticated` listener must ignore redirects when a sign-in error just occurred — currently guarded by `hasSignInError` flag; do not remove it
- **Invitation token preservation:** The `?token=X` param must survive all navigation steps; always append it to any redirect URL within this page
- **Password validation on signup:** 8-character minimum and match check must run before calling `signIn` — client-side only, no server enforcement
- **Forgot-password cooldown:** 60s is client-side only and resets on page refresh — consider server-side rate limiting (already done: 5-min rate limit in `passwordReset.ts`)
- **Loading state on email check:** Show spinner while `checkEmailExists` resolves — without it, form switches abruptly
- **Error messages:** Never reveal "email does not exist" — show generic errors to prevent enumeration
- **Password field autocomplete:** Use `autoComplete="current-password"` for sign-in and `"new-password"` for sign-up to prevent browser interference
- **Empty-state handling:** If `checkEmailExists` returns `undefined` (Convex loading), disable the continue button; do not assume false

---

### `/manager/layout` — Manager Shell
**File:** `app/manager/layout.tsx`
**Reads:** `api.organizationMemberships.getUserOrganizations`, `api.users.getCurrentUser`, Convex auth state
**Writes:** `localStorage.selectedOrganization` (on sign out: clears it)
**Links to:** All `/manager/*` routes, `/signin` (sign out)

**What it does:**
- Persistent sidebar with org selector and nav links
- Role-aware nav: "Edit Organization" hidden from viewers; "Viewer Access" only for owners
- Mobile: hamburger menu with sheet overlay
- Multi-org: dropdown/selector to switch between organizations
- Syncs org selection across tabs via `window` custom events

**Best Practices & Common Issues:**
- **Organization sync:** When `selectedOrganization` changes, always dispatch a custom window event — child pages subscribe to it. Missing this causes stale data in tabs
- **localStorage vs. state:** `localStorage` is not reactive; pair it with a state variable and custom event for cross-tab sync
- **Auth loading state:** Show a skeleton/loader while auth state is `undefined` — prevents flashing restricted content
- **Single-org shortcut:** If user has exactly one org, auto-select it silently — do not force them through a selector screen
- **Sign-out cleanup:** Clear `selectedOrganization` from localStorage on sign-out; stale org IDs cause silent failures on next login
- **Role check on navigation:** Editor nav items must re-verify role server-side (in Convex queries) — client-side role checks are UX-only and can be bypassed
- **Mobile sidebar close:** Close the mobile sheet after navigation — leaving it open on route change confuses users

---

### `/manager/view` — Main Dashboard
**File:** `app/manager/view/page.tsx`
**Reads:** `api.users.getCurrentUser`, various `api.moodCheckins.*`, `api.groups.*`, `api.employees.*`
**Writes:** Nothing (read-only)
**Links to:** Passive; no outbound navigation

**What it does:**
- Displays mood trends over time (1 week / 1 month / 1 year / overall)
- Breakdown by mood color (green/amber/red percentages)
- Group and employee filters
- Historical trend charts

**Best Practices & Common Issues:**
- **Time zone handling:** Mood dates are stored as `YYYY-MM-DD` strings — always compute "today" in the correct timezone (SAST); wrong timezone causes off-by-one day in trend data
- **Empty state:** When no check-ins exist for the period, show a friendly empty state — avoid blank charts or NaN percentages
- **Division by zero:** Percentage calculations must guard against zero denominators
- **Soft-deleted employee data:** Historical charts must include data from soft-deleted employees for accurate trend lines — use the historical accuracy logic from CLAUDE.md
- **Large datasets:** With many employees over "overall" range, queries can be slow — consider pagination or server-side aggregation
- **Filter state persistence:** User's selected time range and group filter should persist across page refreshes (localStorage or URL params) — losing it on refresh is annoying
- **Loading skeletons:** Each chart section should show a skeleton while Convex data loads — avoid layout shift
- **No check-ins today indicator:** Visually distinguish "no data yet today" from "employees aren't checking in" — the former is expected before 3pm SAST

---

### `/manager/edit` — Employee & Group Management
**File:** `app/manager/edit/page.tsx`
**Reads:** `api.employees.list`, `api.groups.list`, `api.groups.getMembers`
**Writes:** `api.employees.add`, `api.employees.remove`, `api.groups.add`, `api.groups.remove`, `api.groups.addMember`, `api.groups.removeMember`
**Links to:** No outbound navigation (modal-based flows)

**What it does:**
- Two-column layout: employees (left), groups (right)
- Add employees by first name + email
- Soft-delete employees (removes from all groups)
- Create, delete groups
- Add/remove employees from groups

**Best Practices & Common Issues:**
- **Duplicate email detection:** Backend does case-insensitive check — frontend should trim and lowercase before submitting to show faster feedback
- **Soft-delete confirmation:** Always show a confirmation modal before deleting an employee — deletion removes all group memberships and stops their mood emails; this is significant
- **Employee delete cascade:** When an employee is soft-deleted, `employees.remove` must also soft-delete all group memberships — verify this always runs atomically (it currently does via sequential patches)
- **Email format validation:** Validate email format client-side before calling `api.employees.add`; the backend checks duplicates but not format
- **Empty group state:** Groups with no members should show a clear "No members" message, not an empty list
- **Optimistic updates:** Convex subscriptions auto-refresh; avoid manual refetch calls that cause double updates
- **Role guard:** This page requires owner or editor role — verify server-side in every mutation; client-side nav hiding is not sufficient
- **Group deletion:** Deleting a group removes all memberships; warn the user of this consequence in the confirmation dialog
- **First name only:** Employees only have a `firstName` field — do not add a `lastName` input without updating the schema

---

### `/manager/managers` — Access Control
**File:** `app/manager/managers/page.tsx`
**Reads:** `api.managerInvitations.listInvitations`, `api.accessRequests.listAccessRequests`, `api.users.getOrganizationMembersWithDetails`
**Writes:** `api.managerInvitations.createInvitation`, `api.managerInvitations.revokeInvitation`, `api.accessRequests.approveAccessRequest`, `api.accessRequests.declineAccessRequest`, `api.organizationMemberships.removeOrganizationMember`
**Links to:** No outbound navigation

**What it does:**
- Invite users by email (single-use email invitation)
- Generate shareable link invitations (reusable until expiry)
- Review and action pending access requests
- View and revoke pending invitations
- View and remove active org members

**Best Practices & Common Issues:**
- **Owner-only page:** Every mutation must verify `role === 'owner'` server-side — this page should never be accessible to editors or viewers (also ensure nav hides it)
- **Last owner guard:** `removeOrganizationMember` prevents removing the last owner; surface this error clearly ("Cannot remove the only owner") rather than a generic error
- **Shareable link warning:** Always display a security warning that anyone with the link can request access — currently shown; never remove it
- **Invitation expiry display:** Show exact expiry date/time on pending invitations, not just "expires soon" — managers need to know when to re-invite
- **Revoke confirmation:** Require confirmation before revoking an invitation — accidental revoke interrupts the invitee's flow
- **Email invitation deduplication:** Calling `createInvitation` twice for the same email should be rejected server-side — it currently is; surface this to the user as "Invitation already pending for this email"
- **Access request email notifications:** Owners receive an email per access request — avoid notification spam by de-duplicating within a short window if the same email requests multiple times
- **Role display:** Show human-readable role labels ("Can Edit" / "View Only" / "Owner"), not raw enum values
- **Remove self:** Owners should not be able to remove themselves if they're the only owner — guard this both UI and server-side

---

### `/manager/account` — Account Settings
**File:** `app/manager/account/page.tsx`
**Reads:** `api.users.getCurrentUser`
**Writes:** `api.users.updateAccount`
**Links to:** No outbound navigation

**What it does:**
- Update name and surname
- View email (read-only — email changes not supported)
- View organization memberships and roles

**Best Practices & Common Issues:**
- **Save button guard:** Disable save until actual changes are made — prevents accidental no-op mutations
- **Email read-only clarity:** Clearly label email as non-editable; if a user tries to click it, consider a tooltip explaining why
- **Optimistic name update:** After saving, show a success state immediately — Convex will sync; avoid "saved" flickering after re-fetch
- **Name trimming:** Trim whitespace from name and surname before sending to backend — empty-space-only names cause display issues
- **Min length:** Enforce a minimum of 1 non-whitespace character for name fields
- **Org membership list:** If user has many orgs, this list can be long — cap with "show more" or scroll

---

### `/mood-response` — Employee Mood Submission
**File:** `app/mood-response/page.tsx`
**Reads:** `api.moodCheckins.hasSubmittedToday`
**Writes:** `api.moodCheckins.record`, `api.moodCheckins.updateDetails`
**Links to:** Closes window after submit (called from email)

**What it does:**
- Entry point from email links containing `?employeeId=X&mood=Y`
- Auto-records mood on page load (if not already submitted today)
- Shows form for optional note and anonymity toggle
- Displays emoji feedback matching mood
- Prevents duplicate submissions (one per day)

**Best Practices & Common Issues:**
- **Missing query params:** If `employeeId` or `mood` is absent/invalid, show a clear error — never silently fail or record undefined data
- **Duplicate submission UX:** "Already submitted today" must be clear and non-alarming — the employee did the right thing; don't make them feel they broke something
- **Auto-close reliability:** `window.close()` only works if the tab was opened by a script — many email clients open links in a new tab without `window.opener`; show a "You can close this tab" message as fallback
- **Anonymity toggle default:** Default `isAnonymous` to false — users should opt-in to anonymity, not opt-out
- **Note character limit:** Enforce a reasonable character limit on notes (e.g., 500 chars) client-side; no server enforcement currently
- **Mood validation:** Only accept `green`, `amber`, `red` — reject any other value in the URL with a clear error
- **No auth required:** This page intentionally has no auth — employees don't have accounts. Never add auth guards here
- **Date edge case:** Auto-record uses server-side date; if employee clicks a link from yesterday's email the day after, server will record today's date — this is correct behavior but may confuse users. Consider showing the recorded date.
- **Mobile optimization:** Emails are often opened on mobile; ensure the page is fully responsive with large tap targets for the note form

---

### `/accept-invitation` — Invitation Acceptance
**File:** `app/accept-invitation/page.tsx`
**Reads:** `api.managerInvitations.getInvitationByToken`, `api.users.checkEmailExists`
**Writes:** `api.managerInvitations.acceptInvitation` (new user), `api.managerInvitations.acceptInvitationForExistingUser` (existing user)
**Links to:** `/manager/view` (on success), `/signin` (if already has account)

**What it does:**
- Validates invitation token from URL
- If user not authenticated: shows sign-up or sign-in form depending on email existence
- If user authenticated: calls `acceptInvitationForExistingUser`
- Handles role upgrades for users who already belong to the org

**Best Practices & Common Issues:**
- **Token expiry display:** Show the expiration date prominently — if expired, do not show a sign-up form; show "contact your admin"
- **Email pre-fill:** For email-specific invitations, pre-fill and lock the email field — the invitation is tied to that email
- **Retry logic for user record:** `acceptInvitation` polls up to 30×200ms for the user record after signup — this is necessary because Convex Auth creates the user asynchronously. Do not remove this loop
- **Role upgrade silencing:** If the user already has a lower role and is being upgraded, show a success message that mentions the role change
- **Token one-time use:** After acceptance, the token is invalidated for email invitations. If user navigates back and tries again, show "invitation already used" — not a generic error
- **Network failure:** If the mutation fails, do not silently fail — show an error and allow retry
- **Link invitations:** For link-type invitations, redirect to `/invite?token=X` which handles the email-entry step — do not try to accept link invitations directly on this page

---

### `/invite` — Invitation Landing (Link Type)
**File:** `app/invite/page.tsx`
**Reads:** `api.managerInvitations.getInvitationByToken`
**Writes:** Nothing
**Links to:** `/accept-invitation` (email invites), `/request-access` (link invites)

**What it does:**
- Reads invitation token from URL
- Shows invitation details (org name, role)
- For email invitations: collect email → redirect to `/accept-invitation`
- For link invitations: collect email → redirect to `/request-access`

**Best Practices & Common Issues:**
- **Invalid token handling:** Show a clear "invalid or expired invitation" message — do not show an empty form
- **Token type branching:** Must correctly distinguish `email` vs `link` invitation type — wrong branch sends user through wrong flow
- **Email case normalization:** Lowercase and trim email before routing — mismatches cause "no invitation found" errors in downstream pages
- **No auth required:** This page must be accessible without authentication — invitation recipients may not have accounts

---

### `/request-access` — Access Request
**File:** `app/request-access/page.tsx`
**Reads:** Nothing (uses URL params)
**Writes:** `api.accessRequests.createAccessRequest`
**Links to:** `/signin` (after submission)

**What it does:**
- User requests access to an org via a shareable link
- Submits email + `invitationId` to create an access request
- Owners are notified by email; user is told to await approval
- Redirects to `/signin` with a "check your email" message

**Best Practices & Common Issues:**
- **Approval-required warning:** Display prominently that access is not automatic — users who expect instant access will be frustrated if this is not clear
- **Duplicate request prevention:** `createAccessRequest` blocks duplicate pending requests for the same email — surface this as "You already have a pending request" not a generic error
- **Existing user check:** If user already has access, redirect them to sign in rather than submitting a redundant request
- **Email validity:** Validate email format before calling the mutation
- **invitationId in URL:** If `invitationId` is missing from URL params, the page will fail — always validate URL params and show an error state

---

### `/reset-password` — Password Reset
**File:** `app/reset-password/page.tsx`
**Reads:** `api.passwordReset.verifyPasswordResetToken`
**Writes:** `api.passwordReset.resetPassword`
**Links to:** `/signin` (on success)

**What it does:**
- Validates token from URL (1-hour expiry, single-use)
- Shows email being reset (from token data)
- New password form with confirmation
- Redirects to `/signin` with "password reset successful" on completion

**Best Practices & Common Issues:**
- **Token verification on load:** Verify token immediately on mount — do not wait for form submission to discover the token is expired
- **Expiry UX:** If token is expired, show a link back to `/signin` to start the forgot-password flow again; never show a dead-end error
- **Single-use enforcement:** After successful reset, `markResetAsUsed` is called — if user navigates back and tries again, show "link already used"
- **Password requirements visible:** Show password requirements (8+ characters) before the user submits — not only after validation fails
- **Confirm password match:** Validate match client-side on blur, not only on submit
- **Bcrypt in Node runtime:** Password hashing uses `bcryptjs` via an internal action with `"use node"` — do not move this logic to a regular Convex mutation

---

### `/select-organization` — Organization Selector
**File:** `app/select-organization/page.tsx`
**Reads:** `api.organizationMemberships.getUserOrganizations`
**Writes:** `api.organizationMemberships.createOrganization`, `localStorage.selectedOrganization`
**Links to:** `/manager/view` (on selection)

**What it does:**
- Shown when user has multiple org memberships
- Auto-redirects to `/manager/view` if user has exactly one org
- Create new organization option
- Shows role per org

**Best Practices & Common Issues:**
- **Single-org auto-redirect:** Must check org count after data loads (not before) — `undefined` loading state must not trigger early redirect to `/manager/view`
- **New org name validation:** Minimum length, no leading/trailing spaces, unique check (backend enforces uniqueness)
- **Role badges:** Use same role labels as the rest of the app for consistency
- **No org state:** If user has zero orgs (possible if removed from all orgs), show "Create an organization" prominently — not an empty list

---

### `/viewer/dashboard` — Viewer Dashboard
**File:** `app/viewer/dashboard/page.tsx`
**Reads:** Auth state only
**Writes:** Nothing
**Links to:** `/manager/view` (redirect)

**What it does:**
- Simple redirect — viewers use the same dashboard as editors/owners
- Exists as a named route for role-based navigation

**Best Practices & Common Issues:**
- **Instant redirect:** Should redirect immediately without showing a blank screen — use `router.replace` not `router.push` so it's not in browser history
- **Viewer-only filtering:** The actual view in `/manager/view` must check the user's role and hide owner/editor controls — do not assume this page's redirect is sufficient access control

---

## Cross-Cutting Concerns

### Authentication State Machine
```
undefined (loading) → authenticated → has org → /manager/view
                                    → no org  → /select-organization
                   → unauthenticated         → /
```
Every page must handle all three auth states (`undefined`, `true`, `false`). Missing the `undefined` case causes flash-of-wrong-content.

### Organization ID Lifecycle
1. Stored in `localStorage.selectedOrganization`
2. Read by all `/manager/*` pages on mount
3. Passed as argument to all Convex queries/mutations
4. Updated via custom `window` event when changed in sidebar
5. Cleared on sign-out

**Risk:** If the stored org ID no longer exists (user removed from org), queries will silently return empty — add a fallback that detects this and redirects to `/select-organization`.

### Role Enforcement Pattern
- **Client:** Hide UI elements based on role (UX only)
- **Server:** Every Convex mutation verifies role before executing (security)
- Never rely solely on client-side role checks for security

### Soft Deletion Rules
- Never hard-delete employees or group memberships
- Always filter `deletedAt == null` and `removedAt == null` for active records
- Historical trend queries must include soft-deleted records for the relevant period

### Email System
All emails are sent via Resend API through Convex internal actions:
- `sendDailyEmails` — mood check-in reminders
- `sendInvitationEmail` — new manager invitations
- `sendPasswordResetEmail` — password reset links
- `sendAccessRequestNotification` — notifies owners of new requests
- `sendAccessRequestApprovalEmail` / `sendAccessRequestDeclineEmail`

**Risk:** If `RESEND_API_KEY` or `SITE_URL` env vars are missing, all email flows silently fail. Always verify these in production.

### Date Handling
- Mood check-in dates stored as `YYYY-MM-DD` strings
- Server computes the date — consistent across time zones
- "Today" comparisons must use the same timezone (UTC in Convex, SAST in UI display)
- Cron fires at 14:00 UTC = 16:00 SAST — do not adjust unless timezone changes

### Convex Query Patterns
- Never use `.filter()` in queries — define indexes in `schema.ts` instead
- Use `ctx.db.patch` for partial updates, `ctx.db.replace` for full replacement
- All public functions must have `args` and `returns` validators
- Internal functions use `internalQuery` / `internalMutation` / `internalAction`
- Never edit `convex/_generated/` — auto-generated on deploy

---

## Environment Variables Checklist

| Variable | Used By | Effect if Missing |
|---|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | Frontend | App fails to connect to Convex |
| `CONVEX_SITE_URL` | Convex Auth config | Auth broken |
| `RESEND_API_KEY` | All email actions | All emails silently fail |
| `SITE_URL` | Email links (mood, invite, reset) | Broken links in emails |

---

## Common Bugs to Watch For

1. **Auth loading flash** — Rendering auth-dependent UI before `isAuthenticated` resolves
2. **Missing org in query args** — Passing `undefined` org ID to Convex query returns empty, not an error
3. **Stale localStorage org** — User removed from org; stored org ID returns empty data silently
4. **window.close() no-op** — On mood-response page when tab wasn't opened by script
5. **Duplicate invitation emails** — Re-inviting same email should surface "already pending"
6. **Trend chart NaN** — Dividing check-ins by zero employees in empty periods
7. **Timezone mismatch** — Computing "today" in browser local time vs server UTC
8. **Role check bypass** — Missing server-side role verification on mutations
9. **Soft-delete not cascading** — Deleting employee without soft-deleting group memberships
10. **Retry loop infinite** — `acceptInvitation` polls 30 times; if Convex is down, this hangs UI for 6 seconds
