const User = require('../models/User');
const AdminLog = require('../models/AdminLog');
const bot = require('../bot/bot');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const log = async (action, user, performedBy = 'admin', note = '') => {
  await AdminLog.create({
    action,
    targetUserId: user.telegramId,
    targetUsername: user.username,
    performedBy,
    note,
  }).catch(console.error);
};

const notifyUser = async (telegramId, message, extra = {}) => {
  try {
    await bot.telegram.sendMessage(telegramId, message, {
      parse_mode: 'Markdown',
      ...extra,
    });
    return true;
  } catch (err) {
    console.error(`[Notify] Failed to message ${telegramId}:`, err.description || err.message);
    return false;
  }
};

/**
 * Resolve a Telegram file_id to a direct HTTPS URL.
 * Works with both Telegraf v4 (returns URL object) and older builds (returns string).
 */
const resolveFileUrl = async (fileId) => {
  const result = await bot.telegram.getFileLink(fileId);
  // Telegraf v4 returns a URL object; toString() / .href both work
  return typeof result === 'string' ? result : result.href || result.toString();
};

// ─── Dashboard ───────────────────────────────────────────────────────────────

exports.getDashboard = async (req, res) => {
  try {
    const [pending, awaitingProof, approved, rejected, banned, recentLogs] = await Promise.all([
      User.countDocuments({ status: 'pending' }),
      User.countDocuments({ status: 'awaiting_manual_proof' }),
      User.countDocuments({ status: 'approved' }),
      User.countDocuments({ status: 'rejected' }),
      User.countDocuments({ status: 'banned' }),
      AdminLog.find().sort({ createdAt: -1 }).limit(10),
    ]);

    res.render('dashboard', {
      title: 'Dashboard',
      stats: { pending, awaitingProof, approved, rejected, banned },
      recentLogs,
      flash: req.flash(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
};

// ─── List Users ──────────────────────────────────────────────────────────────

const VALID_STATUSES = ['new', 'pending', 'awaiting_manual_proof', 'approved', 'rejected', 'banned'];

exports.getUsers = async (req, res) => {
  try {
    const { status = 'pending', page = 1 } = req.query;
    const limit = 20;
    const skip = (page - 1) * limit;

    const filter = VALID_STATUSES.includes(status) ? { status } : { status: 'pending' };

    const [users, total] = await Promise.all([
      User.find(filter).sort({ requestedAt: -1 }).skip(skip).limit(limit),
      User.countDocuments(filter),
    ]);

    // Pre-resolve proof image URLs so the view can embed them inline
    // We fetch all at once to avoid sequential await in EJS
    const proofUrls = {};
    await Promise.all(
      users
        .filter((u) => u.paymentProof)
        .map(async (u) => {
          try {
            proofUrls[u._id.toString()] = await resolveFileUrl(u.paymentProof);
          } catch (err) {
            console.error(`[proofUrl] Failed for ${u.telegramId}:`, err.message);
            proofUrls[u._id.toString()] = null;
          }
        })
    );

    res.render('users', {
      title: 'Users',
      users,
      proofUrls,
      status,
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / limit),
      total,
      flash: req.flash(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
};

// ─── View Proof (full-page) ───────────────────────────────────────────────────

exports.viewProof = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user || !user.paymentProof) {
      return res.status(404).send('No proof on file for this user.');
    }
    const url = await resolveFileUrl(user.paymentProof);
    // Render a dead-simple page so the image opens in the browser, not as a download
    res.send(`<!DOCTYPE html><html><head><title>Payment Proof — ${user.displayName}</title>
      <style>body{margin:0;background:#0f1117;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;color:#e8eaf0;}
      img{max-width:90vw;max-height:85vh;border-radius:8px;box-shadow:0 8px 40px rgba(0,0,0,.6);}
      p{margin-top:16px;color:#8b90a8;font-size:13px;}</style></head>
      <body><img src="${url}" alt="Payment receipt for ${user.displayName}">
      <p>Receipt submitted by ${user.displayName} · ${user.telegramId}</p></body></html>`);
  } catch (err) {
    console.error('[viewProof error]', err);
    res.status(500).send('Could not retrieve proof image.');
  }
};

// ─── Approve ─────────────────────────────────────────────────────────────────

exports.approveUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      req.flash('error', 'User not found.');
      return res.redirect('/admin/users');
    }

    let inviteLink = null;
    const groupId = process.env.GROUP_ID;

    if (groupId) {
      try {
        const linkResult = await bot.telegram.createChatInviteLink(groupId, {
          name: `${user.displayName} (${user.telegramId})`,
          member_limit: 1,
          expire_date: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
        });
        inviteLink = linkResult.invite_link;
      } catch (err) {
        console.error('[Approve] Could not create invite link:', err.description || err.message);
      }
    }

    await User.updateOne(
      { _id: user._id },
      { status: 'approved', inviteLink, resolvedAt: new Date() }
    );

    const linkMsg = inviteLink
      ? `\n\n🔗 *Your personal invite link:*\n${inviteLink}\n\n_Valid for 7 days, single use._`
      : `\n\nContact an admin for your invite link.`;

    await notifyUser(
      user.telegramId,
      `🎉 *You've been approved!*\n\nWelcome to the community!${linkMsg}`
    );

    await log('approve', user);
    req.flash('success', `✅ ${user.displayName} approved and notified.`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to approve user.');
  }

  res.redirect('/admin/users?status=pending');
};

// ─── Reject ──────────────────────────────────────────────────────────────────

exports.rejectUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      req.flash('error', 'User not found.');
      return res.redirect('/admin/users');
    }

    await User.updateOne({ _id: user._id }, { status: 'rejected', resolvedAt: new Date() });

    await notifyUser(
      user.telegramId,
      `❌ *Your request was not approved.*\n\nYour access request has been rejected.\n\nYou may re-apply using /start if you believe this is a mistake.`
    );

    await log('reject', user);
    req.flash('success', `Rejected ${user.displayName}.`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to reject user.');
  }

  res.redirect('/admin/users?status=pending');
};

