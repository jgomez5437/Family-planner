import { NextResponse } from "next/server";
import {
  deleteEventRecord,
  getAuthenticatedSession,
  updateEventRecord,
} from "@/db/repository";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getAuthenticatedSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  const decodedId = decodeURIComponent(id);
  const body = await request.json();
  const updated = await updateEventRecord(
    session.familyId,
    decodedId,
    body.field,
    body.value,
    body.reason || "",
    body.scope === "instance" ? "instance" : "series",
    session.member.id
  );
  if (!updated) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  return NextResponse.json({ event: updated });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getAuthenticatedSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  const decodedId = decodeURIComponent(id);
  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope") === "instance" ? "instance" : "series";
  await deleteEventRecord(session.familyId, decodedId, scope);
  return NextResponse.json({ ok: true });
}
