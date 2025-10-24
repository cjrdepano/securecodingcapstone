const ResearchDAO = require("../data/research-dao").ResearchDAO;
const needle = require("needle");
const { environmentalScripts } = require("../../config/config");

function ResearchHandler(db) {
  "use strict";

  const researchDAO = new ResearchDAO(db); // kept for future use

  // ---- Server-side allowlist for upstreams (constant URLs) ----
  // Choose ONE as default, or let user select a source from this fixed set via ?source=key
  const ALLOWED_SOURCES = Object.freeze({
    yahoo: "https://query1.finance.yahoo.com/v7/finance/quote",
    // add more fixed endpoints if you truly need them:
    // gh: "https://api.github.com/some/endpoint",
    // demo: "https://jsonplaceholder.typicode.com/posts",
  });

  // basic ticker format: letters/digits and . or -, 1–10 chars
  const TICKER_RE = /^[A-Z0-9.\-]{1,10}$/;

  this.displayResearch = async (req, res) => {
    const hasSymbol = typeof req.query.symbol !== "undefined";

    // If no params, just render the page
    if (!hasSymbol) {
      return res.render("research", { environmentalScripts });
    }

    try {
      // 1) Validate and normalize symbol
      const rawSymbol = String(req.query.symbol || "");
      const symbol = rawSymbol.toUpperCase();
      if (!TICKER_RE.test(symbol)) {
        return res.status(400).send("Invalid symbol");
      }

      // 2) Pick an upstream from a fixed allowlist (no user control over URL)
      const sourceKey = String(req.query.source || "yahoo");
      const endpoint = ALLOWED_SOURCES[sourceKey];
      if (!endpoint) return res.status(400).send("Unsupported source");

      // 3) Build GET query params; URL stays constant for CodeQL
      //    For Yahoo Finance the param is "symbols", adjust to your upstream’s API.
      const query = { symbols: symbol };

      // 4) Fetch with strong limits (no redirects, short timeouts)
      const options = {
        follow_max: 0,         // no redirects
        open_timeout: 8000,
        response_timeout: 8000,
        read_timeout: 8000,
        compressed: true,
        // We can parse as text to keep generic handling:
        parse: false,
        // If endpoint requires a UA or headers, add them here:
        // headers: { 'User-Agent': 'secure-app/1.0' }
      };

      // NOTE: for GET, needle treats the second argument as querystring parameters.
      // URL is a constant from our allowlist, so CodeQL won’t mark SSRF.
      const resp = await needle("get", endpoint, query, options);

      if (resp.statusCode < 200 || resp.statusCode >= 300) {
        return res.status(502).send("Upstream error");
      }

      // 5) Cap response size (1 MB)
      const body =
        typeof resp.body === "string" ? resp.body : resp.body?.toString("utf8");
      if (!body) return res.status(502).send("Empty upstream response");
      if (body.length > 1_000_000) return res.status(413).send("Response too large");

      // 6) Return as text to avoid reflecting raw HTML/JS from upstream
      res.type("text/plain");
      return res
        .status(200)
        .send(`The following is the stock information you requested.\n\n${body}`);
    } catch (e) {
      return res.status(400).send("Bad request");
    }
  };
}

module.exports = ResearchHandler;
