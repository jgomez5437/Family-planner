import { NextResponse } from "next/server";
import {
  addPostCommentRecord,
  deletePostCommentRecord,
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
  const decodedId = decodeURIComponent(id);
  const body = await request.json();
  const comment = await addPostCommentRecord(
    session.familyId,
    decodedId,
    body.text,
    session.member.id,
    body.commentId
  );
  if (!comment) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }
  return NextResponse.json({ comment }, { status: 201 });
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
  const decodedPostId = decodeURIComponent(id);
  const { searchParams } = new URL(request.url);
  let commentId = searchParams.get("commentId")?.trim() || "";
  if (!commentId) {
    const body = await request.json().catch(() => ({}));
    if (typeof body?.commentId === "string") {
      commentId = body.commentId.trim();
    }
  }
  if (!commentId) {
    return NextResponse.json(
      { error: "commentId is required." },
      { status: 400 }
    );
  }
  const result = await deletePostCommentRecord(
    session.familyId,
    decodedPostId,
    commentId,
    session.member.id
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
