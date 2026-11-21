import { NextResponse } from "next/server";
import { saveMedicationRecord } from "@/db/repository";

export async function POST(request: Request) {
  const body = await request.json();
  const med = await saveMedicationRecord(
    body.med,
    true,
    body.currentUser || "mom"
  );
  return NextResponse.json({ med }, { status: 201 });
}
