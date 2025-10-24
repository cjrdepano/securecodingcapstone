const ContributionsDAO = require("../data/contributions-dao").ContributionsDAO;
const { environmentalScripts } = require("../../config/config");

/* The ContributionsHandler must be constructed with a connected db */
function ContributionsHandler(db) {
  "use strict";

  const contributionsDAO = new ContributionsDAO(db);

  this.displayContributions = (req, res, next) => {
    const { userId } = req.session;

    contributionsDAO.getByUserId(userId, (error, contrib) => {
      if (error) return next(error);

      // set for nav menu items
      contrib.userId = userId;
      return res.render("contributions", {
        ...contrib,
        environmentalScripts,
      });
    });
  };

  this.handleContributionsUpdate = (req, res, next) => {
    "use strict";

    // ---- secure numeric parsing (no eval) ----
    const toNumber = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : NaN;
    };

    const preTax = toNumber(req.body.preTax);
    const afterTax = toNumber(req.body.afterTax);
    const roth = toNumber(req.body.roth);

    const { userId } = req.session;

    // ---- validation: numbers, non-negative, reasonable single-field bounds ----
    const invalidField =
      [preTax, afterTax, roth].some((n) => Number.isNaN(n) || n < 0 || n > 30);

    if (invalidField) {
      return res.render("contributions", {
        updateError: "Invalid contribution percentages",
        userId,
        environmentalScripts,
      });
    }

    // ---- business rule: total percentage <= 30 ----
    if (preTax + afterTax + roth > 30) {
      return res.render("contributions", {
        updateError: "Contribution percentages cannot exceed 30 %",
        userId,
        environmentalScripts,
      });
    }

    // ---- persist to DB ----
    contributionsDAO.update(userId, preTax, afterTax, roth, (err, contributions) => {
      if (err) return next(err);

      contributions.updateSuccess = true;
      return res.render("contributions", {
        ...contributions,
        environmentalScripts,
      });
    });
  };
}

module.exports = ContributionsHandler;
