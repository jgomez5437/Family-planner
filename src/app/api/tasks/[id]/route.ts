import { NextResponse } from "next/server";
import {
  deleteTaskRecord,
  getAuthenticatedSession,
  toggleTaskRecord,
  updateTaskRecord,
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
  const body = await request.json().catch(() => ({}));

  if (body && typeof body.updates === "object" && body.updates !== null) {
    const scope = body.scope === "instance" ? "instance" : "series";
    const result = await updateTaskRecord(
      session.familyId,
      decodedId,
      body.updates,
      scope,
      session.member.id
    );
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }
    return NextResponse.json({ task: result.task });
  }

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
  const result = await deleteTaskRecord(
    session.familyId,
    decodedId,
    scope,
    session.member.id
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
