/**
 * GIF search through GIPHY (https://developers.giphy.com). Optional: set NEXT_PUBLIC_GIPHY_API_KEY to turn it on.
 * (Google shut the Tenor API down on 30 June 2026, so GIPHY is the provider here.)
 *
 * Privacy: what you type in GIF search goes to GIPHY. The chosen GIF's link travels inside the encrypted message,
 * but loading it means GIPHY's servers see the viewer's IP address, as with any picture on the web.
 * GIFs uploaded from your own device do not touch GIPHY: they are encrypted like photos.
 */

export type Gif = { id: string; title: string; url: string; w: number; h: number; preview: string; pw: number; ph: number };

export const GIPHY_KEY = process.env.NEXT_PUBLIC_GIPHY_API_KEY ?? "";
export const gifSearchEnabled = GIPHY_KEY.length > 0;

type GiphyImage = { url: string; width: string; height: string };
type GiphyItem = { id: string; title: string; images: { fixed_width: GiphyImage; fixed_width_downsampled?: GiphyImage; downsized?: GiphyImage } };

/** Only GIPHY's own image hosts are shown, so a message cannot be used to load a tracking image from anywhere else. */
export function isAllowedGifUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && /^(media\d?|i)\.giphy\.com$/.test(u.hostname);
  } catch {
    return false;
  }
}

export async function searchGifs(query: string, signal?: AbortSignal): Promise<Gif[]> {
  if (!gifSearchEnabled) return [];
  const q = query.trim();
  const params = new URLSearchParams({ api_key: GIPHY_KEY, limit: "24", rating: "pg-13"});
  if (q) {
    params.set("q", q);
    params.set("lang", "en");
  }
  const res = await fetch(`https://api.giphy.com/v1/gifs/${q ? "search" : "trending"}?${params}`, { signal, referrerPolicy: "no-referrer" });
  if (!res.ok) throw new Error(res.status === 429 ? "GIF search is busy. Try again in a minute." : "GIF search is not available right now.");
  const body = (await res.json()) as { data: GiphyItem[] };
  return body.data
    .map((g) => {
      const send = g.images.fixed_width;
      const preview = g.images.fixed_width_downsampled ?? send;
      return {
        id: g.id,
        title: g.title || "GIF",
        url: send.url,
        w: Number(send.width) || 200,
        h: Number(send.height) || 150,
        preview: preview.url,
        pw: Number(preview.width) || 200,
        ph: Number(preview.height) || 150,
      };
    })
    .filter((g) => isAllowedGifUrl(g.url) && isAllowedGifUrl(g.preview));
}
