import FamilyApp from "@/components/FamilyApp";
import { getFamilyState } from "@/db/repository";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const initialState = await getFamilyState();
  return <FamilyApp initialState={initialState} />;
}
