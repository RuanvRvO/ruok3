import { NextResponse } from "next/server";

// This endpoint has been removed to prevent unauthenticated email enumeration.
// Email existence checks now go through Convex directly with rate limiting applied
// by the Convex platform. See convex/users.ts checkEmailExists query.
export async function POST() {
  return NextResponse.json({ exists: false }, { status: 404 });
}
