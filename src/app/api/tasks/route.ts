import { NextResponse } from "next/server";
import { createTaskRecord, getAuthenticatedSession } from "@/db/repository";

export async function POST(request: Request) {
  const session = await getAuthenticatedSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json();
  const created = await createTaskRecord(
    session.familyId,
    body.task || body,
    session.member.id
  );
  return NextResponse.json({ task: created }, { status: 201 });
}
