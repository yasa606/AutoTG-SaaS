const { Telegraf, Markup } = require("telegraf");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const User = require("../models/User");

const bot = new Telegraf(process.env.BOT_TOKEN);

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Notify admin of a standard text request.
 */
const notifyAdmin = async (ctx, user) => {
  const adminId = process.env.ADMIN_TELEGRAM_ID;
  if (!adminId) return;

  const handle = user.username ? `@${user.username}` : user.displayName;
  const profileLink = `tg://user?id=${user.telegramId}`;
  const panelUrl = `${process.env.ADMIN_URL || "http://localhost:3000"}/admin/users`;

  await ctx.telegram
    .sendMessage(
      adminId,
      `📬 *New Access Request*\n\n` +
        `👤 Name: [${user.displayName}](${profileLink})\n` +
        `🔖 Handle: ${handle}\n` +
        `🆔 ID: \`${user.telegramId}\`\n` +
        `💳 Method: ${user.paymentMethod === "stripe" ? "Card (Stripe)" : "Manual receipt"}\n\n` +
        `Review in the admin panel.`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.url("Open Admin Panel", panelUrl)],
        ]),
      },
    )
    .catch(() => {});
};

/**
 * Notify admin of a manual payment proof submission.
 */
const notifyAdminWithProof = async (ctx, user, fileId) => {
  const adminId = process.env.ADMIN_TELEGRAM_ID;
  if (!adminId) return;

  const handle = user.username ? `@${user.username}` : user.displayName;
  const profileLink = `tg://user?id=${user.telegramId}`;
  const panelUrl = `${process.env.ADMIN_URL || "http://localhost:3000"}/admin/users`;

  await ctx.telegram
    .sendPhoto(adminId, fileId, {
      caption:
        `🧾 *Manual Payment Proof*\n\n` +
        `👤 Name: [${user.displayName}](${profileLink})\n` +
        `🔖 Handle: ${handle}\n` +
        `🆔 ID: \`${user.telegramId}\`\n\n` +
        `Verify the receipt and approve or reject in the admin panel.`,
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.url("Open Admin Panel", panelUrl)],
      ]),
    })
    .catch((err) => {
      console.error(
        "[notifyAdminWithProof] Failed to send photo to admin:",
        err.description || err.message,
      );
    });
};

/**
 * Guard helper — returns the user doc if they can make a new request,
 * otherwise replies with the appropriate message and returns null.
 */
const guardRequestEligibility = async (ctx, user) => {
  if (!user) return null;

  if (user.status === "banned") {
    await ctx.reply(`⛔ *You are banned from this service.*`, {
      parse_mode: "Markdown",
    });
    return null;
  }
  if (user.status === "approved") {
    await ctx.reply(`✅ *You already have access!*`, {
      parse_mode: "Markdown",
    });
    return null;
  }
  if (user.status === "pending") {
    await ctx.reply(
      `⏳ *Your request is already under review.* We'll message you when it's processed.`,
      {
        parse_mode: "Markdown",
      },
    );
    return null;
  }
  if (user.status === "awaiting_manual_proof") {
    await ctx.reply(
      `📸 *We're waiting for your payment receipt.*\n\nPlease send a photo of your payment confirmation to continue.`,
      { parse_mode: "Markdown" },
    );
    return null;
  }
  return user;
};

// ─────────────────────────────────────────────────────────────────────────────
// /start
// ─────────────────────────────────────────────────────────────────────────────

