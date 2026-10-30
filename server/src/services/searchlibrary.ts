import * as cheerio from "cheerio";
import makeFetchCookie from "fetch-cookie";

const BASE = "https://catalog.santacruzpl.org/polaris/search/";
const CTX = "1.1033.0.0.1";

type Branches = Record<string, { available: number; total: number }>;

export type Availability = {
  bibid: string;
  title: string;
  author?: string;
  format?: string;
  systemAvailable?: number;
  systemTotal?: number;
  branches: Branches;
};

export async function checkIsbnAvailability(isbn: string): Promise<Availability | null> {
  const term = isbn.replace(/[^0-9Xx]/g, "");
  if (!term) throw new Error("Provide a valid isbn");

  const clean = (s: string) => s.replace(/\s+/g, " ").trim();
  const fetchc = makeFetchCookie(fetch);

  const get = async (path: string, params: Record<string, string | number>, xhr = false) => {
    const url = new URL(path, BASE);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0",
    };
    if (xhr) headers["X-Requested-With"] = "XMLHttpRequest";
    const res = await fetchc(url.toString(), { headers });
    if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
    return { text: await res.text(), url: res.url };
  };

  const search = await get("searchresults.aspx", {
    ctx: CTX,
    type: "Term",
    by: "ISBN",
    term,
    sort: "RELEVANCE",
    limit: "",
    query: "",
    page: 0,
  });

  let match: Omit<Availability, "branches"> & { pos: number };

  if (search.url.includes("title.aspx")) {
    const bibid = search.url.match(/cn=(\d+)/)?.[1];
    if (!bibid) return null;
    match = { bibid, title: clean(cheerio.load(search.text)("title").text()), pos: 1 };
  } else {
    const { text } = await get("components/ajaxResults.aspx", { page: 1, hpp: 100 }, true);
    const $ = cheerio.load(text);
    const items: (typeof match)[] = [];

    $("div.content-module--search-result").each((i, el) => {
      const item = $(el);
      const link = item.find("a.nsm-brief-action-link").first();
      const bibid = link.attr("href")?.match(/cn=(\d+)/)?.[1];
      if (!bibid) return;
      const m = clean(item.text()).match(/System Availability:\s*(\d+)\s*\(of\s*(\d+)\)/);
      items.push({
        bibid,
        title: clean(link.text()),
        author:
          clean(item.find(".nsm-brief-primary-author-group .nsm-browse-text").first().text()) ||
          undefined,
        format: item.find("img.c-title-detail-formats__img[alt]").first().attr("alt"),
        systemAvailable: m ? Number(m[1]) : undefined,
        systemTotal: m ? Number(m[2]) : undefined,
        pos: i + 1,
      });
    });

    const found = items.find((r) => r.format === "Book") ?? items[0];
    if (!found) return null;
    match = found;
  }

  const { text } = await get(
    "components/ajaxavailability.aspx",
    { fp: 1, level: "local", morelink: 0, pos: match.pos, bibid: match.bibid, displayAeonOnly: 0 },
    true,
  );

  const $ = cheerio.load(text);
  const branches: Branches = {};
  $("tr").each((_, tr) => {
    const m = clean($(tr).text()).match(/^(.+?)\s*\((\d+) of (\d+) available\)$/);
    if (m) branches[m[1]] = { available: Number(m[2]), total: Number(m[3]) };
  });

  const { pos: _pos, ...rest } = match;
  return { ...rest, branches };
}
