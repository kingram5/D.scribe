import type { MetadataRoute } from "next";

// Public marketing + legal surfaces are crawlable; the app itself and the API are not.
// Served at /robots.txt (the middleware lists it as a public path).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/pricing", "/blog", "/discover", "/legal/"],
        disallow: ["/api/", "/dashboard", "/project/", "/settings", "/auth/", "/login", "/unauthorized"],
      },
    ],
    sitemap: "https://d-scribe.app/sitemap.xml",
  };
}
