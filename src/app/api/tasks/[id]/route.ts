import { NextResponse } from "next/server";
import { toggleTaskRecord } from "@/db/repository";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const decodedId = decodeURIComponent(id);
  const body = await request.json();
  const updated = await toggleTaskRecord(decodedId, body.currentUser || "mom");
  if (!updated) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  return NextResponse.json({ task: updated });
}
