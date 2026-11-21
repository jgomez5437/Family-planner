import { NextResponse } from "next/server";
import {
  addPostCommentRecord,
  getAuthenticatedSession,
} from "@/db/repository";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getAuthenticatedSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  const body = await request.json();
  const comment = await addPostCommentRecord(
    session.familyId,
    id,
    body.text,
    session.member.id,
    body.commentId
  );
  if (!comment) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }
  return NextResponse.json({ comment }, { status: 201 });
}
