import { NextResponse } from "next/server";
import { validatePostImages } from "@/lib/imageValidation";
import { createPostRecord, getAuthenticatedSession } from "@/db/repository";

export async function POST(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const rawPost = body?.post || body || {};
    const content = typeof rawPost.content === "string" ? rawPost.content : "";
    const type = typeof rawPost.type === "string" && rawPost.type.trim()
      ? rawPost.type.trim()
      : "Update";
    const id = typeof rawPost.id === "string" && rawPost.id.trim()
      ? rawPost.id.trim()
      : undefined;

    const imagesCheck = validatePostImages(rawPost.images);
    if (!imagesCheck.ok) {
      return NextResponse.json(
        { error: imagesCheck.error },
        { status: imagesCheck.status }
      );
    }

    if (!content.trim() && imagesCheck.images.length === 0) {
      return NextResponse.json(
        { error: "Please write a message or attach at least one photo." },
        { status: 400 }
      );
    }

    const post = await createPostRecord(
      session.familyId,
      {
        id,
        type,
        content,
        images: imagesCheck.images,
      },
      session.member.id
    );
    return NextResponse.json({ post }, { status: 201 });
  } catch (err) {
    console.error("Create post error:", err);
    return NextResponse.json(
      { error: "Could not save your post. Please try again." },
      { status: 500 }
    );
  }
}
