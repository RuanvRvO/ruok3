import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        const profile: {
          email: string;
          name?: string;
          surname?: string;
        } = {
          email: params.email as string,
        };

        // Add custom fields if they're present (signUp flow)
        if (params.name) {
          profile.name = params.name as string;
        }
        if (params.surname) {
          profile.surname = params.surname as string;
        }

        return profile;
      },
    }),
  ],
});
