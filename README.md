# 🤖 TGBot SaaS — Telegram Access Management System

A production-ready MVP for selling gated Telegram group access.
Users request access via the bot → admin approves/rejects via dashboard → approved users get an invite link automatically.

---

## 📁 Project Structure

```
tgbot/
├── bot/
│   └── bot.js                 # Telegraf.js bot logic
├── controllers/
│   ├── authController.js      # Admin login/logout
│   └── userController.js      # Approve, reject, ban, unban
├── middleware/
│   └── auth.js                # Session auth guard
├── models/
│   ├── User.js                # User schema
│   └── AdminLog.js            # Audit log schema
├── routes/
│   └── adminRoutes.js         # All admin routes
├── views/
│   ├── partials/
│   │   ├── header.ejs
│   │   └── footer.ejs
│   ├── login.ejs
│   ├── dashboard.ejs
│   ├── users.ejs
│   └── logs.ejs
├── public/
│   └── css/style.css
├── config/
│   └── db.js
├── server.js
├── package.json
└── .env.example
```

---

## ⚙️ Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)
- A Telegram Bot Token (from [@BotFather](https://t.me/BotFather))
- Your personal Telegram ID (from [@userinfobot](https://t.me/userinfobot))
- A Telegram Group where your bot is an **Admin**

---

## 🚀 Setup Guide

### Step 1 — Clone & Install

```bash
git clone <your-repo>
cd tgbot
npm install
```

### Step 2 — Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
BOT_TOKEN=7123456789:AAF...your_real_token
ADMIN_TELEGRAM_ID=123456789          # Your personal Telegram numeric ID
GROUP_ID=-1001234567890              # Your group's ID (must start with -100)

MONGO_URI=mongodb://localhost:27017/tgsaas

PORT=3000
SESSION_SECRET=generate_a_long_random_string_here

ADMIN_USERNAME=admin
ADMIN_PASSWORD=yourpassword123
```

### Step 3 — Get Your GROUP_ID

1. Add your bot to the Telegram group
2. Make the bot an **Administrator** (it needs "Invite Users" permission)
3. Forward any group message to [@userinfobot](https://t.me/userinfobot) — it shows the chat ID
   - Or send a message to the group and call:
     `https://api.telegram.org/bot<BOT_TOKEN>/getUpdates`
   - Look for `"chat":{"id":-100xxxxxx}`

### Step 4 — Run in Development

```bash
npm run dev
```

- Admin panel: http://localhost:3000/admin
- Bot runs in polling mode automatically

### Step 5 — Test the Flow

1. Open your bot in Telegram and send `/start`
2. Tap **Request Access**
3. Open http://localhost:3000/admin → log in
4. Go to **Users → Pending** → click **Approve**
5. The user receives an invite link in Telegram ✅

---

## 🌐 Production Deployment (VPS / Railway / Render)

### Option A: Webhook Mode (recommended for production)

Set `WEBHOOK_URL` in `.env`:
```env
WEBHOOK_URL=https://yourdomain.com
```

The bot will automatically switch to webhook mode and register the URL with Telegram.

### Option B: PM2 (VPS)

```bash
npm install -g pm2
pm2 start server.js --name tgbot
pm2 save
pm2 startup
```

### MongoDB Atlas (cloud DB)

Replace `MONGO_URI` with your Atlas connection string:
```env
MONGO_URI=mongodb+srv://user:password@cluster.mongodb.net/tgsaas
```

---

## 🔐 Security Notes for Production

- Use a strong, random `SESSION_SECRET` (32+ chars)
- Change `ADMIN_PASSWORD` immediately
- Run behind HTTPS (required for Telegram webhooks)
- Consider adding rate limiting: `npm install express-rate-limit`
- Add `NODE_ENV=production` to enable secure cookies

---

## 📊 Admin Panel Features

| Page | URL | Description |
|------|-----|-------------|
| Dashboard | `/admin` | Stats + recent activity |
| Users | `/admin/users?status=pending` | Manage by status |
| Audit Log | `/admin/logs` | All admin actions |

### User Actions

| Action | Effect |
|--------|--------|
| **Approve** | Generates a one-time invite link, notifies user via bot |
| **Reject** | Marks rejected, notifies user, they can re-apply |
| **Ban** | Blocks re-entry, removes from group if applicable |
| **Unban** | Restores ability to request access |

---

## 🤖 Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message + Request Access button |
| `/status` | Check current access status |
| `/help` | Show available commands |

---

## 🛠️ Extending This MVP

- **Payments**: Add Stripe/Crypto webhook → auto-approve on payment
- **Expiry**: Add `expiresAt` field, cron job to remove expired members
- **Multi-group**: Support multiple groups with different tiers
- **Analytics**: Track conversion rate (requests → approvals)
- **Whop Integration**: Use Whop webhooks to sync membership status

---

## 📦 Tech Stack

- **Runtime**: Node.js 18+
- **Web framework**: Express.js
- **Bot library**: Telegraf.js v4
- **Database**: MongoDB + Mongoose
- **Templating**: EJS
- **Auth**: express-session + connect-flash
