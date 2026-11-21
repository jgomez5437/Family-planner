import { NextResponse } from "next/server";
import { deleteMedicationRecord, saveMedicationRecord } from "@/db/repository";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const body = await request.json();
  const med = await saveMedicationRecord(
    { ...body.med, id },
    false,
    body.currentUser || "mom"
  );
  return NextResponse.json({ med });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  await deleteMedicationRecord(id);
  return NextResponse.json({ ok: true });
}
