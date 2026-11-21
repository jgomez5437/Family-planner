import { NextResponse } from "next/server";
import { addFamilyMember, getAuthenticatedSession } from "@/db/repository";

export async function POST(request: Request) {
  const session = await getAuthenticatedSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const result = await addFamilyMember(
    session.familyId,
    {
      name: String(body.name || ""),
      emoji: String(body.emoji || (body.isChild ? "🧒" : "🧑")),
      color: String(body.color || "#1F6F5C"),
      light: String(body.light || "#E4F1EC"),
      isChild: Boolean(body.isChild),
      email: typeof body.email === "string" ? body.email : null,
    },
    session.member.id
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ member: result.member }, { status: 201 });
}
