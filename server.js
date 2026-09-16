const express = require("express");
const path = require("path");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || "change-me";
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
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_seen TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  items TEXT NOT NULL,
  total REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new',
  comment TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
);
`);

try { db.prepare("ALTER TABLE products ADD COLUMN variants TEXT DEFAULT '[]'").run(); } catch {}
try { db.prepare("ALTER TABLE products ADD COLUMN variant_type TEXT DEFAULT ''").run(); } catch {}

const categoryCount = db.prepare("SELECT COUNT(*) c FROM categories").get().c;
if (!categoryCount) {
  const add = db.prepare("INSERT OR IGNORE INTO categories(name) VALUES(?)");
  for (const name of ["Электроника", "Аксессуары", "Для дома", "Новинки"]) add.run(name);
}

const productCount = db.prepare("SELECT COUNT(*) c FROM products").get().c;
if (!productCount) {
  const add = db.prepare("INSERT INTO products(name,category,price,image,description) VALUES(?,?,?,?,?)");
  add.run("Беспроводные наушники", "Электроника", 149, "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=85", "Bluetooth · компактный кейс");
  add.run("Механическая клавиатура", "Электроника", 219, "https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=900&q=85", "RGB · компактный формат");
  add.run("Городской рюкзак", "Аксессуары", 129, "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=85", "Удобный рюкзак на каждый день");
}

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

function auth(req, res, next) {
  if (req.headers["x-admin-key"] !== ADMIN_KEY) return res.status(401).json({ error: "Unauthorized" });
  next();
}

app.get("/api/catalog", (req, res) => {
  res.json({
    products: db.prepare("SELECT * FROM products WHERE active=1 ORDER BY id DESC").all(),
    categories: db.prepare("SELECT * FROM categories ORDER BY id").all()
  });
});

app.post("/api/user", (req, res) => {
  const u = req.body?.user;
  if (!u || u.id == null) return res.status(400).json({ error: "Telegram user required" });
  const telegramId = String(u.id);
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO users(telegram_id,username,first_name,last_name,created_at,last_seen)
    VALUES(?,?,?,?,?,?)
    ON CONFLICT(telegram_id) DO UPDATE SET username=excluded.username, first_name=excluded.first_name, last_name=excluded.last_name, last_seen=excluded.last_seen`)
    .run(telegramId, u.username || "", u.first_name || "", u.last_name || "", now, now);
  res.json(db.prepare("SELECT * FROM users WHERE telegram_id=?").get(telegramId));
});

app.post("/api/requests", (req, res) => {
  const { user, items, total, comment = "" } = req.body || {};
  if (!user?.id || !Array.isArray(items) || !items.length) return res.status(400).json({ error: "Invalid request" });
  const telegramId = String(user.id);
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO users(telegram_id,username,first_name,last_name,created_at,last_seen)
    VALUES(?,?,?,?,?,?)
    ON CONFLICT(telegram_id) DO UPDATE SET username=excluded.username, first_name=excluded.first_name, last_name=excluded.last_name, last_seen=excluded.last_seen`)
    .run(telegramId, user.username || "", user.first_name || "", user.last_name || "", now, now);
  const dbUser = db.prepare("SELECT id FROM users WHERE telegram_id=?").get(telegramId);
  const info = db.prepare("INSERT INTO requests(user_id,items,total,status,comment,created_at,updated_at) VALUES(?,?,?,?,?,?,?)")
    .run(dbUser.id, JSON.stringify(items), Number(total) || 0, "new", String(comment || ""), now, now);
  res.json({ ok: true, id: info.lastInsertRowid });
});

app.get("/api/admin/products", auth, (req, res) => res.json(db.prepare("SELECT * FROM products ORDER BY id DESC").all()));
app.post("/api/admin/products", auth, (req, res) => {
  const { name, category, price, image = "", description = "", variants = [], variant_type = "" } = req.body || {};
  if (!name || !category || !Number.isFinite(Number(price))) return res.status(400).json({ error: "Invalid data" });
  db.prepare("INSERT OR IGNORE INTO categories(name) VALUES(?)").run(category);
  const info = db.prepare("INSERT INTO products(name,category,price,image,description,variants,variant_type) VALUES(?,?,?,?,?,?,?)").run(name, category, Number(price), image, description, JSON.stringify(Array.isArray(variants) ? variants : []), String(variant_type || ""));
  res.json(db.prepare("SELECT * FROM products WHERE id=?").get(info.lastInsertRowid));
});
app.put("/api/admin/products/:id", auth, (req, res) => {
  const { name, category, price, image = "", description = "", variants = [], variant_type = "", active = 1 } = req.body || {};
  if (!name || !category || !Number.isFinite(Number(price))) return res.status(400).json({ error: "Invalid data" });
  db.prepare("INSERT OR IGNORE INTO categories(name) VALUES(?)").run(category);
  db.prepare(`UPDATE products SET name=?,category=?,price=?,image=?,description=?,variants=?,variant_type=?,active=? WHERE id=?`)
    .run(name, category, Number(price), image, description, JSON.stringify(Array.isArray(variants) ? variants : []), String(variant_type || ""), active ? 1 : 0, req.params.id);
  res.json({ ok: true });
});
app.delete("/api/admin/products/:id", auth, (req, res) => {
  db.prepare("DELETE FROM products WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

app.get("/api/admin/categories", auth, (req, res) => res.json(db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category=c.name) product_count FROM categories c ORDER BY c.id`).all()));
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
    FROM users u LEFT JOIN requests r ON r.user_id=u.id GROUP BY u.id ORDER BY u.last_seen DESC`).all());
});

app.get("/api/admin/requests", auth, (req, res) => {
  const rows = db.prepare(`SELECT r.*, u.telegram_id, u.username, u.first_name, u.last_name
    FROM requests r LEFT JOIN users u ON u.id=r.user_id ORDER BY r.id DESC`).all();
  res.json(rows.map(r => ({ ...r, items: JSON.parse(r.items || "[]") })));
});

app.patch("/api/admin/requests/:id", auth, (req, res) => {
  const allowed = ["new", "processing", "completed", "cancelled"];
  const status = String(req.body?.status || "");
  if (!allowed.includes(status)) return res.status(400).json({ error: "Invalid status" });
  db.prepare("UPDATE requests SET status=?,updated_at=? WHERE id=?").run(status, new Date().toISOString(), req.params.id);
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`Mini App running on port ${PORT}`));
