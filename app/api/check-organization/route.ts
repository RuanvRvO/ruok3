import { NextRequest, NextResponse } from "next/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../convex/_generated/api";

export async function POST(request: NextRequest) {
  try {
    const { organisation } = await request.json();

    if (!organisation) {
      return NextResponse.json({ exists: false }, { status: 400 });
    }

    const exists = await fetchQuery(api.users.checkOrganizationExists, { organisation });

    return NextResponse.json({ exists });
  } catch (error) {
    console.error("Error checking organization:", error);
    return NextResponse.json({ exists: false }, { status: 500 });
  }
}
