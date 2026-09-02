import { getCurrentUser } from "@/lib/auth";
import HomeClient from "./HomeClient";

export default async function HomePage() {
  const user = await getCurrentUser();
  return <HomeClient demo={!user} />;
}
