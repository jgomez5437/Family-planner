import { NextResponse } from "next/server";
import { getAuthenticatedSession, toggleDoseRecord } from "@/db/repository";

export async function POST(request: Request) {
  const session = await getAuthenticatedSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json();
  const result = await toggleDoseRecord(
    session.familyId,
    body.key,
    body.medId,
    body.kidId,
    body.medName,
    body.time,
    session.member.id
  );
  return NextResponse.json(result);
}
