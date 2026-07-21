import { describe, expect, it } from "vitest";
import { displayDomain, inferCardType, isSupportedUrl, normalizeUrl, registrableDomain } from "../src/core/url";

describe("URL rules", () => {
  it("normalizes fragments, default ports, host case, and trailing slashes", () => {
    expect(normalizeUrl("HTTPS://Example.COM:443/docs/?q=keep#section")).toBe("https://example.com/docs?q=keep");
    expect(normalizeUrl("http://example.com:80/#fragment")).toBe("http://example.com");
  });

  it("preserves meaningful queries", () => {
    expect(normalizeUrl("https://example.com/search/?q=tab&sort=new#top"))
      .toBe("https://example.com/search?q=tab&sort=new");
  });

  it("only accepts restorable page schemes", () => {
    expect(isSupportedUrl("https://example.com")).toBe(true);
    expect(isSupportedUrl("file:///Users/test/sample.html")).toBe(true);
    expect(isSupportedUrl("chrome://settings")).toBe(false);
    expect(isSupportedUrl("devtools://devtools/bundled/inspector.html")).toBe(false);
  });

  it("recognizes local HTML and registrable domains", () => {
    expect(inferCardType("file:///tmp/research.HTML#part")).toBe("html");
    expect(registrableDomain("https://docs.example.co.uk/a")).toBe("example.co.uk");
    expect(displayDomain("https://www.example.com/a")).toBe("example.com");
  });
});
