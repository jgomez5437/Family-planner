import { NextResponse } from "next/server";
import { deleteEventRecord, updateEventRecord } from "@/db/repository";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const decodedId = decodeURIComponent(id);
  const body = await request.json();
  const updated = await updateEventRecord(
    decodedId,
    body.field,
    body.value,
    body.reason || "",
    body.scope === "instance" ? "instance" : "series",
    body.currentUser || "mom"
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
  const { id } = await context.params;
  const decodedId = decodeURIComponent(id);
  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope") === "instance" ? "instance" : "series";
  await deleteEventRecord(decodedId, scope);
  return NextResponse.json({ ok: true });
}
