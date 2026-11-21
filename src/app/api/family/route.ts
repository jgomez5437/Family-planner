import { NextResponse } from "next/server";
import {
  getAuthenticatedSession,
  getFamilyState,
  regenerateFamilyInviteCode,
  updateFamilyName,
} from "@/db/repository";

export async function GET() {
  const session = await getAuthenticatedSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const state = await getFamilyState(session.familyId, session.member.id);
  if (!state) {
    return NextResponse.json({ error: "Family not found" }, { status: 404 });
  }
  return NextResponse.json(state);
}

export async function PATCH(request: Request) {
  const session = await getAuthenticatedSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  if (body.regenerateInviteCode) {
    const inviteCode = await regenerateFamilyInviteCode(session.familyId);
    return NextResponse.json({ inviteCode });
  }
  if (typeof body.familyName === "string" && body.familyName.trim()) {
    const familyName = await updateFamilyName(session.familyId, body.familyName);
    return NextResponse.json({ familyName });
  }
  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}
