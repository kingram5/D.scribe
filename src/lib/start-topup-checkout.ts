import type { TopupSku } from "@/lib/topups";

export async function startTopupCheckout(sku: TopupSku, returnTo?: string): Promise<void> {
  const res = await fetch("/api/stripe/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      topup: sku,
      return_to: returnTo ?? (typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : undefined),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (data.url) {
    window.location.assign(data.url);
    return;
  }
  throw new Error(typeof data.error === "string" ? data.error : "Couldn't start checkout.");
}
