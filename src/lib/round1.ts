/** ROUND1 プロショップ商品ビューア（GitHub Pages） */
export const ROUND1_VIEWER_URL = "https://okajun777.github.io/round1-proshop-viewer/";

export function round1SearchUrl(query?: string, category = "ball"): string {
  const url = new URL(ROUND1_VIEWER_URL);
  if (category) url.searchParams.set("cat", category);
  if (query?.trim()) url.searchParams.set("q", query.trim());
  return url.toString();
}
