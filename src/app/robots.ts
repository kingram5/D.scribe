import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Public marketing + legal surfaces are crawlable; the app itself and the API are not.
// Served at /robots.txt (the middleware lists it as a public path).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/pricing", "/about", "/blog", "/discover", "/legal/"],
        disallow: ["/api/", "/dashboard", "/project/", "/settings", "/auth/", "/login", "/unauthorized"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
