import { NextResponse } from "next/server";
import { createEventRecord } from "@/db/repository";

export async function POST(request: Request) {
  const body = await request.json();
  const currentUser = body.currentUser || body.createdBy || "mom";
  const created = await createEventRecord(body.event || body, currentUser);
  return NextResponse.json({ event: created }, { status: 201 });
}
