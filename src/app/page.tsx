import { AppShell } from "@/components/AppShell";
import { getAuthenticatedSession, getFamilyState } from "@/db/repository";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getAuthenticatedSession();
  const initialState = session
    ? await getFamilyState(session.familyId, session.member.id)
    : null;
  return <AppShell initialState={initialState} />;
}
