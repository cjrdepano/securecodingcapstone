const ResearchDAO = require("../data/research-dao").ResearchDAO;
const needle = require("needle");
const dns = require("dns").promises;
const { URL } = require("url");
const { environmentalScripts } = require("../../config/config");

function ResearchHandler(db) {
  "use strict";

  const researchDAO = new ResearchDAO(db); // kept for future use

  // ---- SSRF protections ----
  const ALLOWED_HOSTS = new Set([
    // TODO: keep only the hosts your app truly needs to call
    "api.github.com",
    "query1.finance.yahoo.com",
    "jsonplaceholder.typicode.com"
  ]);

  function isPrivateIp(ip) {
    // RFC1918 + loopback + link-local + CGNAT (basic checks)
    return (
      ip.startsWith("10.") ||
      ip.startsWith("192.168.") ||
      (ip.startsWith("172.") && (() => { const n = +ip.split(".")[1]; return n >= 16 && n <= 31; })()) ||
      ip === "127.0.0.1" || ip === "::1" ||
      ip.startsWith("169.254.") || ip.startsWith("0.") || ip.startsWith("100.64.")
    );
  }

  this.displayResearch = async (req, res) => {
    const hasSymbol = typeof req.query.symbol !== "undefined";
    const hasUrl = typeof req.query.url !== "undefined";

    // If no query params, just render the page
    if (!hasSymbol || !hasUrl) {
      return res.render("research", { environmentalScripts });
    }

    try {
      // 1) Validate symbol (restrict input surface)
      const rawSymbol = String(req.query.symbol || "");
      // typical ticker format: letters / digits / . / -, up to 10 chars
      const symbol = rawSymbol.toUpperCase();
      if (!/^[A-Z0-9.\-]{1,10}$/.test(symbol)) {
        return res.status(400).send("Invalid symbol");
      }

      // 2) Parse and validate base URL
      const baseUrl = new URL(String(req.query.url || ""));
      if (!["http:", "https:"].includes(baseUrl.protocol)) {
        return res.status(400).send("Unsupported scheme");
      }
      if (!ALLOWED_HOSTS.has(baseUrl.hostname)) {
        return res.status(400).send("Host not allowed");
      }

      // 3) DNS resolve & block private/loopback targets
      const addrs = await dns.lookup(baseUrl.hostname, { all: true });
      if (addrs.some(a => isPrivateIp(a.address))) {
        return res.status(400).send("Blocked internal address");
      }

      // 4) Build final URL by appending a *safe* symbol
      //    If your upstream expects a query param instead, replace the next line with:
      //    baseUrl.searchParams.set('symbol', symbol);
      const finalUrl = baseUrl.toString() + encodeURIComponent(symbol);

      // 5) Fetch with strong limits (no redirects, short timeouts)
      const options = {
        follow_max: 0,            // no redirects
        open_timeout: 8000,       // ms
        response_timeout: 8000,
        read_timeout: 8000,
        compressed: true,         // allow gzip/deflate
        parse: false              // we will treat as text
      };

      const resp = await needle("get", finalUrl, options);

      if (resp.statusCode < 200 || resp.statusCode >= 300) {
        return res.status(502).send("Upstream error");
      }

      // 6) Cap response size (1 MB)
      const body = typeof resp.body === "string" ? resp.body : resp.body?.toString("utf8");
      if (!body) return res.status(502).send("Empty upstream response");
      if (body.length > 1_000_000) return res.status(413).send("Response too large");

      // 7) Return as text to avoid reflecting raw HTML/JS from upstream
      res.type("text/plain");
      return res.status(200).send(
        `The following is the stock information you requested.\n\n${body}`
      );
    } catch (e) {
      return res.status(400).send("Bad request");
    }
  };
}

module.exports = ResearchHandler;
