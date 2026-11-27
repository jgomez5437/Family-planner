import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";
import { deleteUserAccount, getAuthenticatedSession } from "@/db/repository";

export async function POST(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const password = typeof body?.password === "string" ? body.password : "";

    const result = await deleteUserAccount(
      session.familyId,
      session.member.id,
      password
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    await clearSessionCookie();
    return NextResponse.json({
      ok: true,
      familyDeleted: result.familyDeleted,
    });
  } catch (err) {
    console.error("Delete account error:", err);
    return NextResponse.json(
      { error: "Unable to delete your account right now." },
      { status: 500 }
    );
  }
}
