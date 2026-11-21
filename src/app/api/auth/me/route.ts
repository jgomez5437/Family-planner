import { NextResponse } from "next/server";
import { getAuthenticatedSession, getFamilyState } from "@/db/repository";

export async function GET() {
  const session = await getAuthenticatedSession();
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  const state = await getFamilyState(session.familyId, session.member.id);
  if (!state) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({ authenticated: true, state });
}
