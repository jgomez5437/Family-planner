import { NextResponse } from "next/server";
import { setSessionCookie } from "@/lib/auth";
import { loginAccount } from "@/db/repository";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await loginAccount(
      String(body.email || ""),
      String(body.password || "")
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    await setSessionCookie(result.token, result.expiresAt);
    return NextResponse.json({ state: result.state });
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json(
      { error: "Unable to sign in right now." },
      { status: 500 }
    );
  }
}
