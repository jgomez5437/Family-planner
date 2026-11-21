import { NextResponse } from "next/server";
import { addPostCommentRecord } from "@/db/repository";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const body = await request.json();
  const comment = await addPostCommentRecord(
    id,
    body.text,
    body.currentUser || "mom",
    body.commentId
  );
  return NextResponse.json({ comment }, { status: 201 });
}
