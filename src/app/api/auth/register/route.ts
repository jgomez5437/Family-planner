import { NextResponse } from "next/server";
import { setSessionCookie } from "@/lib/auth";
import { registerAccount } from "@/db/repository";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await registerAccount({
      name: String(body.name || ""),
      email: String(body.email || ""),
      password: String(body.password || ""),
      emoji: typeof body.emoji === "string" ? body.emoji : undefined,
      color: typeof body.color === "string" ? body.color : undefined,
      light: typeof body.light === "string" ? body.light : undefined,
      mode: body.mode === "join" ? "join" : "create",
      familyName: typeof body.familyName === "string" ? body.familyName : undefined,
      inviteCode: typeof body.inviteCode === "string" ? body.inviteCode : undefined,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    await setSessionCookie(result.token, result.expiresAt);
    return NextResponse.json({ state: result.state }, { status: 201 });
  } catch (err) {
    console.error("Register error:", err);
    return NextResponse.json(
      { error: "Unable to create account right now." },
      { status: 500 }
    );
  }
}