bot.start(async (ctx) => {
  const tgUser = ctx.from;

  try {
    const user = await User.findOneAndUpdate(
      { telegramId: String(tgUser.id) },
      {
        $setOnInsert: { status: "new", requestedAt: null },
        $set: {
          username: tgUser.username || null,
          firstName: tgUser.first_name || "",
          lastName: tgUser.last_name || "",
        },
      },
      { upsert: true, new: true },
    );

    if (user.status === "banned") {
      return ctx.reply(
        `⛔ *Access Denied*\n\nYour account has been banned.\n\nContact support if you believe this is a mistake.`,
        { parse_mode: "Markdown" },
      );
    }

    if (user.status === "approved") {
      const msg = user.inviteLink
        ? `✅ *You already have access!*\n\nJoin here:\n${user.inviteLink}`
        : `✅ *You already have access!*\n\nContact an admin if you need a new invite link.`;
      return ctx.reply(msg, { parse_mode: "Markdown" });
    }

    if (user.status === "pending") {
      return ctx.reply(
        `⏳ *Your request is under review.*\n\nWe'll notify you as soon as it's been processed. Hang tight!`,
        { parse_mode: "Markdown" },
      );
    }

    if (user.status === "awaiting_manual_proof") {
      return ctx.reply(
        `📸 *We're still waiting for your payment receipt.*\n\nPlease send a photo of your payment confirmation to continue.`,
        { parse_mode: "Markdown" },
      );
    }

    if (user.status === "rejected") {
      return ctx.reply(
        `❌ *Your previous request was rejected.*\n\nYou may submit a new request if you think this was a mistake.`,
        {
          parse_mode: "Markdown",
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback(
                "🔄 Request Access Again",
                "request_access",
              ),
            ],
          ]),
        },
      );
    }

    return ctx.reply(
      `👋 *Welcome!*\n\n` +
        `This bot manages access to our exclusive private group.\n\n` +
        `*How it works:*\n` +
        `1️⃣ Tap "Request Access" below\n` +
        `2️⃣ Choose your payment method\n` +
        `3️⃣ Complete payment — an admin will confirm and send your invite link\n\n` +
        `Ready to join? 👇`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.callback("🚀 Request Access", "request_access")],
        ]),
      },
    );
  } catch (err) {
    console.error("[/start error]", err);
    ctx.reply("Something went wrong. Please try again later.");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — request_access
// ─────────────────────────────────────────────────────────────────────────────

bot.action("request_access", async (ctx) => {
  await ctx.answerCbQuery();

  try {
    let user = await User.findOne({ telegramId: String(ctx.from.id) });
    if (!user) {
      user = await User.create({
        telegramId: String(ctx.from.id),
        username: ctx.from.username || null,
        firstName: ctx.from.first_name || "",
        lastName: ctx.from.last_name || "",
        status: "new",
      });
    }

    const eligible = await guardRequestEligibility(ctx, user);
    if (!eligible) return;

    await ctx.editMessageText(
      `💳 *Choose your payment method:*\n\n` +
        `• *Card* — Pay online via Stripe (international cards accepted)\n` +
        `• *Receipt* — Pay via local transfer and upload your proof`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback(
              "💳 Pay with Card (International)",
              "pay_stripe",
            ),
          ],
          [
            Markup.button.callback(
              "🧾 Upload Receipt (Ethiopia)",
              "pay_manual",
            ),
          ],
        ]),
      },
    );
  } catch (err) {
    console.error("[request_access error]", err);
    ctx.reply("Something went wrong. Please try again.");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2A — pay_stripe
// ─────────────────────────────────────────────────────────────────────────────

bot.action("pay_stripe", async (ctx) => {
  await ctx.answerCbQuery();

  try {
    const user = await User.findOne({ telegramId: String(ctx.from.id) });
    const eligible = await guardRequestEligibility(ctx, user);
    if (!eligible) return;

    const baseUrl = process.env.APP_BASE_URL || "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      client_reference_id: user.telegramId,
      metadata: { telegramId: user.telegramId },
      success_url: `${baseUrl}/stripe/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/stripe/cancel`,
    });

    await User.updateOne(
      { telegramId: user.telegramId },
      {
        paymentMethod: "stripe",
        stripeSessionId: session.id,
        requestedAt: new Date(),
      },
    );

    await ctx.editMessageText(
      `💳 *Complete your payment:*\n\nClick the button below to pay securely via Stripe.\n\n` +
        `_Once payment is confirmed, your access will be processed automatically._`,
      {
        parse_mode: "Markdown",
        ...Markup.inlineKeyboard([
          [Markup.button.url("Pay Now →", session.url)],
        ]),
      },
    );
  } catch (err) {
    console.error("[pay_stripe error]", err);
    ctx.reply("Something went wrong. Please try again.");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2B — pay_manual
// ─────────────────────────────────────────────────────────────────────────────

bot.action("pay_manual", async (ctx) => {
  await ctx.answerCbQuery();

  try {
    const user = await User.findOne({ telegramId: String(ctx.from.id) });
    const eligible = await guardRequestEligibility(ctx, user);
    if (!eligible) return;

    await User.updateOne(
      { telegramId: String(ctx.from.id) },
      {
        status: "awaiting_manual_proof",
        paymentMethod: "manual",
        paymentProof: null,
        requestedAt: new Date(),
        resolvedAt: null,
      },
    );

    await ctx.editMessageText(
      `🧾 *Upload your payment receipt*\n\n` +
        `Please send a *photo* of your payment confirmation (bank transfer, CBE Birr, telebirr, etc.).\n\n` +
        `📸 _Just send the photo directly in this chat — no caption needed._`,
      { parse_mode: "Markdown" },
    );
  } catch (err) {
    console.error("[pay_manual error]", err);
    ctx.reply("Something went wrong. Please try again.");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 — on('photo')
// ─────────────────────────────────────────────────────────────────────────────

bot.on("photo", async (ctx) => {
  try {
    const user = await User.findOne({ telegramId: String(ctx.from.id) });

    if (!user || user.status !== "awaiting_manual_proof") return;

    const photos = ctx.message.photo;
    const bestPhoto = photos[photos.length - 1];
    const fileId = bestPhoto.file_id;

    await User.updateOne(
      { telegramId: String(ctx.from.id) },
      {
        status: "pending",
        paymentProof: fileId,
      },
    );

    await ctx.reply(
      `✅ *Receipt received!*\n\n` +
        `Your payment proof has been submitted. An admin will review it and you'll be notified once a decision is made.\n\n` +
        `⏳ _Average review time: within 24 hours._`,
      { parse_mode: "Markdown" },
    );

    const updatedUser = await User.findOne({ telegramId: String(ctx.from.id) });
    await notifyAdminWithProof(ctx, updatedUser, fileId);
  } catch (err) {
    console.error("[on(photo) error]", err);
    ctx.reply("Failed to process your photo. Please try again.");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// COMMANDS
// ─────────────────────────────────────────────────────────────────────────────

bot.command("status", async (ctx) => {
  try {
    const user = await User.findOne({ telegramId: String(ctx.from.id) });
    if (!user) {
      return ctx.reply(`You haven't started yet. Use /start to begin.`);
    }

    const statusMap = {
      new: "🆕 Not yet requested",
      awaiting_manual_proof: "📸 Awaiting your payment receipt",
      pending: "⏳ Pending admin review",
      approved: "✅ Approved — you have access",
      rejected: "❌ Rejected",
      banned: "⛔ Banned",
    };

    const methodMap = {
      stripe: " via Card (Stripe)",
      manual: " via Manual Receipt",
    };

    const methodNote = user.paymentMethod ? methodMap[user.paymentMethod] : "";
    ctx.reply(
      `*Your Status*\n\n${statusMap[user.status] || "Unknown"}${methodNote}`,
      { parse_mode: "Markdown" },
    );
  } catch (err) {
    ctx.reply("Could not retrieve your status. Try again later.");
  }
});

bot.command("help", (ctx) => {
  ctx.reply(
    `*Available Commands*\n\n` +
      `/start — Show welcome & request access\n` +
      `/status — Check your current status\n` +
      `/help — Show this message`,
    { parse_mode: "Markdown" },
  );
});

bot.catch((err, ctx) => {
  console.error(`[Bot Error] ${ctx.updateType}:`, err);
});

module.exports = bot;
