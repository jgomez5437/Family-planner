import { NextResponse } from "next/server";
import { createEventRecord, getAuthenticatedSession } from "@/db/repository";

export async function POST(request: Request) {
  const session = await getAuthenticatedSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json();
  const created = await createEventRecord(
    session.familyId,
    body.event || body,
    session.member.id
  );
  return NextResponse.json({ event: created }, { status: 201 });
}
