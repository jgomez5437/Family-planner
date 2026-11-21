import { NextResponse } from "next/server";
import {
  getAuthenticatedSession,
  togglePostReactionRecord,
} from "@/db/repository";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getAuthenticatedSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  const body = await request.json();
  await togglePostReactionRecord(
    session.familyId,
    id,
    body.emoji,
    session.member.id
  );
  return NextResponse.json({ ok: true });
}
