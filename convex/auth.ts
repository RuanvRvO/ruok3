import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { passwordCrypto } from "./passwordCrypto";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  session: {
    totalDurationMs: 1000 * 60 * 60 * 24, // 1 day
  },
  providers: [
    Password({
      profile(params) {
        const name = params.name ? String(params.name).trim() : undefined;
        const surname = params.surname ? String(params.surname).trim() : undefined;

        return {
          email: params.email as string,
          ...(name ? { name } : {}),
          ...(surname ? { surname } : {}),
        };
      },
      // Use bcryptjs for password hashing to match reset functionality
      crypto: passwordCrypto,
    }),
  ],
});
