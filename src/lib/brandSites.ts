/** メーカー公式／日本代理店向けのボール検索 */

export type BrandSiteInfo = {
  brand: string;
  aliases: string[];
  /** 公式サイトトップ */
  officialUrl: string;
  /** 日本向け（代理店など） */
  japanUrl?: string;
};

const BRAND_SITES: BrandSiteInfo[] = [
  {
    brand: "HI-SP",
    aliases: ["ハイスポーツ", "ハイスポ", "hi-sp", "hisp", "hi sp"],
    officialUrl: "https://hi-sp.co.jp/",
    japanUrl: "https://hi-sp.co.jp/",
  },
  {
    brand: "Storm",
    aliases: ["ストーム"],
    officialUrl: "https://www.stormbowling.com/",
    japanUrl: "https://hi-sp.co.jp/",
  },
  {
    brand: "Roto Grip",
    aliases: ["ロトグリップ", "rotogrip"],
    officialUrl: "https://www.rotogrip.com/",
    japanUrl: "https://hi-sp.co.jp/",
  },
  {
    brand: "900 Global",
    aliases: ["900global", "ナインハンドレッド"],
    officialUrl: "https://www.900global.com/",
    japanUrl: "https://hi-sp.co.jp/",
  },
  {
    brand: "Motiv",
    aliases: ["モーティブ"],
    officialUrl: "https://www.motivbowling.com/",
  },
  {
    brand: "Hammer",
    aliases: ["ハンマー"],
    officialUrl: "https://www.hammerbowling.com/",
    japanUrl: "https://www.sunbridge-group.com/",
  },
  {
    brand: "Brunswick",
    aliases: ["ブランズウィック"],
    officialUrl: "https://www.brunswickbowling.com/",
    japanUrl: "https://www.sunbridge-group.com/",
  },
  {
    brand: "Track",
    aliases: ["トラック"],
    officialUrl: "https://www.trackbowling.com/",
    japanUrl: "https://www.sunbridge-group.com/",
  },
  {
    brand: "Radical",
    aliases: ["ラジカル"],
    officialUrl: "https://www.radicalbowling.com/",
    japanUrl: "https://www.sunbridge-group.com/",
  },
  {
    brand: "ABS 300",
    aliases: ["ABS", "ナノデス", "nanodesu", "アメリカンボウリングサービス"],
    officialUrl: "https://www.absbowling.co.jp/",
    japanUrl: "https://www.absbowling.co.jp/",
  },
  {
    brand: "DV8",
    aliases: ["ディーブイエイト"],
    officialUrl: "https://www.dv8bowling.com/",
    japanUrl: "https://www.sunbridge-group.com/",
  },
  {
    brand: "Ebonite",
    aliases: ["エボナイト"],
    officialUrl: "https://www.ebonite.com/",
    japanUrl: "https://www.sunbridge-group.com/",
  },
  {
    brand: "Columbia 300",
    aliases: ["コロンビア", "columbia"],
    officialUrl: "https://www.columbia300.com/",
  },
  {
    brand: "Pyramid",
    aliases: ["ピラミッド"],
    officialUrl: "https://www.pyramidbowling.com/",
  },
  {
    brand: "SWAG",
    aliases: ["スワッグ"],
    officialUrl: "https://www.swagbowling.com/",
  },
];

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function normalizeBrandKey(brand: string): string {
  return brand.trim().toLowerCase().replace(/\s+/g, " ");
}

export function findBrandSite(brand: string): BrandSiteInfo | null {
  const key = normalizeBrandKey(brand);
  if (!key) return null;
  return (
    BRAND_SITES.find((b) => normalizeBrandKey(b.brand) === key) ??
    BRAND_SITES.find((b) =>
      b.aliases.some((a) => normalizeBrandKey(a) === key || key.includes(normalizeBrandKey(a))),
    ) ??
    BRAND_SITES.find((b) => key.includes(normalizeBrandKey(b.brand))) ??
    null
  );
}

export function listKnownBrands(): string[] {
  return BRAND_SITES.map((b) => b.brand);
}

/** 公式サイト内検索（Google site:） */
export function manufacturerOfficialSearchUrl(brand: string, ballName: string): string {
  const site = findBrandSite(brand);
  const q = [ballName.trim(), brand.trim(), "bowling"].filter(Boolean).join(" ");
  if (site) {
    const host = hostOf(site.officialUrl);
    return `https://www.google.com/search?q=${encodeURIComponent(`site:${host} ${q}`)}`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

/** 日本代理店サイト内検索（あれば）。なければ公式検索 */
export function manufacturerJapanSearchUrl(brand: string, ballName: string): string | null {
  const site = findBrandSite(brand);
  if (!site?.japanUrl) return null;
  const host = hostOf(site.japanUrl);
  const q = [ballName.trim(), brand.trim()].filter(Boolean).join(" ");
  // ハイスポーツは ?s= でサイト内検索
  if (host.includes("hi-sp.co.jp")) {
    return `https://hi-sp.co.jp/?s=${encodeURIComponent(q)}`;
  }
  // サンブリッジも ?s=
  if (host.includes("sunbridge-group.com")) {
    return `https://www.sunbridge-group.com/?s=${encodeURIComponent(q)}`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(`site:${host} ${q}`)}`;
}

/** マイボール登録用：優先する検索先（日本代理店 → 公式） */
export function manufacturerSearchUrl(brand: string, ballName: string): string {
  return (
    manufacturerJapanSearchUrl(brand, ballName) ??
    manufacturerOfficialSearchUrl(brand, ballName)
  );
}

export function manufacturerHomeUrl(brand: string): string | null {
  return findBrandSite(brand)?.officialUrl ?? null;
}
