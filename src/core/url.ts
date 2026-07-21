import type { CardType } from "./types";

const INTERNAL_SCHEMES = [
  "chrome:",
  "chrome-extension:",
  "devtools:",
  "about:",
  "edge:",
  "brave:",
  "view-source:"
];

const COMPOUND_SUFFIXES = new Set([
  "co.uk",
  "org.uk",
  "com.cn",
  "net.cn",
  "org.cn",
  "com.au",
  "co.jp",
  "co.kr",
  "com.sg",
  "com.hk",
  "com.tw"
]);

export function isSupportedUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (INTERNAL_SCHEMES.includes(url.protocol)) return false;
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "file:";
  } catch {
    return false;
  }
}

export function normalizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    if ((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443")) {
      url.port = "";
    }
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }
    const serialized = url.toString();
    if ((url.protocol === "http:" || url.protocol === "https:") && url.pathname === "/" && !url.search) {
      return serialized.slice(0, -1);
    }
    return serialized;
  } catch {
    return value.trim();
  }
}

export function inferCardType(url: string): CardType {
  if (url.startsWith("file:") && /\.html?(?:$|[?#])/i.test(url)) return "html";
  return "web";
}

export function displayDomain(value: string | undefined): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol === "file:") return "Local HTML";
    return url.hostname.replace(/^www\./i, "") || url.protocol.replace(":", "");
  } catch {
    return value;
  }
}

export function registrableDomain(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol === "file:") return "local-html";
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return host;
    const parts = host.split(".").filter(Boolean);
    if (parts.length <= 2) return host;
    const suffix = parts.slice(-2).join(".");
    return COMPOUND_SUFFIXES.has(suffix) ? parts.slice(-3).join(".") : parts.slice(-2).join(".");
  } catch {
    return "other";
  }
}
