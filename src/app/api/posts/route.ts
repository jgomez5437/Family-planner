import { NextResponse } from "next/server";
import { createPostRecord, getAuthenticatedSession } from "@/db/repository";

export async function POST(request: Request) {
  const session = await getAuthenticatedSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json();
  const post = await createPostRecord(
    session.familyId,
    body.post || body,
    session.member.id
  );
  return NextResponse.json({ post }, { status: 201 });
}
