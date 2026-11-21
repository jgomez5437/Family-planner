import { NextResponse } from "next/server";
import {
  getAuthenticatedSession,
  saveChildProfileRecord,
} from "@/db/repository";

export async function PUT(
  request: Request,
  context: { params: Promise<{ kidId: string }> }
) {
  const session = await getAuthenticatedSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { kidId } = await context.params;
  const body = await request.json();
  const profile = await saveChildProfileRecord(
    session.familyId,
    kidId,
    body.profile,
    session.member.id
  );
  return NextResponse.json({ profile });
}
