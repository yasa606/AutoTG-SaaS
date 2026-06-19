const AdminLog = require("../models/AdminLog");

exports.getLogin = (req, res) => {
  if (req.session.isAdmin) return res.redirect("/admin");
  // Fixed: Pointing to 'admin/login' instead of 'login'
  res.render("admin/login", { title: "Admin Login", flash: req.flash() });
};

exports.postLogin = async (req, res) => {
  const { username, password } = req.body;
  console.log(`[Auth] Login attempt for user: ${username}`);

  if (
    username === process.env.ADMIN_USERNAME &&
    password === process.env.ADMIN_PASSWORD
  ) {
    req.session.isAdmin = true;
    req.session.adminUsername = username;

    await AdminLog.create({
      action: "login",
      performedBy: username,
      note: `Login from IP: ${req.ip}`,
    }).catch((e) => console.error("[Auth] Log error:", e));

    console.log("[Auth] Login successful, redirecting...");
    return req.session.save(() => {
      res.redirect("/admin");
    });
  }

  console.warn("[Auth] Invalid login attempt.");
  req.flash("error", "Invalid username or password.");
  res.redirect("/admin/login");
};

exports.logout = (req, res) => {
  req.session.destroy(() => {
    res.redirect("/admin/login");
  });
};
