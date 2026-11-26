import { notFound } from "next/navigation";
import GrowthDemo from "./GrowthDemo";

// Dev-only preview of /admin/growth with made-up numbers, so the dashboard can
// be looked at (desktop and phone width) without a Supabase login. Never served
// in production: the middleware only lets /dev/* through when NODE_ENV is
// "development", and this page 404s on its own as a second guard.
export default function DevGrowthPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <GrowthDemo />;
}
