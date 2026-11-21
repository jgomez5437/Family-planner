import { NextResponse } from "next/server";
import { getAuthenticatedSession, toggleTaskRecord } from "@/db/repository";

export async function PATCH(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getAuthenticatedSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  const decodedId = decodeURIComponent(id);
  const updated = await toggleTaskRecord(
    session.familyId,
    decodedId,
    session.member.id
  );
  if (!updated) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  return NextResponse.json({ task: updated });
}
