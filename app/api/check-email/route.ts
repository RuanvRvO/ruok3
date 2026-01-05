import { NextRequest, NextResponse } from "next/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../convex/_generated/api";

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ exists: false }, { status: 400 });
    }

    const exists = await fetchQuery(api.users.checkEmailExists, { email });

    return NextResponse.json({ exists });
  } catch {
    return NextResponse.json({ exists: false }, { status: 500 });
  }
}
