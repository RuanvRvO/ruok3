import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

const isSignInPage = createRouteMatcher(["/signin"]);
const isManagerSignupPage = createRouteMatcher(["/manager-signup"]);
const isAcceptInvitationPage = createRouteMatcher(["/accept-invitation"]);
const isProtectedRoute = createRouteMatcher(["/manager(.*)"]);


export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  if (isSignInPage(request) && (await convexAuth.isAuthenticated())) {
    return nextjsMiddlewareRedirect(request, "/manager/view");
  }
  // Allow access to manager-signup page without authentication
  if (isManagerSignupPage(request)) {
    return;
  }
  // Allow access to accept-invitation page without authentication
  if (isAcceptInvitationPage(request)) {
    return;
  }
  if (isProtectedRoute(request) && !(await convexAuth.isAuthenticated())) {
    return nextjsMiddlewareRedirect(request, "/signin");
  }
});

export const config = {
  // The following matcher runs middleware on all routes
  // except static assets.
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
