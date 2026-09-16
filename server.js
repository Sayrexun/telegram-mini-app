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
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL
);
`);

const count = db.prepare("SELECT COUNT(*) c FROM categories").get().c;
if (!count) {
  const add = db.prepare("INSERT OR IGNORE INTO categories(name) VALUES(?)");
  ["Nowości","Popularne","Akcesoria"].forEach((name) => add.run(name));
}
const pcount = db.prepare("SELECT COUNT(*) c FROM products").get().c;
if (!pcount) {
  const add = db.prepare("INSERT INTO products(name,category,price,image,description) VALUES(?,?,?,?,?)");
  add.run("Produkt demonstracyjny A","Nowości",49,"https://placehold.co/700x700/202024/ffffff?text=Produkt+A","Opis produktu");
  add.run("Produkt demonstracyjny B","Nowości",59,"https://placehold.co/700x700/202024/ffffff?text=Produkt+B","Opis produktu");
  add.run("Produkt demonstracyjny C","Akcesoria",29,"https://placehold.co/700x700/202024/ffffff?text=Produkt+C","Opis produktu");
}

app.use(express.json({limit:"1mb"}));
app.use(express.static(path.join(__dirname,"public")));

function auth(req,res,next){
  if (req.headers["x-admin-key"] !== ADMIN_KEY) return res.status(401).json({error:"Unauthorized"});
  next();
}

app.get("/api/catalog",(req,res)=>{
  const products = db.prepare("SELECT * FROM products WHERE active=1 ORDER BY id DESC").all();
  const categories = db.prepare("SELECT * FROM categories ORDER BY id").all();
  res.json({products,categories});
});

app.get("/api/admin/products",auth,(req,res)=>{
  res.json(db.prepare("SELECT * FROM products ORDER BY id DESC").all());
});

app.post("/api/admin/products",auth,(req,res)=>{
  const {name,category,price,image="",description=""}=req.body;
  if(!name || !category || !Number.isFinite(Number(price))) return res.status(400).json({error:"Invalid data"});
  db.prepare("INSERT OR IGNORE INTO categories(name) VALUES(?)").run(category);
  const info=db.prepare("INSERT INTO products(name,category,price,image,description) VALUES(?,?,?,?,?)")
    .run(name,category,Number(price),image,description);
  res.json(db.prepare("SELECT * FROM products WHERE id=?").get(info.lastInsertRowid));
});

app.put("/api/admin/products/:id",auth,(req,res)=>{
  const {name,category,price,image="",description="",active=1}=req.body;
  db.prepare("INSERT OR IGNORE INTO categories(name) VALUES(?)").run(category);
  db.prepare(`UPDATE products SET name=?,category=?,price=?,image=?,description=?,active=? WHERE id=?`)
    .run(name,category,Number(price),image,description,active?1:0,req.params.id);
  res.json({ok:true});
});

app.delete("/api/admin/products/:id",auth,(req,res)=>{
  db.prepare("DELETE FROM products WHERE id=?").run(req.params.id);
  res.json({ok:true});
});

app.post("/api/admin/categories",auth,(req,res)=>{
  const {name}=req.body;
  if(!name) return res.status(400).json({error:"Name required"});
  db.prepare("INSERT OR IGNORE INTO categories(name) VALUES(?)").run(name);
  res.json({ok:true});
});

app.listen(PORT,()=>console.log(`Mini App running on port ${PORT}`));
