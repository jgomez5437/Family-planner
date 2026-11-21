import { NextResponse } from "next/server";
import { createPostRecord } from "@/db/repository";

export async function POST(request: Request) {
  const body = await request.json();
  const post = await createPostRecord(
    body.post || body,
    body.currentUser || "mom"
  );
  return NextResponse.json({ post }, { status: 201 });
}
