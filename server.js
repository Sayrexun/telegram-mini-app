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
 name TEXT NOT NULL, category TEXT NOT NULL, price REAL NOT NULL,
 image TEXT DEFAULT '', description TEXT DEFAULT '', variants TEXT DEFAULT '[]',
 active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT, telegram_id TEXT UNIQUE NOT NULL,
 username TEXT DEFAULT '', first_name TEXT DEFAULT '', last_name TEXT DEFAULT '',
 phone TEXT DEFAULT '', registered_at TEXT DEFAULT CURRENT_TIMESTAMP,
 last_activity TEXT DEFAULT CURRENT_TIMESTAMP, blocked INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS requests (
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, items TEXT DEFAULT '[]', total REAL DEFAULT 0,
 status TEXT DEFAULT 'new', created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id)
);
`);
try { db.exec("ALTER TABLE products ADD COLUMN variants TEXT DEFAULT '[]'"); } catch (_) {}

if (!db.prepare("SELECT 1 FROM categories LIMIT 1").get()) {
 const add=db.prepare("INSERT OR IGNORE INTO categories(name) VALUES(?)");
 ["Новинки","Популярные","Аксессуары"].forEach(x=>add.run(x));
}

app.use(express.json({limit:"1mb"}));
app.use(express.static(path.join(__dirname,"public")));

function auth(req,res,next){
 if(req.headers["x-admin-key"]!==ADMIN_KEY) return res.status(401).json({error:"Unauthorized"});
 next();
}
function cleanVariants(v){
 if(Array.isArray(v)) return v.map(x=>String(x).trim()).filter(Boolean);
 if(typeof v === "string") return v.split(/[,;\n]/).map(x=>x.trim()).filter(Boolean);
 return [];
}
function upsertUser(u,phone=""){
 if(!u?.id) return null;
 const id=String(u.id);
 db.prepare(`INSERT INTO users(telegram_id,username,first_name,last_name,phone,last_activity)
 VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)
 ON CONFLICT(telegram_id) DO UPDATE SET username=excluded.username,first_name=excluded.first_name,
 last_name=excluded.last_name,phone=CASE WHEN excluded.phone<>'' THEN excluded.phone ELSE users.phone END,
 last_activity=CURRENT_TIMESTAMP`).run(id,u.username||"",u.first_name||"",u.last_name||"",phone||"");
 return db.prepare("SELECT * FROM users WHERE telegram_id=?").get(id);
}

app.get("/api/catalog",(req,res)=>{
 const products=db.prepare("SELECT * FROM products WHERE active=1 ORDER BY id DESC").all().map(p=>({...p,variants:JSON.parse(p.variants||"[]")}));
 const categories=db.prepare("SELECT * FROM categories ORDER BY id").all();
 res.json({products,categories});
});

app.get("/api/admin/products",auth,(req,res)=>res.json(db.prepare("SELECT * FROM products ORDER BY id DESC").all().map(p=>({...p,variants:JSON.parse(p.variants||"[]")}))));
app.post("/api/admin/products",auth,(req,res)=>{
 const b=req.body||{}, name=String(b.name||"").trim(), category=String(b.category||"").trim(), price=Number(b.price);
 if(!name||!category||!Number.isFinite(price)) return res.status(400).json({error:"Заполни название, категорию и цену"});
 const variants=JSON.stringify(cleanVariants(b.variants));
 db.prepare("INSERT OR IGNORE INTO categories(name) VALUES(?)").run(category);
 const info=db.prepare("INSERT INTO products(name,category,price,image,description,variants) VALUES(?,?,?,?,?,?)").run(name,category,price,String(b.image||""),String(b.description||""),variants);
 res.json(db.prepare("SELECT * FROM products WHERE id=?").get(info.lastInsertRowid));
});
app.put("/api/admin/products/:id",auth,(req,res)=>{
 const b=req.body||{}, name=String(b.name||"").trim(), category=String(b.category||"").trim(), price=Number(b.price);
 if(!name||!category||!Number.isFinite(price)) return res.status(400).json({error:"Заполни название, категорию и цену"});
 db.prepare("INSERT OR IGNORE INTO categories(name) VALUES(?)").run(category);
 db.prepare("UPDATE products SET name=?,category=?,price=?,image=?,description=?,variants=?,active=? WHERE id=?")
 .run(name,category,price,String(b.image||""),String(b.description||""),JSON.stringify(cleanVariants(b.variants)),b.active?1:0,req.params.id);
 res.json({ok:true});
});
app.delete("/api/admin/products/:id",auth,(req,res)=>{db.prepare("DELETE FROM products WHERE id=?").run(req.params.id);res.json({ok:true});});

app.get("/api/admin/categories",auth,(req,res)=>res.json(db.prepare("SELECT * FROM categories ORDER BY id").all()));
app.post("/api/admin/categories",auth,(req,res)=>{const name=String(req.body?.name||"").trim();if(!name)return res.status(400).json({error:"Введите название категории"});db.prepare("INSERT OR IGNORE INTO categories(name) VALUES(?)").run(name);res.json({ok:true});});
app.delete("/api/admin/categories/:id",auth,(req,res)=>{db.prepare("DELETE FROM categories WHERE id=?").run(req.params.id);res.json({ok:true});});

app.get("/api/admin/users",auth,(req,res)=>res.json(db.prepare(`SELECT u.*,COUNT(r.id) request_count,COALESCE(SUM(r.total),0) total_amount FROM users u LEFT JOIN requests r ON r.user_id=u.id GROUP BY u.id ORDER BY u.last_activity DESC`).all()));
app.get("/api/admin/requests",auth,(req,res)=>res.json(db.prepare(`SELECT r.*,u.telegram_id,u.username,u.first_name,u.last_name,u.phone FROM requests r LEFT JOIN users u ON u.id=r.user_id ORDER BY r.id DESC`).all()));
app.put("/api/admin/requests/:id",auth,(req,res)=>{const status=String(req.body?.status||"new");if(!["new","processing","done","cancelled"].includes(status))return res.status(400).json({error:"Неверный статус"});db.prepare("UPDATE requests SET status=? WHERE id=?").run(status,req.params.id);res.json({ok:true});});

app.post("/api/register",(req,res)=>{const user=upsertUser(req.body?.telegram_user,req.body?.phone||"");if(!user)return res.status(400).json({error:"Telegram user required"});res.json({ok:true,user});});
app.post("/api/requests",(req,res)=>{const b=req.body||{},user=upsertUser(b.telegram_user,b.phone||"");if(!user)return res.status(400).json({error:"Telegram user required"});const items=Array.isArray(b.items)?b.items:[];const total=Number(b.total)||0;const info=db.prepare("INSERT INTO requests(user_id,items,total) VALUES(?,?,?)").run(user.id,JSON.stringify(items),total);res.json({ok:true,id:info.lastInsertRowid});});
app.get("/api/health",(req,res)=>res.json({ok:true}));

if(BOT_TOKEN){
 const bot=new TelegramBot(BOT_TOKEN,{polling:true});
 bot.onText(/^\/start(?:\s+.*)?$/,async msg=>{
  const u=msg.from; upsertUser(u);
  if(!u.username){
   await bot.sendMessage(msg.chat.id,"Привет! Для регистрации поделись своим номером телефона.",{reply_markup:{keyboard:[[{text:"📱 Поделиться номером",request_contact:true}]],resize_keyboard:true,one_time_keyboard:true}});
  } else {
   await bot.sendMessage(msg.chat.id,`Готово, ${u.first_name||"пользователь"}! Регистрация завершена.`,WEBAPP_URL?{reply_markup:{inline_keyboard:[[{text:"🛍 Открыть каталог",web_app:{url:WEBAPP_URL}}]]}}:undefined);
  }
 });
 bot.on("contact",async msg=>{
  const c=msg.contact;if(!c||!msg.from)return;
  if(String(c.user_id||"")!==String(msg.from.id)){return bot.sendMessage(msg.chat.id,"Поделись именно своим контактом через кнопку Telegram.");}
  upsertUser(msg.from,c.phone_number||"");
  await bot.sendMessage(msg.chat.id,"✅ Номер сохранён. Регистрация завершена.",{reply_markup:{remove_keyboard:true,...(WEBAPP_URL?{inline_keyboard:[[{text:"🛍 Открыть каталог",web_app:{url:WEBAPP_URL}}]]}: {})}});
 });
 console.log("Telegram bot polling enabled");
}else console.log("BOT_TOKEN is not set; Telegram bot is disabled");

app.listen(PORT,()=>console.log(`Mini App running on port ${PORT}`));
