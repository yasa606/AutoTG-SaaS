require("dotenv").config();
const express = require("express");
const session = require("express-session");
const MongoStore = require("connect-mongo"); // 1. Added persistent storage
const flash = require("connect-flash");
const methodOverride = require("method-override");
const path = require("path");

const connectDB = require("./config/db");
const adminRoutes = require("./routes/adminRoutes");
const bot = require("./bot/bot");

// ─── Validate required env vars ───────────────────────────────────────────────
const required = [
  "BOT_TOKEN",
  "MONGO_URI",
  "SESSION_SECRET",
  "ADMIN_USERNAME",
  "ADMIN_PASSWORD",
];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`[Config] Missing required env vars: ${missing.join(", ")}`);
  process.exit(1);
}

connectDB();

const app = express();

// 2. IMPORTANT: Trust Render's proxy for secure cookies
app.set("trust proxy", 1);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride("_method"));

// 3. Upgraded Session Configuration
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
    }),
    cookie: {
      secure: process.env.NODE_ENV === "production", // Only works with trust proxy
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 8, // 8 hours
    },
  }),
);

app.use(flash());

// ─── Routes ───────────────────────────────────────────────────────────────────
app.get("/", (req, res) => res.redirect("/admin"));
app.use("/admin", adminRoutes);

// ─── Bot Initialization ───────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

if (process.env.WEBHOOK_URL) {
  const webhookPath = `/webhook/${process.env.BOT_TOKEN}`;
  app.use(bot.webhookCallback(webhookPath));
  bot.telegram.setWebhook(`${process.env.WEBHOOK_URL}${webhookPath}`);
  app.listen(PORT, () => console.log(`[Server] Running (webhook mode)`));
} else {
  app.listen(PORT, () => console.log(`[Server] Running (polling mode)`));
  bot.launch();
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}

module.exports = app;
