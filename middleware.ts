import { convexAuthNextjsMiddleware } from "@convex-dev/auth/nextjs/server";

export const middleware = convexAuthNextjsMiddleware();

export const config = {
  // The following matcher runs middleware on all routes
  // except static assets.
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
