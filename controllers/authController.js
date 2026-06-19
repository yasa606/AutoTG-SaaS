const AdminLog = require('../models/AdminLog');

exports.getLogin = (req, res) => {
  if (req.session.isAdmin) return res.redirect('/admin');
  res.render('login', { title: 'Admin Login', flash: req.flash() });
};

exports.postLogin = async (req, res) => {
  const { username, password } = req.body;

  if (
    username === process.env.ADMIN_USERNAME &&
    password === process.env.ADMIN_PASSWORD
  ) {
    req.session.isAdmin = true;
    req.session.adminUsername = username;

    await AdminLog.create({
      action: 'login',
      performedBy: username,
      note: `Login from IP: ${req.ip}`,
    }).catch(() => {});

    return res.redirect('/admin');
  }

  req.flash('error', 'Invalid username or password.');
  res.redirect('/admin/login');
};

exports.logout = (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
};
