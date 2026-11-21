import { NextResponse } from "next/server";
import { createTaskRecord } from "@/db/repository";

export async function POST(request: Request) {
  const body = await request.json();
  const currentUser = body.currentUser || body.createdBy || "mom";
  const created = await createTaskRecord(body.task || body, currentUser);
  return NextResponse.json({ task: created }, { status: 201 });
}
