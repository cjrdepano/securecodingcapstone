const ProfileDAO = require("../data/profile-dao").ProfileDAO;
const ESAPI = require("node-esapi");
const { environmentalScripts } = require("../../config/config");

/* The ProfileHandler must be constructed with a connected db */
function ProfileHandler(db) {
  "use strict";

  const profile = new ProfileDAO(db);

  this.displayProfile = (req, res, next) => {
    const { userId } = req.session;

    profile.getByUserId(parseInt(userId, 10), (err, doc) => {
      if (err) return next(err);
      doc.userId = userId;

      // NOTE: website appears in HTML context here
      doc.website = ESAPI.encoder().encodeForHTML(doc.website);

      return res.render("profile", { ...doc, environmentalScripts });
    });
  };

  this.handleProfileUpdate = (req, res, next) => {
    let { firstName, lastName, ssn, dob, address, bankAcc, bankRouting } = req.body;

    // ✅ FIX: avoid catastrophic backtracking
    // Original: /([0-9]+)+\#/  <-- nested '+' leads to ReDoS
    // Requirement: numbers followed by a single '#', e.g. "123456#"
    // Use a tight, anchored pattern with a sane length cap.
    const ROUTING_RE = /^\d{1,17}#$/; // or /^\d{9}#$/ if you want exactly 9 digits

    if (!ROUTING_RE.test(String(bankRouting || ""))) {
      const firstNameSafeString = firstName;
      return res.render("profile", {
        updateError:
          "Bank Routing number does not comply with requirements for format specified",
        firstNameSafeString,
        lastName,
        ssn,
        dob,
        address,
        bankAcc,
        bankRouting,
        environmentalScripts,
      });
    }

    const { userId } = req.session;

    profile.updateUser(
      parseInt(userId, 10),
      firstName,
      lastName,
      ssn,
      dob,
      address,
      bankAcc,
      bankRouting,
      (err, user) => {
        if (err) return next(err);

        user.updateSuccess = true;
        user.userId = userId;

        return res.render("profile", { ...user, environmentalScripts });
      }
    );
  };
}

module.exports = ProfileHandler;
