/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accessRequests from "../accessRequests.js";
import type * as auth from "../auth.js";
import type * as authHelpers from "../authHelpers.js";
import type * as crons from "../crons.js";
import type * as emailValidation from "../emailValidation.js";
import type * as employees from "../employees.js";
import type * as groups from "../groups.js";
import type * as http from "../http.js";
import type * as managerInvitations from "../managerInvitations.js";
import type * as moodCheckins from "../moodCheckins.js";
import type * as organizationMemberships from "../organizationMemberships.js";
import type * as passwordCrypto from "../passwordCrypto.js";
import type * as passwordReset from "../passwordReset.js";
import type * as passwordResetActions from "../passwordResetActions.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accessRequests: typeof accessRequests;
  auth: typeof auth;
  authHelpers: typeof authHelpers;
  crons: typeof crons;
  emailValidation: typeof emailValidation;
  employees: typeof employees;
  groups: typeof groups;
  http: typeof http;
  managerInvitations: typeof managerInvitations;
  moodCheckins: typeof moodCheckins;
  organizationMemberships: typeof organizationMemberships;
  passwordCrypto: typeof passwordCrypto;
  passwordReset: typeof passwordReset;
  passwordResetActions: typeof passwordResetActions;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
