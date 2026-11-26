import { NextResponse } from "next/server";
import {
  forfeitGameRecord,
  getAuthenticatedSession,
  makeGameMoveRecord,
  respondToGameInviteRecord,
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
  const decodedId = decodeURIComponent(id);

  try {
    const body = await request.json().catch(() => ({}));
    const action = body?.action;

    if (action === "accept" || action === "decline" || action === "cancel") {
      const result = await respondToGameInviteRecord(
        session.familyId,
        decodedId,
        session.member.id,
        action
      );
      if (!result.ok) {
        return NextResponse.json(
          { error: result.error },
          { status: result.status }
        );
      }
      return NextResponse.json({ game: result.game });
    }

    if (action === "move") {
      const result = await makeGameMoveRecord(
        session.familyId,
        decodedId,
        session.member.id,
        body?.move
      );
      if (!result.ok) {
        return NextResponse.json(
          { error: result.error },
          { status: result.status }
        );
      }
      return NextResponse.json({ game: result.game });
    }

    if (action === "forfeit") {
      const result = await forfeitGameRecord(
        session.familyId,
        decodedId,
        session.member.id
      );
      if (!result.ok) {
        return NextResponse.json(
          { error: result.error },
          { status: result.status }
        );
      }
      return NextResponse.json({ game: result.game });
    }

    return NextResponse.json(
      { error: "Unknown game action." },
      { status: 400 }
    );
  } catch (err) {
    console.error("Update game error:", err);
    return NextResponse.json(
      { error: "Could not update game." },
      { status: 500 }
    );
  }
}
