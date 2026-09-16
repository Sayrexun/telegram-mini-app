const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

const DEMO_MODE = true;

// Обычные товары-заглушки для демонстрации дизайна.
// Когда понадобится подключить каталог из API, поменяй DEMO_MODE на false.
const demoData = {
  categories: [
    { name: "Электроника" },
    { name: "Аксессуары" },
    { name: "Для дома" },
    { name: "Новинки" }
  ],
  products: [
    {
      id: 101, name: "Беспроводные наушники", category: "Электроника",
      price: 149, description: "Bluetooth · компактный кейс",
      image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=85"
    },
    {
      id: 102, name: "Механическая клавиатура", category: "Электроника",
      price: 219, description: "RGB · компактный формат",
      image: "https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=900&q=85"
    },
    {
      id: 103, name: "Городской рюкзак", category: "Аксессуары",
      price: 129, description: "Удобный рюкзак на каждый день",
      image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=85"
    },
    {
      id: 104, name: "Настольная лампа", category: "Для дома",
      price: 89, description: "Минималистичный дизайн",
      image: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=900&q=85"
    },
    {
      id: 105, name: "Термобутылка", category: "Аксессуары",
      price: 59, description: "Сталь · герметичная крышка",
      image: "https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=900&q=85"
    },
    {
      id: 106, name: "Ежедневник", category: "Для дома",
      price: 39, description: "Твёрдая обложка · 160 страниц",
      image: "https://images.unsplash.com/photo-1517842645767-c639042777db?auto=format&fit=crop&w=900&q=85"
    }
  ]
};

let data = { products: [], categories: [] };
let selected = "Все";
let cart = [];

const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[c]));
}

async function load() {
  if (DEMO_MODE) {
    data = demoData;
    renderCategories();
    render();
    return;
  }

  try {
    const r = await fetch("/api/catalog");
    if (!r.ok) throw new Error("catalog");
    data = await r.json();
    renderCategories();
    render();
  } catch {
    $("catalog").innerHTML = '<div class="empty">Не удалось загрузить каталог</div>';
  }
}

function renderCategories() {
  const names = ["Все", ...data.categories.map(x => x.name)];
  $("categories").innerHTML = names.map(n =>
    `<button class="category ${n === selected ? "active" : ""}" onclick="selectCat(${JSON.stringify(n)})">${esc(n)}</button>`
  ).join("");
}

function selectCat(n) {
  selected = n;
  renderCategories();
  render();
}

function render() {
  const q = $("search").value.trim().toLowerCase();

  const list = data.products.filter(p => {
    const catOk = selected === "Все" || p.category === selected;
    const searchOk = String(p.name).toLowerCase().includes(q) ||
      String(p.description || "").toLowerCase().includes(q);
    return catOk && searchOk;
  });

  $("sectionTitle").textContent =
    q ? "Результаты поиска" :
    selected === "Все" ? "Популярные товары" : selected;

  $("catalog").innerHTML = list.length
    ? `<div class="grid">${list.map((p, i) => `
      <article class="card">
        <div class="photo-wrap">
          <img class="photo" src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">
          <span class="badge">${i < 2 ? "Популярное" : "Каталог"}</span>
          <button class="fav" aria-label="Избранное">♡</button>
        </div>
        <div class="info">
          <div class="name">${esc(p.name)}</div>
          <div class="desc">${esc(p.description || "Описание товара")}</div>
          <div class="product-bottom">
            <span class="price">${Number(p.price).toFixed(0)} zł</span>
            <button class="add" onclick="add(${p.id})">В корзину</button>
          </div>
        </div>
      </article>
    `).join("")}</div>`
    : `<div class="empty">Ничего не найдено</div>`;
}

function add(id) {
  cart.push(id);
  $("cartCount").textContent = cart.length;
  toast("Добавлено в корзину");
}

function toast(text) {
  const el = $("toast");
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(window.__toast);
  window.__toast = setTimeout(() => el.classList.remove("show"), 1200);
}

$("search").addEventListener("input", render);
$("lang").onclick = () => toast("Язык: RU");
$("heroCatalog").onclick = () => $("catalog").scrollIntoView({ behavior: "smooth", block: "start" });

$("viewAll").onclick = () => {
  selected = "Все";
  renderCategories();
  render();
};

document.querySelectorAll(".side-link").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".side-link").forEach(x => x.classList.remove("active"));
    btn.classList.add("active");

    const map = {
      home: "Все",
      catalog: "Все",
      new: "Новинки",
      popular: "Популярные",
      accessories: "Аксессуары"
    };

    const wanted = map[btn.dataset.side];
    const exists = ["Все", ...data.categories.map(x => x.name)].includes(wanted);

    if (exists) {
      selected = wanted;
      renderCategories();
      render();
    } else {
      $("catalog").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };
});

$("cart").onclick = () => {
  const counts = {};
  cart.forEach(id => counts[id] = (counts[id] || 0) + 1);

  const items = Object.entries(counts).map(([id, n]) => {
    const p = data.products.find(x => x.id == id);
    return p
      ? `<div class="cart-item"><span>${esc(p.name)} × ${n}</span><b>${(Number(p.price) * n).toFixed(0)} zł</b></div>`
      : "";
  }).join("");

  const total = cart.reduce(
    (sum, id) => sum + (Number(data.products.find(p => p.id === id)?.price) || 0),
    0
  );

  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `
    <div class="sheet">
      <h2>Корзина</h2>
      ${items || '<div class="empty">Корзина пуста</div>'}
      <div class="product-bottom">
        <b>Итого</b><b class="price">${total.toFixed(0)} zł</b>
      </div>
      <div class="cart-actions">
        <button class="secondary" onclick="this.closest('.modal').remove()">Закрыть</button>
        <button class="primary" onclick="toast('Демо: оформление отключено');this.closest('.modal').remove()">Продолжить</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
};

load();
