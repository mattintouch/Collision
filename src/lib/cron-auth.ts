// Autorisation des routes cron : le scheduler Vercel présente
// Authorization: Bearer CRON_SECRET ; un membre de l'équipe CONNECTÉ peut
// aussi déclencher depuis son navigateur (session Supabase), pour tester sans
// terminal. Sans secret configuré ET sans session : refus.

import { createClient } from "./supabase/server";

export async function cronAutorise(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") === `Bearer ${secret}`) return true;
  try {
    const { data } = await createClient().auth.getUser();
    return !!data.user?.email;
  } catch {
    return false;
  }
}
