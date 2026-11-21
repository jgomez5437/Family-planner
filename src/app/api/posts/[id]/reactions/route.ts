import { NextResponse } from "next/server";
import { togglePostReactionRecord } from "@/db/repository";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const body = await request.json();
  await togglePostReactionRecord(id, body.emoji, body.currentUser || "mom");
  return NextResponse.json({ ok: true });
}
