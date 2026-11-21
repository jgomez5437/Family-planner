import { NextResponse } from "next/server";
import { getAuthenticatedSession, saveMedicationRecord } from "@/db/repository";

export async function POST(request: Request) {
  const session = await getAuthenticatedSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json();
  const med = await saveMedicationRecord(
    session.familyId,
    body.med,
    true,
    session.member.id
  );
  return NextResponse.json({ med }, { status: 201 });
}
