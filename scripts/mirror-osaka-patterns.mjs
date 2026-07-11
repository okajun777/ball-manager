/**
 * Download OBF pattern PDFs into public/osaka-patterns/ so the browser
 * can fetch them same-origin (OBF itself has no CORS).
 */
import { createWriteStream } from "node:fs";
import { mkdir, readFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const schedulePath = join(root, "src", "data", "osakaSchedule.json");
const outDir = join(root, "public", "osaka-patterns");

export function patternSlugFromUrl(url) {
  const m = String(url).match(/\/Tournament\/\d+\/([^/]+)\/pattern\.pdf/i);
  if (m) return m[1];
  return String(url)
    .replace(/^https?:\/\//, "")
    .replace(/[^\w.-]+/g, "_")
    .slice(0, 80);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function download(url, dest) {
  const res = await fetch(url, {
    headers: { "User-Agent": "ball-manager-mirror/1.0" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (!res.body) throw new Error("empty body");
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

async function main() {
  const raw = await readFile(schedulePath, "utf8");
  const data = JSON.parse(raw);
  const urls = [
    ...new Set(
      (data.events ?? [])
        .map((e) => e.patternPdfUrl)
        .filter((u) => typeof u === "string" && /pattern\.pdf/i.test(u)),
    ),
  ];

  await mkdir(outDir, { recursive: true });
  let ok = 0;
  let skip = 0;
  let fail = 0;

  for (const url of urls) {
    const slug = patternSlugFromUrl(url);
    const dest = join(outDir, `${slug}.pdf`);
    if (await exists(dest)) {
      skip += 1;
      continue;
    }
    try {
      process.stdout.write(`fetch ${slug}… `);
      await download(url, dest);
      console.log("ok");
      ok += 1;
    } catch (e) {
      console.log("fail", e instanceof Error ? e.message : e);
      fail += 1;
    }
  }

  console.log(`mirrored ok=${ok} skip=${skip} fail=${fail} total=${urls.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
