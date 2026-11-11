import * as cheerio from "cheerio";
import makeFetchCookie from "fetch-cookie";
import {
  availability,
  type Availability,
} from "../../../shared/availability.ts";

const BASE = "https://catalog.santacruzpl.org/polaris/search/";
const CTX = "1.1033.0.0.1";
const MATERIAL_FORMAT_SELECTOR =
  'img.c-title-detail-formats__img[src*="/formats/"][alt]';
export const CATALOG_REQUEST_TIMEOUT_MS = 5000;

type Branches = Availability["branches"];
type Match = Omit<Availability, "branches">;

export async function checkIsbnAvailability(
  isbn: string,
  signal?: AbortSignal,
): Promise<Availability | null> {
  const term = isbn.replace(/[^0-9Xx]/g, "").toUpperCase();
  if (!term) throw new Error("Provide a valid isbn");
  signal?.throwIfAborted();

  const clean = (s: string) => s.replace(/\s+/g, " ").trim();
  const fetchc = makeFetchCookie(fetch);

  const get = async (
    path: string,
    params: Record<string, string | number>,
    xhr = false,
  ) => {
    const url = new URL(path, BASE);
    for (const [k, v] of Object.entries(params))
      url.searchParams.set(k, String(v));
    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0",
    };
    if (xhr) headers["X-Requested-With"] = "XMLHttpRequest";
    const timeout = AbortSignal.timeout(CATALOG_REQUEST_TIMEOUT_MS);
    const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const res = await fetchc(url.toString(), {
      headers,
      signal: requestSignal,
    });
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

  const searchUrl = new URL(search.url);
  const $search = cheerio.load(search.text);

  if (searchUrl.origin !== new URL(BASE).origin) {
    throw new Error("Unexpected library catalog redirect");
  }

  const isTitlePage = searchUrl.pathname.toLowerCase().endsWith("/title.aspx");
  let item = $search("html");
  let recordUrl = searchUrl;

  if (!isTitlePage) {
    if (!searchUrl.pathname.toLowerCase().endsWith("/searchresults.aspx")) {
      throw new Error("Unrecognized library catalog search page");
    }
    if (
      /No titles found\s*\(0 hits\)/i.test(clean($search(".Header").text()))
    ) {
      return null;
    }
    if (
      !$search("body.page-searchresults").length ||
      !$search("#searchResults").length
    ) {
      throw new Error("Unrecognized library catalog search page");
    }
    const { text } = await get(
      "components/ajaxResults.aspx",
      { page: 1, hpp: 100 },
      true,
    );
    const $ = cheerio.load(text);
    const items = $("div.content-module--search-result");
    if (!items.length)
      throw new Error("Unrecognized library catalog results page");
    const book = items
      .toArray()
      .find(
        (el) =>
          $(el).find(MATERIAL_FORMAT_SELECTOR).first().attr("alt")?.trim() ===
          "Book",
      );
    item = book ? $(book) : items.first();
    const href = item.find("a.nsm-brief-action-link").first().attr("href");
    if (!href) throw new Error("Unrecognized library catalog result");
    recordUrl = new URL(href, searchUrl);
  }

  const readText = (selector: string) =>
    clean(item.find(selector).first().text());
  const details = isTitlePage
    ? {
        title: readText(".nsm-long-item.nsm-e35"),
        author: readText(".nsm-long-item.nsm-e18 .nsm-browse-text"),
        totalText: readText(".nsm-long-item.nsm-e7"),
        pos:
          recordUrl.searchParams.get("pos") ??
          item
            .find(".c-title-detail-actions__list[data-item-pos]")
            .first()
            .attr("data-item-pos"),
        hasPhysicalAvailability:
          item.find("#id-drawer-body-availability").length > 0,
        fp: 0, // Title pages load availability into a drawer.
      }
    : {
        title: readText("a.nsm-brief-action-link"),
        author: readText(".nsm-brief-primary-author-group .nsm-browse-text"),
        totalText:
          clean(item.text()).match(
            /System Availability:\s*\d+\s*\(of\s*(\d+)\)/,
          )?.[1] ?? "",
        pos: recordUrl.searchParams.get("pos"),
        hasPhysicalAvailability:
          item.find('a[href*="ajaxavailability.aspx"]').length > 0,
        fp: 1, // Results lists open availability in an iframe.
      };
  const bibid = recordUrl.searchParams.get("cn");
  const pos = Number(details.pos);
  if (
    recordUrl.origin !== searchUrl.origin ||
    !recordUrl.pathname.toLowerCase().endsWith("/title.aspx") ||
    !bibid ||
    !/^\d+$/.test(bibid) ||
    !details.title ||
    !Number.isSafeInteger(pos) ||
    pos < 1
  ) {
    throw new Error("Unrecognized library catalog record");
  }

  const match: Match = {
    bibid,
    title: details.title,
    author: details.author || undefined,
    format: item.find(MATERIAL_FORMAT_SELECTOR).first().attr("alt")?.trim(),
  };
  const allowsEmptyBranches =
    /^(ebook|eaudiobook)$/i.test(match.format ?? "") ||
    /^0+$/.test(details.totalText);
  if (!details.hasPhysicalAvailability) {
    if (allowsEmptyBranches) {
      return availability.parse({ ...match, branches: {} });
    }
    throw new Error("Unrecognized library catalog holdings information");
  }

  const { text } = await get(
    "components/ajaxavailability.aspx",
    {
      fp: details.fp,
      level: "local",
      morelink: 0,
      pos,
      bibid: match.bibid,
      displayAeonOnly: 0,
    },
    true,
  );

  const $ = cheerio.load(text);
  const branches: Branches = {};
  if (!$(".availability__table").length) {
    throw new Error("Unrecognized library catalog availability page");
  }
  $(".availability__table tr.location").each((_, tr) => {
    const row = $(tr);
    const name = clean(row.find("a.group").first().text());
    const counts = clean(row.find(".resultsdate").text()).match(
      /^\((\d+) of (\d+) available\)$/,
    );
    if (!name || !counts) {
      throw new Error("Unrecognized library catalog branch availability");
    }
    branches[name] = { available: Number(counts[1]), total: Number(counts[2]) };
  });

  if (!Object.keys(branches).length && !allowsEmptyBranches) {
    throw new Error("Library catalog did not return branch availability");
  }
  return availability.parse({ ...match, branches });
}
