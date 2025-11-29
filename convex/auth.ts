import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        // Combine name and surname into a single name field
        const fullName = params.surname
          ? `${params.name} ${params.surname}`
          : (params.name as string);

        return {
          email: params.email as string,
          name: fullName,
          organisation: params.organisation as string,
        };
      },
    }),
  ],
});
