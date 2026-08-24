export interface FetchedPage {
  title: string;
  url: string;
  content: string;
  published?: string | null;
}

function searchConfigured(): boolean {
  return Boolean(process.env.SEARCH_API_KEY);
}

export function isResearchEnabled(): boolean {
  return searchConfigured();
}

export function searchProvider(): string {
  return (process.env.SEARCH_API_PROVIDER || "tavily").toLowerCase();
}

async function searchTavily(query: string): Promise<FetchedPage[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: process.env.SEARCH_API_KEY,
      query,
      search_depth: "basic",
      include_raw_content: true,
      max_results: 3,
    }),
  });
  if (!res.ok) return [];
  const data = await res.json() as {
    results?: Array<{ title?: string; url?: string; raw_content?: string; content?: string; published_date?: string }>;
  };
  return (data.results ?? [])
    .filter((row) => row.url && (row.raw_content || row.content))
    .map((row) => ({
      title: row.title || row.url || "Untitled",
      url: row.url as string,
      content: String(row.raw_content || row.content || ""),
      published: row.published_date ?? null,
    }));
}

async function searchBrave(query: string): Promise<FetchedPage[]> {
  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=3`, {
    headers: { Accept: "application/json", "X-Subscription-Token": process.env.SEARCH_API_KEY ?? "" },
  });
  if (!res.ok) return [];
  const data = await res.json() as {
    web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
  };
  const hits = data.web?.results ?? [];
  const pages: FetchedPage[] = [];
  for (const hit of hits.slice(0, 3)) {
    if (!hit.url) continue;
    try {
      const page = await fetch(hit.url, { headers: { "User-Agent": "D.scribe research/1.0" } });
      const html = page.ok ? await page.text() : "";
      const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
      pages.push({
        title: hit.title || hit.url,
        url: hit.url,
        content: text.slice(0, 20_000) || hit.description || "",
        published: null,
      });
    } catch {
      pages.push({
        title: hit.title || hit.url,
        url: hit.url,
        content: hit.description || "",
        published: null,
      });
    }
  }
  return pages;
}

export async function searchPages(query: string): Promise<FetchedPage[]> {
  if (!searchConfigured()) return [];
  try {
    return searchProvider() === "brave" ? await searchBrave(query) : await searchTavily(query);
  } catch {
    return [];
  }
}

export function dedupePagesByUrl(pages: FetchedPage[]): FetchedPage[] {
  const seen = new Set<string>();
  const out: FetchedPage[] = [];
  for (const page of pages) {
    const key = page.url.replace(/\/$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(page);
  }
  return out;
}
