import { NextResponse } from "next/server";
import { clearSessionCookie, getSessionTokenFromCookies } from "@/lib/auth";
import { deleteSession } from "@/db/repository";

export async function POST() {
  const token = await getSessionTokenFromCookies();
  await deleteSession(token);
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
