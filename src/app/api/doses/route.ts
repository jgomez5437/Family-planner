import { NextResponse } from "next/server";
import { toggleDoseRecord } from "@/db/repository";

export async function POST(request: Request) {
  const body = await request.json();
  const result = await toggleDoseRecord(
    body.key,
    body.medId,
    body.kidId,
    body.medName,
    body.time,
    body.currentUser || "mom"
  );
  return NextResponse.json(result);
}