// ─── Ban ─────────────────────────────────────────────────────────────────────

exports.banUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      req.flash('error', 'User not found.');
      return res.redirect('/admin/users');
    }

    await User.updateOne({ _id: user._id }, { status: 'banned', resolvedAt: new Date() });

    const groupId = process.env.GROUP_ID;
    if (groupId && user.status === 'approved') {
      try {
        await bot.telegram.banChatMember(groupId, parseInt(user.telegramId));
      } catch (err) {
        console.error('[Ban] Could not remove from group:', err.description || err.message);
      }
    }

    await notifyUser(
      user.telegramId,
      `⛔ *You have been banned.*\n\nYour access to this service has been permanently revoked.`
    );

    await log('ban', user);
    req.flash('success', `Banned ${user.displayName}.`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to ban user.');
  }

  res.redirect('/admin/users');
};

// ─── Unban ───────────────────────────────────────────────────────────────────

exports.unbanUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      req.flash('error', 'User not found.');
      return res.redirect('/admin/users');
    }

    await User.updateOne({ _id: user._id }, { status: 'rejected', resolvedAt: new Date() });

    const groupId = process.env.GROUP_ID;
    if (groupId) {
      try {
        await bot.telegram.unbanChatMember(groupId, parseInt(user.telegramId));
      } catch (err) {
        console.error('[Unban] Error:', err.description || err.message);
      }
    }

    await notifyUser(
      user.telegramId,
      `✅ *Your ban has been lifted.*\n\nYou may now re-apply for access using /start.`
    );

    await log('unban', user);
    req.flash('success', `Unbanned ${user.displayName}. They can now re-apply.`);
  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to unban user.');
  }

  res.redirect('/admin/users?status=banned');
};

// ─── Logs ────────────────────────────────────────────────────────────────────

exports.getLogs = async (req, res) => {
  try {
    const logs = await AdminLog.find().sort({ createdAt: -1 }).limit(100);
    res.render('logs', { title: 'Audit Logs', logs, flash: req.flash() });
  } catch (err) {
    res.status(500).send('Server error');
  }
};
