const UserDAO = require("../data/user-dao").UserDAO;
const AllocationsDAO = require("../data/allocations-dao").AllocationsDAO;
const validator = require("validator");
const { environmentalScripts } = require("../../config/config");

/* The SessionHandler must be constructed with a connected db */
function SessionHandler(db) {
  "use strict";

  const userDAO = new UserDAO(db);
  const allocationsDAO = new AllocationsDAO(db);

  const prepareUserData = (user, next) => {
    // Generate random allocations
    const stocks = Math.floor(Math.random() * 40 + 1);
    const funds = Math.floor(Math.random() * 40 + 1);
    const bonds = 100 - (stocks + funds);

    allocationsDAO.update(user._id, stocks, funds, bonds, (err) => {
      if (err) return next(err);
    });
  };

  this.isAdminUserMiddleware = (req, res, next) => {
    if (req.session.userId) {
      return userDAO.getUserById(
        req.session.userId,
        (err, user) => (user && user.isAdmin ? next() : res.redirect("/login"))
      );
    }
    return res.redirect("/login");
  };

  this.isLoggedInMiddleware = (req, res, next) => {
    if (req.session.userId) return next();
    return res.redirect("/login");
  };

  this.displayLoginPage = (req, res) =>
    res.render("login", {
      userName: "",
      password: "",
      loginError: "",
      environmentalScripts,
    });

  this.handleLoginRequest = (req, res, next) => {
    const { userName, password } = req.body;

    userDAO.validateLogin(userName, password, (err, user) => {
      const errorMessage = "Invalid username and/or password";
      const invalidUserNameErrorMessage = "Invalid username";
      const invalidPasswordErrorMessage = "Invalid password";

      if (err) {
        if (err.noSuchUser) {
          return res.render("login", {
            userName,
            password: "",
            loginError: invalidUserNameErrorMessage,
            environmentalScripts,
          });
        } else if (err.invalidPassword) {
          return res.render("login", {
            userName,
            password: "",
            loginError: invalidPasswordErrorMessage,
            environmentalScripts,
          });
        }
        return next(err);
      }

      // regenerate session on login (comment explains why)
      req.session.userId = user._id;
      return res.redirect(user.isAdmin ? "/benefits" : "/dashboard");
    });
  };

  this.displayLogoutPage = (req, res) => {
    req.session.destroy(() => res.redirect("/"));
  };

  this.displaySignupPage = (req, res) =>
    res.render("signup", {
      userName: "",
      password: "",
      passwordError: "",
      email: "",
      userNameError: "",
      emailError: "",
      verifyError: "",
      environmentalScripts,
    });

  // -------- SAFE VALIDATION (no ReDoS) ----------
  // Keep patterns simple, anchored, and with hard length caps.
  const USER_RE = /^[A-Za-z0-9_]{3,32}$/;       // usernames: 3–32 word chars/underscore
  const NAME_RE = /^[A-Za-z][A-Za-z '\-]{0,99}$/; // first/last names: up to 100, letters plus space/-/'

  const validateSignup = (userName, firstName, lastName, password, verify, email, errors) => {
    errors.userNameError = "";
    errors.firstNameError = "";
    errors.lastNameError = "";
    errors.passwordError = "";
    errors.verifyError = "";
    errors.emailError = "";

    // normalize inputs
    userName = String(userName || "").trim();
    firstName = String(firstName || "").trim();
    lastName = String(lastName || "").trim();
    password = String(password || "");
    verify = String(verify || "");
    email = String(email || "").trim();

    if (!USER_RE.test(userName)) {
      errors.userNameError = "Invalid user name.";
      return false;
    }
    if (!NAME_RE.test(firstName)) {
      errors.firstNameError = "Invalid first name.";
      return false;
    }
    if (!NAME_RE.test(lastName)) {
      errors.lastNameError = "Invalid last name.";
      return false;
    }

    // Prefer validator over complex regex for email and length checks
    if (email && !validator.isEmail(email)) {
      errors.emailError = "Invalid email address";
      return false;
    }

    // Strong password: 8–64 chars, at least one lower/upper/digit
    if (
      !validator.isLength(password, { min: 8, max: 64 }) ||
      !/[a-z]/.test(password) ||
      !/[A-Z]/.test(password) ||
      !/[0-9]/.test(password)
    ) {
      errors.passwordError =
        "Password must be 8–64 characters and include numbers, lowercase and uppercase letters.";
      return false;
    }

    if (password !== verify) {
      errors.verifyError = "Password must match";
      return false;
    }

    return true;
  };

  this.handleSignup = (req, res, next) => {
    let { email, userName, firstName, lastName, password, verify } = req.body;

    const errors = { userName, email };

    if (validateSignup(userName, firstName, lastName, password, verify, email, errors)) {
      userDAO.getUserByUserName(userName, (err, user) => {
        if (err) return next(err);

        if (user) {
          errors.userNameError = "User name already in use. Please choose another";
          return res.render("signup", { ...errors, environmentalScripts });
        }

        userDAO.addUser(userName, firstName, lastName, password, email, (err, user) => {
          if (err) return next(err);

          // prepare defaults
          prepareUserData(user, next);

          req.session.regenerate(() => {
            req.session.userId = user._id;
            user.userId = user._id; // for left nav
            return res.render("dashboard", { ...user, environmentalScripts });
          });
        });
      });
    } else {
      return res.render("signup", { ...errors, environmentalScripts });
    }
  };

  this.displayWelcomePage = (req, res, next) => {
    if (!req.session.userId) return res.redirect("/login");

    const userId = req.session.userId;
    userDAO.getUserById(userId, (err, doc) => {
      if (err) return next(err);
      doc.userId = userId;
      return res.render("dashboard", { ...doc, environmentalScripts });
    });
  };
}

module.exports = SessionHandler;
