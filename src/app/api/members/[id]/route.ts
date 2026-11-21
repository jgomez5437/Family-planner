import { NextResponse } from "next/server";
import {
  deleteFamilyMember,
  getAuthenticatedSession,
  updateFamilyMember,
} from "@/db/repository";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getAuthenticatedSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = await request.json();

  // Only allow changing password on your own account
  const password =
    id === session.member.id && typeof body.password === "string"
      ? body.password
      : undefined;

  const result = await updateFamilyMember(session.familyId, id, {
    name: typeof body.name === "string" ? body.name : undefined,
    emoji: typeof body.emoji === "string" ? body.emoji : undefined,
    color: typeof body.color === "string" ? body.color : undefined,
    light: typeof body.light === "string" ? body.light : undefined,
    isChild: typeof body.isChild === "boolean" ? body.isChild : undefined,
    email: body.email !== undefined ? body.email : undefined,
    password,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ member: result.member });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getAuthenticatedSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const result = await deleteFamilyMember(session.familyId, id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
