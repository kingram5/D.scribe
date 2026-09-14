import { notFound } from "next/navigation";
import BookshelfDemo from "./BookshelfDemo";

// Dev-only preview of the dashboard bookshelf with mock data, so the shelf can be
// screenshotted and iterated without a Supabase login. Never served in production:
// the middleware only lets /dev/* through when NODE_ENV is "development", and this
// page 404s on its own as a second guard.
export default function DevBookshelfPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <BookshelfDemo />;
}
