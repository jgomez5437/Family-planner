import { AppShell } from "@/components/AppShell";
import {
  getAuthenticatedSession,
  getFamilyPreviewByInviteCode,
  getFamilyState,
} from "@/db/repository";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<{ invite?: string; code?: string }>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const rawInvite = (params?.invite || params?.code || "").trim().toUpperCase();

  const [session, invitePreview] = await Promise.all([
    getAuthenticatedSession(),
    rawInvite ? getFamilyPreviewByInviteCode(rawInvite) : Promise.resolve(null),
  ]);

  const initialState = session
    ? await getFamilyState(session.familyId, session.member.id)
    : null;

  return (
    <AppShell
      initialState={initialState}
      initialInviteCode={invitePreview?.inviteCode || rawInvite || null}
      invitedFamilyName={invitePreview?.name || null}
      initialInviteInvalid={Boolean(rawInvite && !invitePreview)}
    />
  );
}
