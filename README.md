# R u OK -- Workplace Wellbeing Platform

A workplace wellbeing check-in application that enables organizations to monitor and support their team's mental health through daily mood check-ins using a simple traffic-light system (green / amber / red).

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Architecture Overview](#architecture-overview)
  - [Multi-tenancy Model](#multi-tenancy-model)
  - [Authentication Flow](#authentication-flow)
  - [Mood Check-in Flow](#mood-check-in-flow)
- [Data Model](#data-model)
- [Directory Structure](#directory-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [1. Clone and Install](#1-clone-and-install)
  - [2. Environment Variables](#2-environment-variables)
  - [3. Convex Setup](#3-convex-setup)
  - [4. Run in Development](#4-run-in-development)
  - [5. Production Build and Deploy](#5-production-build-and-deploy)
- [Environment Variables Reference](#environment-variables-reference)
- [Convex Backend Reference](#convex-backend-reference)
  - [Function Conventions](#function-conventions)
  - [Tables and Indexes](#tables-and-indexes)
  - [Scheduled Jobs (Crons)](#scheduled-jobs-crons)
  - [HTTP Endpoints](#http-endpoints)
- [Frontend Routes Reference](#frontend-routes-reference)
- [Role and Permission System](#role-and-permission-system)
- [Email System](#email-system)
- [Key Business Rules](#key-business-rules)
- [Common Development Tasks](#common-development-tasks)
  - [Adding a New Convex Function](#adding-a-new-convex-function)
  - [Adding a New Page](#adding-a-new-page)
  - [Sending a New Email Type](#sending-a-new-email-type)
- [Deployment](#deployment)
  - [Convex](#convex)
  - [Next.js (Vercel Recommended)](#nextjs-vercel-recommended)
- [Troubleshooting](#troubleshooting)
- [Contributing and Code Style](#contributing-and-code-style)

---

## Overview

R u OK is a workplace wellbeing check-in platform designed for organizations that want to keep a pulse on their employees' mental health. The application operates on a simple daily cycle: at 3:00 PM SAST (1:00 PM UTC) every weekday, each registered employee receives an email containing three large buttons -- green ("I'm doing great!"), amber ("I'm okay"), and red ("I could use some support"). Clicking a button immediately records the employee's mood for the day. Employees can optionally add a note and choose whether to remain anonymous.

Managers access a dashboard that shows mood trends over time, recent check-ins, and the ability to filter by team groups. The system supports multiple organizations, with users able to belong to several organizations under different roles (owner, editor, viewer). Owners manage membership and invitations, editors manage employees and groups, and viewers have read-only access to the dashboard.

The application uses a multi-tenant architecture where organization membership is enforced on every backend query and mutation. Employees (the people who receive daily emails) are separate from users (managers who log in to the dashboard). Soft deletion is used throughout to preserve historical accuracy -- deleted employees and removed group members are retained in the database with timestamp markers, ensuring trend calculations remain correct even after personnel changes.

Check-in emails include personalized messages with rotating Bible verses and encouraging greetings. When the optional Gemini API key is configured, the system generates AI-powered personalized messages; otherwise it falls back to a curated set of 20+ message templates and 365 daily verses. Employees who previously responded "red" receive extra encouraging follow-up messages the next day.

---

## Tech Stack

| Technology | Version | Purpose |
|---|---|---|
| Next.js | ^16.0.7 | React framework with App Router |
| React | ^19.0.0 | UI library |
| TypeScript | ^5 | Type safety |
| Tailwind CSS | ^4 | Utility-first CSS framework |
| Convex | ^1.33.1 | Backend-as-a-service (database, serverless functions, real-time sync) |
| @convex-dev/auth | ^0.0.90 | Authentication (custom email/password) |
| Resend API | -- | Transactional email delivery |
| Google Gemini API | -- | Optional AI-generated check-in messages |
| bcryptjs | ^3.0.3 | Password hashing |
| Radix UI | Various | Accessible UI primitives (dialog, separator, slot, switch, tooltip) |
| Lucide React | ^0.553.0 | Icon library |
| class-variance-authority | ^0.7.1 | Component variant management |
| clsx + tailwind-merge | ^2.1.1 / ^3.4.0 | Conditional class merging |
| tw-animate-css | ^1.4.0 | Tailwind animation utilities |
| npm-run-all2 | ^5.0.0 | Parallel script runner (dev) |

---

## Architecture Overview

```
+---------------------+     +----------------------------------+
|                     |     |         Convex Backend            |
|   Next.js Frontend  |<--->|  +----------------------------+  |
|   (App Router)      |     |  |  Queries / Mutations        |  |
|                     |     |  |  (real-time subscriptions)   |  |
|   - React 19        |     |  +----------------------------+  |
|   - Tailwind v4     |     |  +----------------------------+  |
|   - Convex Client   |     |  |  Internal Actions           |  |
|                     |     |  |  (email sending, bcrypt)     |  |
+---------------------+     |  +----------------------------+  |
                            |  +----------------------------+  |
                            |  |  Cron Jobs                  |  |
                            |  |  (daily emails at 1pm UTC)  |  |
                            |  +----------------------------+  |
                            |  +----------------------------+  |
                            |  |  Convex Auth                |  |
                            |  |  (email/password)           |  |
                            |  +----------------------------+  |
                            |  +----------------------------+  |
                            |  |  Database (Document store)  |  |
                            |  +----------------------------+  |
                            +----------------------------------+
                                          |
                                          v
                            +----------------------------+
                            |     Resend API              |
                            |  (mood emails, invites,     |
                            |   password resets,           |
                            |   access request notices)    |
                            +----------------------------+
                                          |
                                          v
                            +----------------------------+
                            |  Google Gemini API          |
                            |  (optional: AI messages)    |
                            +----------------------------+
```

The frontend communicates with Convex via real-time WebSocket subscriptions for queries and RPC-style calls for mutations. All authentication is handled server-side by Convex Auth with `convexAuthNextjsMiddleware` in Next.js middleware. Email sending happens in Convex internal actions (which run in a Node.js environment).

### Multi-tenancy Model

Organizations are represented as string names, not as a dedicated table. When a user creates an organization, a record is inserted into `organizationMemberships` with the `owner` role. The organization "exists" as long as at least one membership references it.

Users can belong to multiple organizations with different roles. The active organization is tracked in the browser's `localStorage` under the key `selectedOrganization`. A custom `organizationChanged` DOM event is dispatched when the selection changes, allowing components to react in real time.

Access control is enforced on every Convex query and mutation by looking up the authenticated user's membership in `organizationMemberships` using the `by_user_and_org` index.

### Authentication Flow

**Sign Up:**
1. User visits `/signin?flow=signup` and enters name, surname, email, and password (minimum 8 characters).
2. Frontend checks if email already exists via `users.checkEmailExists` query.
3. `signIn("password", formData)` is called with `flow=signUp`, which creates a user record and auth account in Convex Auth.
4. On success, user is redirected to `/manager/view`. If they have no organization, they see a "Waiting for Access" message or can create one.

**Sign In:**
1. User visits `/signin` and enters email + password.
2. `signIn("password", formData)` with `flow=signIn` authenticates against Convex Auth.
3. On success, the first organization is auto-selected in localStorage, and the user is redirected to `/manager/view`.

**Password Reset:**
1. User clicks "Forgot password?" on the sign-in page, enters their email.
2. `passwordReset.requestPasswordReset` creates a token (expires in 1 hour), schedules email via Resend.
3. User clicks the link in the email, arriving at `/reset-password?token=...`.
4. `passwordReset.verifyPasswordResetToken` validates the token.
5. On form submit, `passwordReset.resetPassword` marks the token as used and schedules `passwordResetActions.updatePasswordHash` (a Node.js action that uses bcryptjs).
6. User is redirected to `/signin` after 2 seconds.

**Invitation Acceptance:**
1. Owner creates an invitation (email-based or shareable link) from `/manager/managers`.
2. Invitee receives an email or link pointing to `/accept-invitation?token=...`.
3. The page detects if the user already has an account:
   - **Existing user:** Calls `acceptInvitationForExistingUser` to add org membership.
   - **New user:** Shows signup form, creates account, then calls `acceptInvitation`.
4. For shareable (link) invitations, the user may be redirected to `/request-access` to submit an access request that requires owner approval.

**Session Duration:** Sessions expire after 24 hours (configured in `convex/auth.ts`).

### Mood Check-in Flow

1. **Cron job** (`convex/crons.ts`): Runs at `0 13 * * 1-5` (1:00 PM UTC / 3:00 PM SAST, Monday through Friday). Calls `internal.moodCheckins.sendDailyEmails`.

2. **Email generation** (`sendDailyEmails`): Iterates over all active (non-deleted) employees across all organizations. For each employee:
   - Generates a one-time check-in token (stored in `moodCheckinTokens`, expires in 36 hours).
   - Checks the employee's last mood -- if it was "red", uses a special encouraging message template.
   - If `GEMINI_API_KEY` is configured, uses cached AI-generated messages; otherwise uses static fallback messages from a pool of 20+ templates.
   - Selects a daily Bible verse (365 unique verses, one per day of the year, with per-employee hashing for variety).
   - Sends the email via Resend with three mood buttons (green/amber/red) linking to `/mood-response`.

3. **Employee clicks a mood button**: Opens `/mood-response?employeeId=...&mood=...&token=...`.
   - The page auto-saves the mood by calling `moodCheckins.record`.
   - The token is validated (must match employee, date, and not be expired).
   - Only one check-in per employee per day is allowed (`by_employee_and_date` index).
   - After auto-save, the employee sees a form to optionally add a note and toggle anonymity.
   - Submitting the note calls `moodCheckins.updateDetails`.

4. **Dashboard displays**: Managers see trends via `moodCheckins.getTrends` (org-wide) and `moodCheckins.getGroupTrends` (per-group), recent check-ins via `moodCheckins.getTodayCheckins`, and historical notes via `moodCheckins.getHistoricalCheckins`.

---

## Data Model

All tables are defined in `convex/schema.ts`. Convex Auth internal tables (`authTables`) are spread into the schema automatically.

### `users`

Authentication records for managers who log in to the dashboard.

| Field | Type | Description |
|---|---|---|
| `name` | `string?` | First name |
| `surname` | `string?` | Last name |
| `email` | `string?` | Email address |
| `isAnonymous` | `boolean?` | Reserved for anonymous auth |
| `emailVerificationTime` | `number?` | When email was verified |

**Indexes:** `email` on `["email"]`

### `organizationMemberships`

Links users to organizations with role-based access control.

| Field | Type | Description |
|---|---|---|
| `userId` | `Id<"users">` | Reference to user |
| `organisation` | `string` | Organization name |
| `role` | `"owner" \| "editor" \| "viewer"` | Access level |
| `createdAt` | `number` | Membership creation timestamp |

**Indexes:**
- `by_user` on `["userId"]`
- `by_organisation` on `["organisation"]`
- `by_user_and_org` on `["userId", "organisation"]` -- primary access control index

### `employees`

People who receive daily check-in emails. Separate from users -- employees do not have login accounts.

| Field | Type | Description |
|---|---|---|
| `firstName` | `string` | Employee's first name |
| `email` | `string` | Email address for check-ins |
| `organisation` | `string` | Organization they belong to |
| `createdAt` | `number` | When the employee was added |
| `deletedAt` | `number?` | Soft deletion timestamp (null = active) |

**Indexes:** `by_organisation` on `["organisation"]`

### `groups`

Team divisions within an organization for filtered dashboard views.

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Group name |
| `organisation` | `string` | Parent organization |
| `createdAt` | `number` | Creation timestamp |

**Indexes:** `by_organisation` on `["organisation"]`

### `groupMembers`

Links employees to groups. Uses soft deletion for historical accuracy.

| Field | Type | Description |
|---|---|---|
| `groupId` | `Id<"groups">` | Reference to group |
| `employeeId` | `Id<"employees">` | Reference to employee |
| `createdAt` | `number?` | When employee joined the group |
| `removedAt` | `number?` | Soft deletion timestamp (null = active) |

**Indexes:**
- `by_group` on `["groupId"]`
- `by_employee` on `["employeeId"]`
- `by_group_and_employee` on `["groupId", "employeeId"]`

### `moodCheckins`

Daily mood responses from employees.

| Field | Type | Description |
|---|---|---|
| `employeeId` | `Id<"employees">` | Who responded |
| `organisation` | `string` | Organization context |
| `mood` | `"green" \| "amber" \| "red"` | Traffic-light mood |
| `note` | `string?` | Optional text note |
| `isAnonymous` | `boolean?` | Whether to hide identity on dashboard |
| `timestamp` | `number` | Exact response time |
| `date` | `string` | YYYY-MM-DD in SAST timezone |

**Indexes:**
- `by_employee` on `["employeeId"]`
- `by_employee_and_date` on `["employeeId", "date"]` -- enforces one-per-day
- `by_organisation` on `["organisation"]`
- `by_date` on `["date"]`
- `by_organisation_and_date` on `["organisation", "date"]` -- dashboard queries

### `moodCheckinTokens`

One-time tokens included in daily email links to authenticate mood check-ins without requiring a login.

| Field | Type | Description |
|---|---|---|
| `employeeId` | `Id<"employees">` | Token owner |
| `token` | `string` | Unique token string |
| `date` | `string` | YYYY-MM-DD the token is valid for |
| `expiresAt` | `number` | Expiration timestamp (36 hours from creation) |

**Indexes:**
- `by_token` on `["token"]`
- `by_employee_and_date` on `["employeeId", "date"]`

### `managerInvitations`

Invitations for managers to join an organization.

| Field | Type | Description |
|---|---|---|
| `email` | `string?` | Recipient email (filled for email invites, empty for link invites) |
| `organisation` | `string` | Target organization |
| `role` | `"editor" \| "viewer"` | Granted role |
| `invitedBy` | `Id<"users">` | Owner who created the invitation |
| `token` | `string` | Unique invitation token |
| `status` | `"pending" \| "accepted" \| "expired"` | Current state |
| `invitationType` | `"email" \| "link"?` | Single-use email or reusable link |
| `createdAt` | `number` | Creation timestamp |
| `expiresAt` | `number` | Expiration timestamp (7 days from creation) |

**Indexes:**
- `by_email` on `["email"]`
- `by_token` on `["token"]`
- `by_organisation` on `["organisation"]`
- `by_email_and_organisation` on `["email", "organisation"]`

### `accessRequests`

Access requests submitted via shareable invitation links, requiring owner approval.

| Field | Type | Description |
|---|---|---|
| `invitationId` | `Id<"managerInvitations">` | Link invitation this request is for |
| `requestedEmail` | `string` | Requester's email |
| `organisation` | `string` | Target organization |
| `role` | `"editor" \| "viewer"` | Requested role |
| `status` | `"pending" \| "approved" \| "declined"` | Current state |
| `requestedAt` | `number` | Submission timestamp |
| `respondedAt` | `number?` | When owner responded |
| `respondedBy` | `Id<"users">?` | Owner who responded |

**Indexes:**
- `by_invitation` on `["invitationId"]`
- `by_email` on `["requestedEmail"]`
- `by_organisation` on `["organisation"]`
- `by_status` on `["status"]`
- `by_organisation_and_status` on `["organisation", "status"]`
- `by_email_and_organisation` on `["requestedEmail", "organisation"]`

### `passwordResets`

Time-limited password reset tokens.

| Field | Type | Description |
|---|---|---|
| `email` | `string` | Account email |
| `token` | `string` | Unique reset token |
| `userId` | `Id<"users">` | Account owner |
| `expiresAt` | `number` | Expiration (1 hour from creation) |
| `used` | `boolean` | Whether token has been consumed |
| `createdAt` | `number` | Creation timestamp |

**Indexes:**
- `by_token` on `["token"]`
- `by_email` on `["email"]`
- `by_user` on `["userId"]`

---

## Directory Structure

```
ruok3/
|-- app/                            # Next.js App Router pages
|   |-- layout.tsx                  # Root layout (ConvexAuthNextjsServerProvider, fonts)
|   |-- page.tsx                    # Landing page (unauthenticated marketing + auth redirect)
|   |-- globals.css                 # Global styles + Tailwind imports
|   |-- signin/
|   |   +-- page.tsx                # Sign in, sign up, forgot password (unified form)
|   |-- manager/
|   |   |-- layout.tsx              # Authenticated layout with sidebar navigation
|   |   |-- page.tsx                # Redirect to /manager/view
|   |   |-- view/
|   |   |   +-- page.tsx            # Main dashboard (mood trends, recent check-ins)
|   |   |-- edit/
|   |   |   +-- page.tsx            # Manage employees and groups
|   |   |-- managers/
|   |   |   +-- page.tsx            # Manage organization members, invitations, access requests
|   |   +-- account/
|   |       +-- page.tsx            # Account settings (name, password, delete account)
|   |-- viewer/
|   |   +-- dashboard/
|   |       +-- page.tsx            # Viewer redirect (forwards to /manager/view)
|   |-- mood-response/
|   |   +-- page.tsx                # Employee mood submission (accessed from email links)
|   |-- accept-invitation/
|   |   +-- page.tsx                # Accept manager invitation (signup or link existing account)
|   |-- invite/
|   |   +-- page.tsx                # Shareable invite link landing page
|   |-- request-access/
|   |   +-- page.tsx                # Request access form for shareable links
|   |-- reset-password/
|   |   +-- page.tsx                # Password reset form
|   |-- select-organization/
|   |   +-- page.tsx                # Organization selection / creation page
|   +-- api/
|       +-- check-email/
|           +-- route.ts            # Deprecated API endpoint (returns 404)
|-- components/
|   |-- ConvexClientProvider.tsx     # Convex + Auth client provider wrapper
|   +-- ui/                         # Reusable UI components (button, input, dialog, sidebar, etc.)
|       +-- loading-spinner.tsx     # Bouncing dots loading indicator
|-- convex/                         # Convex backend
|   |-- _generated/                 # Auto-generated types and API references (do not edit)
|   |-- schema.ts                   # Database schema definition
|   |-- auth.ts                     # Convex Auth config (Password provider, bcrypt crypto)
|   |-- auth.config.ts              # Auth provider configuration
|   |-- passwordCrypto.ts           # Custom bcrypt password hashing implementation
|   |-- http.ts                     # HTTP router (auth routes)
|   |-- crons.ts                    # Scheduled jobs (daily mood emails)
|   |-- moodCheckins.ts             # Core mood check-in logic (record, trends, email sending)
|   |-- employees.ts                # Employee CRUD operations
|   |-- groups.ts                   # Group and group member management
|   |-- users.ts                    # User queries, account management, delete account
|   |-- organizationMemberships.ts  # Organization CRUD, role queries, member management
|   |-- managerInvitations.ts       # Invitation creation, acceptance, email sending
|   |-- accessRequests.ts           # Access request CRUD, approval/decline, email notifications
|   |-- passwordReset.ts            # Password reset token management, email sending
|   |-- passwordResetActions.ts     # Node.js action for bcrypt password hashing
|   |-- emailValidation.ts          # Email format validation and normalization utilities
|   +-- authHelpers.ts              # Shared auth helper (requireOrgMembership)
|-- middleware.ts                    # Next.js middleware (Convex Auth session handling)
|-- next.config.ts                  # Next.js configuration
|-- package.json                    # Dependencies and scripts
|-- tsconfig.json                   # TypeScript configuration (strict mode, path aliases)
+-- .env.example                    # Environment variable template
```

---

## Getting Started

### Prerequisites

- **Node.js** >= 18 (required by Next.js 16)
- **npm** (comes with Node.js)
- **Convex CLI**: Install globally or use `npx`
- A **Resend** account and API key (for sending emails)
- Optionally, a **Google Gemini** API key (for AI-generated check-in messages)

### 1. Clone and Install

```bash
git clone <repository-url>
cd ruok3
npm install
```

### 2. Environment Variables

Copy the example file and fill in your values:

```bash
cp .env.example .env.local
```

See the [Environment Variables Reference](#environment-variables-reference) section for details on each variable.

For Convex environment variables specifically, you need to set them both locally (for Next.js) and in the Convex dashboard (for backend functions):

```bash
# Set Convex backend env vars
npx convex env set RESEND_API_KEY re_your_api_key_here
npx convex env set SITE_URL https://your-deployed-url.com

# Optional: enable AI-generated check-in messages
npx convex env set GEMINI_API_KEY your_gemini_api_key_here
```

### 3. Convex Setup

```bash
# Initialize Convex project (first time only)
npx convex init

# Deploy schema and functions
npx convex dev --until-success

# Open the Convex dashboard to verify
npx convex dashboard
```

### 4. Run in Development

```bash
# Run both frontend and Convex backend in parallel (recommended)
npm run dev

# Or run separately:
npm run dev:frontend    # Next.js dev server
npm run dev:backend     # Convex dev server (watches for changes)
```

The `predev` script can be used for initial setup:

```bash
npm run predev    # Runs convex setup, executes setup.mjs, opens dashboard
```

### 5. Production Build and Deploy

```bash
# Build the Next.js frontend
npm run build

# Deploy Convex functions to production
npx convex deploy

# Start production server locally
npm start
```

---

## Environment Variables Reference

| Variable | Required | Where Used | Description | Example |
|---|---|---|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | Yes | Frontend (Next.js) | Your Convex deployment URL. Set automatically by `convex dev`. | `https://abc123.convex.cloud` |
| `CONVEX_SITE_URL` | Yes | Convex backend (`auth.config.ts`) | Convex site URL for auth callbacks. | `https://abc123.convex.site` |
| `CONVEX_DEPLOY_KEY` | Production only | CI/CD | Deploy key from Convex dashboard for production deployments. | `prod:abc123...` |
| `SITE_URL` | Yes (production) | Convex backend (email links) | Base URL of your deployed frontend. Used to construct links in emails (invitations, password resets, mood check-ins). Defaults to `http://localhost:3000` in dev. | `https://www.yourapp.com` |
| `RESEND_API_KEY` | Yes | Convex backend (email sending) | API key from [Resend](https://resend.com). Required for all email functionality. | `re_abc123...` |
| `GEMINI_API_KEY` | No | Convex backend (`moodCheckins.ts`) | Google Gemini API key for AI-generated check-in messages. If not set, falls back to static pre-written messages. Get one at [aistudio.google.com](https://aistudio.google.com/app/apikey). | `AIza...` |

**Important:** `RESEND_API_KEY`, `SITE_URL`, and `GEMINI_API_KEY` must be set as Convex environment variables (via `npx convex env set`), not just in `.env.local`. The frontend only needs `NEXT_PUBLIC_CONVEX_URL`.

---

## Convex Backend Reference

### Function Conventions

All public and internal Convex functions follow these patterns:

1. **New function syntax** with explicit `args` and `returns` validators:
   ```typescript
   export const myQuery = query({
     args: { organisation: v.string() },
     returns: v.array(v.object({ ... })),
     handler: async (ctx, args) => { ... }
   });
   ```

2. **Function types:**
   - `query` / `mutation` / `action` -- public API (called from frontend)
   - `internalQuery` / `internalMutation` / `internalAction` -- private (called from other backend functions)

3. **Authorization pattern** -- every public function:
   - Calls `getAuthUserId(ctx)` to get the current user
   - Queries `organizationMemberships` with `by_user_and_org` index to verify access
   - Throws or returns empty if unauthorized

4. **No `.filter()` in queries** -- always use indexes for filtering.

5. **Node.js actions** require `"use node"` directive at the top of the file (see `passwordResetActions.ts`).

6. **Soft deletion:** Employees use `deletedAt`, group members use `removedAt`. Never hard-delete these records.

7. **Function references:** Use `api.filename.functionName` for public functions and `internal.filename.functionName` for internal functions.

### Tables and Indexes

See the [Data Model](#data-model) section above for complete table and index documentation.

### Scheduled Jobs (Crons)

Defined in `convex/crons.ts`:

| Job Name | Schedule | Function | Description |
|---|---|---|---|
| `send daily mood emails` | `0 13 * * 1-5` (1:00 PM UTC / 3:00 PM SAST, Mon-Fri) | `internal.moodCheckins.sendDailyEmails` | Sends personalized mood check-in emails to all active employees across all organizations |

### HTTP Endpoints

Defined in `convex/http.ts`:

The HTTP router only includes Convex Auth routes (`auth.addHttpRoutes(http)`). These handle authentication callbacks for the email/password provider. No custom HTTP endpoints are defined.

---

## Frontend Routes Reference

| Route | Page File | Auth Required | Description |
|---|---|---|---|
| `/` | `app/page.tsx` | No | Landing page. Redirects authenticated users with organizations to `/manager/view`. Shows "Waiting for Access" if authenticated with no orgs. |
| `/signin` | `app/signin/page.tsx` | No | Unified sign in / sign up / forgot password. Supports `?flow=signup`, `?flow=forgot` query params. |
| `/manager` | `app/manager/page.tsx` | Yes | Redirects to `/manager/view`. |
| `/manager/view` | `app/manager/view/page.tsx` | Yes | Main dashboard: mood trends (1 week / 1 month / 1 year / overall), recent check-ins (last 24h), historical check-ins with notes, group filtering. |
| `/manager/edit` | `app/manager/edit/page.tsx` | Yes (owner/editor) | Add/remove employees, create/delete groups, manage group membership. |
| `/manager/managers` | `app/manager/managers/page.tsx` | Yes (owner) | View/remove organization members, create email/link invitations, manage access requests (approve/decline). |
| `/manager/account` | `app/manager/account/page.tsx` | Yes | Update name/surname, delete account. |
| `/viewer/dashboard` | `app/viewer/dashboard/page.tsx` | Yes | Redirect to `/manager/view`. |
| `/mood-response` | `app/mood-response/page.tsx` | No | Employee mood submission. Accessed via email link with `?employeeId=...&mood=...&token=...`. |
| `/accept-invitation` | `app/accept-invitation/page.tsx` | Partial | Accept a manager invitation. Handles both new signups and existing users. Accessed via `?token=...`. |
| `/invite` | `app/invite/page.tsx` | No | Shareable invitation link landing page. Accessed via `?token=...`. |
| `/request-access` | `app/request-access/page.tsx` | No | Request access form for shareable link invitations. Accessed via `?token=...`. |
| `/reset-password` | `app/reset-password/page.tsx` | No | Password reset form. Accessed via `?token=...` from reset email. |
| `/select-organization` | `app/select-organization/page.tsx` | Yes | Choose or create an organization. Auto-redirects if user has exactly one org. |
| `/api/check-email` | `app/api/check-email/route.ts` | No | Deprecated. Returns 404. Email checks now go through Convex directly. |

---

## Role and Permission System

Three roles exist, assigned per organization membership:

| Capability | Owner | Editor | Viewer |
|---|---|---|---|
| View mood dashboard and trends | Yes | Yes | Yes |
| View recent check-ins | Yes | Yes | Yes |
| View historical check-ins with notes | Yes | Yes | Yes |
| Add/remove employees | Yes | Yes | No |
| Create/delete groups | Yes | Yes | No |
| Manage group memberships | Yes | Yes | No |
| Invite new members (email or link) | Yes | No | No |
| Approve/decline access requests | Yes | No | No |
| Remove organization members | Yes | No | No |
| View the Viewer Access page | Yes | No | No |
| View the Edit Organization page | Yes | Yes | No |
| Create new organizations | Yes | Yes | Yes |
| Delete own account | Yes | Yes | Yes |

**Notes:**
- An owner cannot remove themselves if they are the last owner of an organization.
- Invitations can grant only `editor` or `viewer` roles (never `owner`).
- When a user accepts an invitation for a role higher than their current one, their role is upgraded automatically.

---

## Email System

All emails are sent via the [Resend API](https://resend.com) from the sender address `R u OK <noreply@harbourweb.org>`.

### Email Types

| Email | Trigger | Sent To | Template Location |
|---|---|---|---|
| **Daily mood check-in** | Cron job (weekdays at 3 PM SAST) | All active employees | `convex/moodCheckins.ts` (`sendDailyEmails`) |
| **Manager invitation** | Owner creates email invitation | Invited email address | `convex/managerInvitations.ts` (`sendInvitationEmail`) |
| **Password reset** | User requests password reset | User's email | `convex/passwordReset.ts` (`sendPasswordResetEmail`) |
| **Access request notification** | User submits access request | All org owners | `convex/accessRequests.ts` (`sendAccessRequestNotification`) |
| **Access approved** | Owner approves access request | Requester's email | `convex/accessRequests.ts` (`sendAccessRequestApprovalEmail`) |
| **Access declined** | Owner declines access request | Requester's email | `convex/accessRequests.ts` (`sendAccessRequestDeclineEmail`) |

All email templates are inline HTML within the respective Convex action functions. There are no external template files.

### Rate Limiting

Daily mood emails are sent with a 200ms delay between each email to stay within Resend's free-tier rate limit of 10 emails/second.

### AI Messages (Optional)

When `GEMINI_API_KEY` is configured, `sendDailyEmails` calls the Google Gemini API (model: `gemini-1.5-flash`) to generate personalized check-in messages. Two messages are generated per batch (one regular, one encouraging for employees who last responded "red") and then personalized per employee by replacing the name placeholder. If the API call fails, the system falls back to static messages.

---

## Key Business Rules

1. **One check-in per employee per day.** Enforced by the `by_employee_and_date` index. If an employee clicks a mood link after already responding, they see an "already submitted" message.

2. **Check-in tokens are one-time per day.** Each daily email generates a unique token stored in `moodCheckinTokens`. Stale tokens for the same employee+date are deleted before creating a new one. Tokens expire after 36 hours.

3. **Soft deletion for employees.** Employees are never hard-deleted. `deletedAt` is set instead. This preserves historical mood data and ensures trend calculations remain accurate.

4. **Soft deletion for group memberships.** When an employee is removed from a group, `removedAt` is set on the `groupMembers` record instead of deleting it. When an employee is soft-deleted, all their active group memberships are also soft-deleted.

5. **Groups are hard-deleted** but their memberships are soft-deleted first to preserve historical data.

6. **Historical accuracy in trends.** Employee count on any given day is calculated as: employees created before the email send time (1 PM UTC) AND either not deleted or deleted after the email send time.

7. **Invitation expiry.** Manager invitations expire after 7 days. Password reset tokens expire after 1 hour.

8. **Invitation types:**
   - **Email invitations** are single-use -- marked as "accepted" once used. They enforce email matching.
   - **Link invitations** are reusable until expiry. They can be shared with multiple people.

9. **Password reset rate limiting.** Only one reset email per user per 5 minutes. The response always says "If an account with this email exists..." to prevent email enumeration.

10. **Minimum password length:** 8 characters, enforced on both frontend and backend.

11. **SAST timezone.** All date calculations use South African Standard Time (UTC+2). The `getSASTDateString()` helper converts UTC timestamps to SAST date strings.

12. **Organization names are unique.** Checked via the `by_organisation` index on `organizationMemberships` before creation.

13. **Duplicate employee prevention.** Within an organization, two active employees cannot share the same email (case-insensitive check).

14. **Access request auto-approval.** When a user who has a pending access request accepts an invitation through the normal flow, their pending request is automatically approved.

---

## Common Development Tasks

### Adding a New Convex Function

1. Choose the correct file in `convex/` (or create a new one).
2. Use the new function syntax with validators:

```typescript
import { v } from "convex/values";
import { query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const myNewQuery = query({
  args: {
    organisation: v.string(),
  },
  returns: v.array(v.object({
    _id: v.id("employees"),
    firstName: v.string(),
  })),
  handler: async (ctx, args) => {
    // 1. Authenticate
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return [];
    }

    // 2. Verify organization access
    const membership = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_user_and_org", (q) =>
        q.eq("userId", userId).eq("organisation", args.organisation)
      )
      .first();

    if (!membership) {
      return [];
    }

    // 3. Business logic using indexes (never .filter())
    return await ctx.db
      .query("employees")
      .withIndex("by_organisation", (q) =>
        q.eq("organisation", args.organisation)
      )
      .collect();
  },
});
```

3. If the function needs Node.js built-ins (e.g., `bcrypt`, `crypto`), make it an `internalAction` in a file with `"use node"` at the top.

4. Run `npm run dev:backend` -- Convex auto-generates types in `convex/_generated/`.

### Adding a New Page

1. Create a directory under `app/` following Next.js App Router conventions:
   ```
   app/my-page/page.tsx
   ```

2. Mark client components with `"use client"` at the top.

3. For authenticated pages, follow the pattern in existing manager pages:
   - Use `useConvexAuth()` to check auth state
   - Redirect to `/signin` if not authenticated
   - Read `selectedOrganization` from `localStorage`
   - Listen for `organizationChanged` events
   - Query `organizationMemberships.getUserRoleInOrg` for role-based UI

4. Use existing UI components from `components/ui/`.

### Sending a New Email Type

1. Create an `internalAction` in the appropriate Convex file:

```typescript
export const sendMyEmail = internalAction({
  args: {
    email: v.string(),
    // ... other args
  },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      return { success: false, error: "Resend API key not configured" };
    }

    const emailHtml = `<!DOCTYPE html>...`; // Inline HTML template

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: "R u OK <noreply@harbourweb.org>",
        to: args.email,
        subject: "Your Subject",
        html: emailHtml,
      }),
    });

    if (response.ok) {
      return { success: true };
    }
    const errorText = await response.text();
    return { success: false, error: errorText };
  },
});
```

2. Schedule it from a mutation using `ctx.scheduler.runAfter(0, internal.yourFile.sendMyEmail, { ... })`.

---

## Deployment

### Convex

```bash
# Set environment variables in production
npx convex env set RESEND_API_KEY re_your_production_key
npx convex env set SITE_URL https://your-production-domain.com
npx convex env set GEMINI_API_KEY your_key  # optional

# Deploy functions and schema
npx convex deploy
```

The cron job for daily emails will start running automatically after deployment.

### Next.js (Vercel Recommended)

1. Connect your repository to Vercel.
2. Set these environment variables in the Vercel dashboard:
   - `NEXT_PUBLIC_CONVEX_URL` -- your Convex deployment URL
   - `CONVEX_DEPLOY_KEY` -- for automatic Convex deployments during builds
3. Deploy. Vercel will run `next build` automatically.

**Important:** The `SITE_URL` Convex environment variable must match your production domain exactly (including `https://`). This URL is used to construct all links in emails.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| **"Not authenticated" errors on all pages** | Session may have expired (24h limit). Sign out and sign in again. Check that `CONVEX_SITE_URL` is set correctly. |
| **Emails not being sent** | Verify `RESEND_API_KEY` is set as a Convex env var (`npx convex env list`). Check Convex logs: `npx convex logs`. |
| **Mood check-in link says "Invalid or expired"** | Tokens expire after 36 hours. The employee may be clicking a link from a previous day. Also verify `SITE_URL` matches the actual frontend domain. |
| **"Already submitted" when clicking mood link** | Only one response per employee per day is allowed. The initial click auto-submits -- there is no need to click again. |
| **localStorage selectedOrganization stale after sign out** | The app clears localStorage on sign out, but if something goes wrong, manually clear `selectedOrganization` from browser dev tools. |
| **Password reset not working** | Check that `RESEND_API_KEY` is set. Reset tokens expire after 1 hour. Rate limiting prevents more than one reset email per 5 minutes. |
| **"An organization with this name already exists"** | Organization names are globally unique. Choose a different name. |
| **Convex function types out of date** | Run `npm run dev:backend` or `npx convex dev` to regenerate `convex/_generated/`. |
| **Build error: "Cannot find module '@/...'"** | The path alias `@/*` maps to the project root. Verify `tsconfig.json` has the correct paths configuration. |
| **AI messages not generating** | Set `GEMINI_API_KEY` as a Convex env var. The system falls back to static messages silently if the key is missing or the API fails. |

---

## Contributing and Code Style

### Conventions Observed in the Codebase

- **TypeScript strict mode** is enabled. All code must be type-safe.
- **ESLint** with Next.js config and Convex plugin. Run `npm run lint`. The `convex/_generated/**` directory is excluded.
- **Tailwind CSS v4** for all styling. No CSS modules or styled-components.
- **`"use client"` directive** on all interactive page components (all pages use client-side rendering with Convex real-time queries).
- **Error handling pattern:** Catch errors, check for network issues (`msg.toLowerCase().includes("network")`), and show user-friendly messages. Never expose raw error messages to users.
- **Naming conventions:**
  - Convex functions: camelCase (`getUserOrganizations`, `sendDailyEmails`)
  - React components: PascalCase (`ViewOrganizationPage`, `LoadingSpinner`)
  - Files: camelCase for Convex (`moodCheckins.ts`), kebab-case for components (`loading-spinner.tsx`)
  - Database fields: camelCase (`createdAt`, `employeeId`)
- **Import paths:** Use `@/*` alias for project-root imports. Use relative paths for within-directory imports (e.g., `../../convex/_generated/api`).
- **Never edit `convex/_generated/`** -- these files are auto-generated by the Convex CLI.
- **Soft deletion** is the standard pattern for employees and group memberships. Always check for `deletedAt` / `removedAt` when querying active records.
- **Organization access** must be verified on every backend function that accesses organization data.
