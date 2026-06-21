import { redirect } from "next/navigation";
import { getShows } from "@/lib/data";

export default async function Home() {
  const shows = await getShows();
  const first = shows[0]?.slug ?? "gdiy";
  redirect(`/${first}/board`);
}
