const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}

let data = {
  products: [],
  categories: []
};

let selected = "Все";
let cart = [];

const $ = (id) => document.getElementById(id);

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function variantsOf(product) {
  try {
    const value =
      typeof product.variants === "string"
        ? JSON.parse(product.variants || "[]")
        : product.variants;

    return Array.isArray(value) ? value.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function notify(text) {
  const el = $("toast");

  if (!el) return;

  el.textContent = text;
  el.classList.add("show");

  clearTimeout(window.__toastTimer);

  window.__toastTimer = setTimeout(() => {
    el.classList.remove("show");
  }, 1400);
}

function normalizeCart() {
  cart = cart
    .map((item) => {
      if (typeof item === "number" || typeof item === "string") {
        return {
          id: item,
          variant: "",
          qty: 1
        };
      }

      return item;
    })
    .filter((item) => item && item.id);
}

async function loadCatalog() {
  const catalog = $("catalog");

  try {
    const response = await fetch("/api/catalog", {
      method: "GET",
      cache: "no-store",
      headers: {
        Accept: "application/json"
      }
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(`API ${response.status}`);
    }

    let json;

    try {
      json = JSON.parse(text);
    } catch {
      throw new Error("API returned invalid JSON");
    }

    data.products = Array.isArray(json.products)
      ? json.products
      : [];

    data.categories = Array.isArray(json.categories)
      ? json.categories
      : [];

    console.log("Catalog:", data);

    renderCategories();
    render();

  } catch (error) {
    console.error("Catalog error:", error);

    if (catalog) {
      catalog.innerHTML = `
        <div class="empty">
          Не удалось загрузить каталог
        </div>
      `;
    }
  }
}

function renderCategories() {
  const container = $("categories");

  if (!container) return;

  const categoryNames = data.categories
    .map((item) => item.name)
    .filter(Boolean);

  const names = ["Все", ...categoryNames];

  if (!names.includes(selected)) {
    selected = "Все";
  }

  container.innerHTML = names
    .map((name) => `
      <button
        class="category ${name === selected ? "active" : ""}"
        onclick="selectCategory(${JSON.stringify(name)})"
      >
        ${esc(name)}
      </button>
    `)
    .join("");
}

function selectCategory(name) {
  selected = name;

  renderCategories();
  render();
}

window.selectCategory = selectCategory;

function render() {
  const catalog = $("catalog");

  if (!catalog) return;

  const search = $("search");

  const query = String(
    search?.value || ""
  )
    .trim()
    .toLowerCase();

  const products = data.products.filter((product) => {
    const categoryOk =
      selected === "Все" ||
      product.category === selected;

    const searchOk =
      !query ||
      String(product.name || "")
        .toLowerCase()
        .includes(query) ||
      String(product.description || "")
        .toLowerCase()
        .includes(query);

    return categoryOk && searchOk;
  });

  if ($("sectionTitle")) {
    $("sectionTitle").textContent =
      query
        ? "Результаты поиска"
        : selected === "Все"
          ? "Популярные товары"
          : selected;
  }

  if (!products.length) {
    catalog.innerHTML = `
      <div class="empty">
        Товаров пока нет
      </div>
    `;

    return;
  }

  catalog.innerHTML = `
    <div class="grid">
      ${products.map((product) => {
        const variants = variantsOf(product);

        const image =
          product.image ||
          "https://placehold.co/700x700/202024/ffffff?text=Товар";

        const price = Number(product.price || 0);

        return `
          <article
            class="card"
            onclick="openProduct(${Number(product.id)})"
          >

            <div class="photo-wrap">

              <img
                class="photo"
                src="${esc(image)}"
                alt="${esc(product.name)}"
                loading="lazy"
                onerror="this.src='https://placehold.co/700x700/202024/ffffff?text=Товар'"
              >

              <span class="badge">
                Каталог
              </span>

              <button
                class="fav"
                onclick="event.stopPropagation(); notify('Добавлено в избранное')"
              >
                ♡
              </button>

            </div>

            <div class="info">

              <div class="name">
                ${esc(product.name)}
              </div>

              <div class="desc">
                ${esc(
                  product.description ||
                  "Описание товара"
                )}
              </div>

              ${
                variants.length
                  ? `
                    <div class="variant-hint">
                      Варианты:
                      ${esc(
                        variants.slice(0, 3).join(", ")
                      )}
                      ${variants.length > 3 ? "…" : ""}
                    </div>
                  `
                  : ""
              }

              <div class="product-bottom">

                <span class="price">
                  ${price.toFixed(0)} zł
                </span>

                <button
                  class="add"
                  onclick="event.stopPropagation(); openProduct(${Number(product.id)})"
                >
                  ${variants.length ? "Выбрать" : "В корзину"}
                </button>

              </div>

            </div>

          </article>
        `;
      }).join("")}
    </div>
  `;
}

function openProduct(id) {
  const product = data.products.find(
    (item) => Number(item.id) === Number(id)
  );

  if (!product) return;

  const variants = variantsOf(product);

  const image =
    product.image ||
    "https://placehold.co/700x700/202024/ffffff?text=Товар";

  const modal = document.createElement("div");

  modal.className = "modal";

  modal.innerHTML = `
    <div class="sheet product-sheet">

      <button
        class="modal-close"
        onclick="this.closest('.modal').remove()"
      >
        ×
      </button>

      <img
        class="modal-photo"
        src="${esc(image)}"
        alt="${esc(product.name)}"
        onerror="this.src='https://placehold.co/700x700/202024/ffffff?text=Товар'"
      >

      <h2>
        ${esc(product.name)}
      </h2>

      ${
        product.description
          ? `
            <p class="desc">
              ${esc(product.description)}
            </p>
          `
          : ""
      }

      ${
        variants.length
          ? `
            <label class="variant-label">

              Выберите вариант

              <select id="variantSelect">

                ${variants.map((variant) => `
                  <option value="${esc(variant)}">
                    ${esc(variant)}
                  </option>
                `).join("")}

              </select>

            </label>
          `
          : ""
      }

      <div class="product-bottom">

        <b>Цена</b>

        <b class="price">
          ${Number(product.price || 0).toFixed(0)} zł
        </b>

      </div>

      <button
        class="primary full"
        onclick="addSelected(${Number(product.id)})"
      >
        Добавить в корзину
      </button>

    </div>
  `;

  document.body.appendChild(modal);
}

window.openProduct = openProduct;

window.addSelected = function (id) {
  const product = data.products.find(
    (item) => Number(item.id) === Number(id)
  );

  if (!product) return;

  const variant =
    $("variantSelect")?.value || "";

  const existing = cart.find(
    (item) =>
      Number(item.id) === Number(product.id) &&
      item.variant === variant
  );

  if (existing) {
    existing.qty = (Number(existing.qty) || 1) + 1;
  } else {
    cart.push({
      id: product.id,
      variant,
      qty: 1
    });
  }

  updateCartCount();

  document.querySelector(".modal")?.remove();

  notify("Добавлено в корзину");
};

function updateCartCount() {
  normalizeCart();

  const count = $("cartCount");

  if (count) {
    count.textContent = cart.reduce(
      (sum, item) =>
        sum + (Number(item.qty) || 1),
      0
    );
  }
}

window.removeCart = function (index) {
  cart.splice(index, 1);

  updateCartCount();

  document.querySelector(".modal")?.remove();

  openCart();
};

function openCart() {
  normalizeCart();

  const validItems = cart
    .map((item, index) => {
      const product = data.products.find(
        (p) => Number(p.id) === Number(item.id)
      );

      if (!product) return null;

      return {
        item,
        product,
        index
      };
    })
    .filter(Boolean);

  const total = validItems.reduce(
    (sum, { item, product }) =>
      sum +
      Number(product.price || 0) *
      (Number(item.qty) || 1),
    0
  );

  const modal = document.createElement("div");

  modal.className = "modal";

  modal.innerHTML = `
    <div class="sheet">

      <button
        class="modal-close"
        onclick="this.closest('.modal').remove()"
      >
        ×
      </button>

      <h2>
        Корзина
      </h2>

      ${
        validItems.length
          ? validItems.map(({ item, product, index }) => `
              <div class="cart-item">

                <span>
                  ${esc(product.name)}

                  ${
                    item.variant
                      ? `
                        <small>
                          · ${esc(item.variant)}
                        </small>
                      `
                      : ""
                  }

                  × ${Number(item.qty) || 1}
                </span>

                <b>
                  ${(
                    Number(product.price || 0) *
                    (Number(item.qty) || 1)
                  ).toFixed(0)}
                  zł
                </b>

                <button
                  class="cart-remove"
                  onclick="removeCart(${index})"
                >
                  ×
                </button>

              </div>
            `).join("")
          : `
            <div class="empty">
              Корзина пуста
            </div>
          `
      }

      <div class="product-bottom">

        <b>
          Итого
        </b>

        <b class="price">
          ${total.toFixed(0)} zł
        </b>

      </div>

      <div class="cart-actions">

        <button
          class="secondary"
          onclick="this.closest('.modal').remove()"
        >
          Закрыть
        </button>

        ${
          validItems.length
            ? `
              <button
                class="primary"
                onclick="openRequestForm()"
              >
                Оставить заявку
              </button>
            `
            : ""
        }

      </div>

    </div>
  `;

  document.body.appendChild(modal);
}

window.notify = notify;

window.openRequestForm = function () {
  normalizeCart();

  if (!cart.length) {
    notify("Корзина пуста");
    return;
  }

  notify("Корзина готова к оформлению");
};

$("search")?.addEventListener(
  "input",
  render
);

$("lang")?.addEventListener(
  "click",
  () => notify("Язык: RU")
);

$("cart")?.addEventListener(
  "click",
  openCart
);

$("heroCatalog")?.addEventListener(
  "click",
  () => {
    $("catalog")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }
);

$("viewAll")?.addEventListener(
  "click",
  () => {
    selected = "Все";

    renderCategories();
    render();
  }
);

document
  .querySelectorAll(".side-link")
  .forEach((button) => {

    button.addEventListener(
      "click",
      () => {

        document
          .querySelectorAll(".side-link")
          .forEach((item) =>
            item.classList.remove("active")
          );

        button.classList.add("active");

        const map = {
          home: "Все",
          catalog: "Все",
          new: "Новинки",
          popular: "Популярные",
          accessories: "Аксессуары"
        };

        const wanted =
          map[button.dataset.side];

        const available = [
          "Все",
          ...data.categories.map(
            (item) => item.name
          )
        ];

        if (available.includes(wanted)) {
          selected = wanted;

          renderCategories();
          render();
        } else {
          $("catalog")?.scrollIntoView({
            behavior: "smooth",
            block: "start"
          });
        }

      }
    );

  });

updateCartCount();

loadCatalog();
