const UserDAO = require("./user-dao").UserDAO;

/* The ContributionsDAO must be constructed with a connected database object */
function ContributionsDAO(db) {
  "use strict";

  /* If this constructor is called without the "new" operator, "this" points
   * to the global object. Log a warning and call it correctly. */
  if (false === (this instanceof ContributionsDAO)) {
    // eslint-disable-next-line no-console
    console.log("Warning: ContributionsDAO constructor called without 'new' operator");
    return new ContributionsDAO(db);
  }

  const contributionsDB = db.collection("contributions");
  const userDAO = new UserDAO(db);

  /**
   * Upsert contribution percentages for a user.
   */
  this.update = (userId, preTax, afterTax, roth, callback) => {
    const parsedUserId = parseInt(userId, 10);

    // Always store a consistent numeric userId and only the fields we expect
    const doc = {
      userId: parsedUserId,
      preTax,
      afterTax,
      roth,
    };

    contributionsDB
      .updateOne(
        { userId: parsedUserId }, // match on numeric id to avoid type mismatches
        { $set: doc },
        { upsert: true }
      )
      .then(() => {
        // add user details for rendering
        userDAO.getUserById(parsedUserId, (err, user) => {
          if (err) return callback(err, null);

          const result = {
            ...doc,
            userName: user.userName,
            firstName: user.firstName,
            lastName: user.lastName,
          };
          return callback(null, result);
        });
      })
      .catch((err) => callback(err, null));
  };

  /**
   * Get contribution percentages for a user. If none exist, return defaults.
   */
  this.getByUserId = (userId, callback) => {
    const parsedUserId = parseInt(userId, 10);

    contributionsDB.findOne({ userId: parsedUserId }, (err, contributions) => {
      if (err) return callback(err, null);

      // Default contributions if not set
      const base = contributions || { preTax: 2, afterTax: 2, roth: 2 };

      userDAO.getUserById(parsedUserId, (err2, user) => {
        if (err2) return callback(err2, null);

        const result = {
          ...base,
          userId: parsedUserId,
          userName: user.userName,
          firstName: user.firstName,
          lastName: user.lastName,
        };

        return callback(null, result);
      });
    });
  };
}

module.exports = { ContributionsDAO };
