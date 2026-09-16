const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");
const TelegramBot = require("node-telegram-bot-api");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || "change-me";
const BOT_TOKEN = process.env.BOT_TOKEN || "";
const WEBAPP_URL = process.env.WEBAPP_URL || "";

const db = new Database("catalog.db");
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price REAL NOT NULL,
  image TEXT DEFAULT '',
  description TEXT DEFAULT '',
  variants TEXT DEFAULT '[]',
  variant_type TEXT DEFAULT '',
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id TEXT UNIQUE NOT NULL,
  username TEXT DEFAULT '',
  first_name TEXT DEFAULT '',
  last_name TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  registered_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_activity TEXT DEFAULT CURRENT_TIMESTAMP,
  blocked INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  items TEXT DEFAULT '[]',
  total REAL DEFAULT 0,
  status TEXT DEFAULT 'new',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
`);

try { db.prepare("ALTER TABLE products ADD COLUMN variants TEXT DEFAULT '[]'").run(); } catch {}
try { db.prepare("ALTER TABLE products ADD COLUMN variant_type TEXT DEFAULT ''").run(); } catch {}
try { db.prepare("ALTER TABLE users ADD COLUMN phone TEXT DEFAULT ''").run(); } catch {}

const categoryCount = db.prepare("SELECT COUNT(*) c FROM categories").get().c;
if (!categoryCount) {
  const add = db.prepare("INSERT OR IGNORE INTO categories(name) VALUES(?)");
  const categories = ["Nowości", "Popularne", "Akcesoria"];
  const insertCategories = db.transaction((items) => { for (const name of items) add.run(name); });
  insertCategories(categories);
}

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

function auth(req, res, next) {
  if (req.headers["x-admin-key"] !== ADMIN_KEY) return res.status(401).json({ error: "Unauthorized" });
  next();
}

function upsertUser(tgUser, phone = "") {
  if (!tgUser || !tgUser.id) return null;
  const telegramId = String(tgUser.id);
  db.prepare(`INSERT INTO users(telegram_id,username,first_name,last_name,phone,last_activity)
    VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(telegram_id) DO UPDATE SET
      username=excluded.username,
      first_name=excluded.first_name,
      last_name=excluded.last_name,
      phone=CASE WHEN excluded.phone <> '' THEN excluded.phone ELSE users.phone END,
      last_activity=CURRENT_TIMESTAMP`).run(
    telegramId, tgUser.username || "", tgUser.first_name || "", tgUser.last_name || "", phone || ""
  );
  return db.prepare("SELECT * FROM users WHERE telegram_id=?").get(telegramId);
}

app.get("/api/catalog", (req, res) => {
  const products = db.prepare("SELECT * FROM products WHERE active=1 ORDER BY id DESC").all();
  const categories = db.prepare("SELECT * FROM categories ORDER BY id").all();
  res.json({ products, categories });
});

app.get("/api/admin/products", auth, (req, res) => res.json(db.prepare("SELECT * FROM products ORDER BY id DESC").all()));
app.post("/api/admin/products", auth, (req, res) => {
  const { name, category, price, image = "", description = "", variants = [], variant_type = "" } = req.body || {};
  if (!String(name || "").trim() || !String(category || "").trim() || !Number.isFinite(Number(price))) return res.status(400).json({ error: "Invalid data" });
  db.prepare("INSERT OR IGNORE INTO categories(name) VALUES(?)").run(String(category).trim());
  const info = db.prepare("INSERT INTO products(name,category,price,image,description,variants,variant_type) VALUES(?,?,?,?,?,?,?)").run(String(name).trim(), String(category).trim(), Number(price), image, description, JSON.stringify(Array.isArray(variants) ? variants : []), String(variant_type || ""));
  res.json(db.prepare("SELECT * FROM products WHERE id=?").get(info.lastInsertRowid));
});
app.put("/api/admin/products/:id", auth, (req, res) => {
  const { name, category, price, image = "", description = "", variants = [], variant_type = "", active = 1 } = req.body || {};
  if (!String(name || "").trim() || !String(category || "").trim() || !Number.isFinite(Number(price))) return res.status(400).json({ error: "Invalid data" });
  db.prepare("INSERT OR IGNORE INTO categories(name) VALUES(?)").run(String(category).trim());
  db.prepare("UPDATE products SET name=?,category=?,price=?,image=?,description=?,variants=?,variant_type=?,active=? WHERE id=?").run(String(name).trim(), String(category).trim(), Number(price), image, description, JSON.stringify(Array.isArray(variants) ? variants : []), String(variant_type || ""), active ? 1 : 0, req.params.id);
  res.json({ ok: true });
});
app.delete("/api/admin/products/:id", auth, (req, res) => { db.prepare("DELETE FROM products WHERE id=?").run(req.params.id); res.json({ ok: true }); });

app.get("/api/admin/categories", auth, (req, res) => res.json(db.prepare("SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category=c.name) product_count FROM categories c ORDER BY c.id").all()));
app.post("/api/admin/categories", auth, (req, res) => {
  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "Name required" });
  db.prepare("INSERT OR IGNORE INTO categories(name) VALUES(?)").run(name);
  res.json({ ok: true });
});
app.delete("/api/admin/categories/:id", auth, (req, res) => {
  const cat = db.prepare("SELECT name FROM categories WHERE id=?").get(req.params.id);
  if (!cat) return res.status(404).json({ error: "Not found" });
  const used = db.prepare("SELECT COUNT(*) c FROM products WHERE category=?").get(cat.name).c;
  if (used) return res.status(400).json({ error: "Категория используется товарами" });
  db.prepare("DELETE FROM categories WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

app.get("/api/admin/stats", auth, (req, res) => {
  const products = db.prepare("SELECT COUNT(*) c FROM products").get().c;
  const activeProducts = db.prepare("SELECT COUNT(*) c FROM products WHERE active=1").get().c;
  const users = db.prepare("SELECT COUNT(*) c FROM users").get().c;
  const requests = db.prepare("SELECT COUNT(*) c FROM requests").get().c;
  const newRequests = db.prepare("SELECT COUNT(*) c FROM requests WHERE status='new'").get().c;
  const total = db.prepare("SELECT COALESCE(SUM(total),0) s FROM requests WHERE status!='cancelled'").get().s;
  res.json({ products, activeProducts, users, requests, newRequests, total });
});

app.get("/api/admin/users", auth, (req, res) => {
  res.json(db.prepare(`SELECT u.*, COUNT(r.id) request_count, COALESCE(SUM(CASE WHEN r.status!='cancelled' THEN r.total ELSE 0 END),0) total_spent
    FROM users u LEFT JOIN requests r ON r.user_id=u.id GROUP BY u.id ORDER BY u.last_activity DESC`).all());
});
app.get("/api/admin/requests", auth, (req, res) => {
  const rows = db.prepare(`SELECT r.*, u.telegram_id, u.username, u.first_name, u.last_name, u.phone
    FROM requests r LEFT JOIN users u ON u.id=r.user_id ORDER BY r.id DESC`).all();
  res.json(rows.map(r => ({ ...r, items: JSON.parse(r.items || "[]") })));
});

app.patch("/api/admin/requests/:id", auth, (req, res) => {
  const allowed = ["new", "processing", "completed", "cancelled"];
  const status = String(req.body?.status || "");
  if (!allowed.includes(status)) return res.status(400).json({ error: "Invalid status" });
  db.prepare("UPDATE requests SET status=? WHERE id=?").run(status, req.params.id);
  res.json({ ok: true });
});

app.post("/api/register", (req, res) => {
  const { telegram_user: tgUser, phone = "" } = req.body || {};
  if (!tgUser || !tgUser.id) return res.status(400).json({ error: "Telegram user required" });
  const user = upsertUser(tgUser, phone);
  res.json({ ok: true, user });
});

app.post("/api/requests", (req, res) => {
  const { telegram_user: tgUser, phone = "", items = [], total = 0 } = req.body || {};
  if (!tgUser || !tgUser.id) return res.status(400).json({ error: "Telegram user required" });
  const user = upsertUser(tgUser, phone);
  const info = db.prepare("INSERT INTO requests(user_id,items,total) VALUES(?,?,?)").run(user.id, JSON.stringify(items), Number(total) || 0);
  res.json({ ok: true, id: info.lastInsertRowid });
});

app.get("/api/health", (req, res) => res.json({ ok: true }));

if (BOT_TOKEN) {
  const bot = new TelegramBot(BOT_TOKEN, { polling: true });
  bot.onText(/^\/start(?:\s+.*)?$/, async (msg) => {
    try {
      const tgUser = msg.from;
      const existing = upsertUser(tgUser);
      if (!tgUser.username) {
        await bot.sendMessage(msg.chat.id,
          "Привет! Для регистрации в каталоге поделись номером телефона кнопкой ниже.",
          { reply_markup: { keyboard: [[{ text: "📱 Поделиться номером", request_contact: true }]], resize_keyboard: true, one_time_keyboard: true } }
        );
      } else {
        await bot.sendMessage(msg.chat.id,
          `Готово, ${tgUser.first_name || "пользователь"}! Ты зарегистрирован как @${tgUser.username}.`,
          WEBAPP_URL ? { reply_markup: { inline_keyboard: [[{ text: "🛍 Открыть каталог", web_app: { url: WEBAPP_URL } }]] } } : undefined
        );
      }
    } catch (e) { console.error("/start error", e); }
  });
  bot.on("contact", async (msg) => {
    try {
      const contact = msg.contact;
      if (!contact || !msg.from) return;
      if (String(contact.user_id || "") !== String(msg.from.id)) {
        await bot.sendMessage(msg.chat.id, "Пожалуйста, используй кнопку, чтобы поделиться своим собственным номером.");
        return;
      }
      upsertUser(msg.from, contact.phone_number || "");
      await bot.sendMessage(msg.chat.id, "Номер сохранён, регистрация завершена.", {
        reply_markup: {
          remove_keyboard: true,
          ...(WEBAPP_URL ? { inline_keyboard: [[{ text: "🛍 Открыть каталог", web_app: { url: WEBAPP_URL } }]] } : {})
        }
      });
    } catch (e) { console.error("contact error", e); }
  });
  console.log("Telegram bot polling enabled");
} else {
  console.log("BOT_TOKEN is not set; Telegram bot is disabled");
}

app.listen(PORT, () => console.log(`Mini App running on port ${PORT}`));
