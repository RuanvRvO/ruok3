import bcryptjs from "bcryptjs";

// Custom crypto functions for Convex Auth Password provider
// Uses bcryptjs to ensure consistency with password reset functionality
// IMPORTANT: Must use synchronous versions (hashSync/compareSync) wrapped in Promise.resolve()
// because Convex mutations cannot use setTimeout/async timers but the interface requires Promises
export const passwordCrypto = {
  hashSecret: async (secret: string): Promise<string> => {
    // Use hashSync to avoid setTimeout (not allowed in Convex mutations)
    // Wrap in Promise.resolve to match the required interface
    return Promise.resolve(bcryptjs.hashSync(secret, 10));
  },
  verifySecret: async (secret: string, hash: string): Promise<boolean> => {
    // Use compareSync to avoid setTimeout (not allowed in Convex mutations)
    // Wrap in Promise.resolve to match the required interface
    return Promise.resolve(bcryptjs.compareSync(secret, hash));
  },
};

