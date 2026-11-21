import { NextResponse } from "next/server";
import {
  deleteMedicationRecord,
  getAuthenticatedSession,
  saveMedicationRecord,
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
  const med = await saveMedicationRecord(
    session.familyId,
    { ...body.med, id },
    false,
    session.member.id
  );
  return NextResponse.json({ med });
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
  await deleteMedicationRecord(session.familyId, id);
  return NextResponse.json({ ok: true });
}
