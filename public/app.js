const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

const DEMO_MODE = false;
const demoData = { categories: [], products: [] };
let data = { products: [], categories: [] };
let selected = "Все";
let cart = [];
const $ = id => document.getElementById(id);

function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function variantsOf(p) { try { const v = typeof p.variants === 'string' ? JSON.parse(p.variants || '[]') : p.variants; return Array.isArray(v) ? v.filter(Boolean) : []; } catch { return []; } }
function normalizeCart() {
  cart = cart.map(x => typeof x === 'number' || typeof x === 'string' ? { id: x, variant: '', qty: 1 } : x).filter(x => x && x.id);
}
async function registerUser() {
  const user = window.Telegram?.WebApp?.initDataUnsafe?.user;
  if (!user?.id) return;
  try { await fetch('/api/user', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({user}) }); } catch {}
}
async function load() {
  normalizeCart();
  if (DEMO_MODE) { data = demoData; renderCategories(); render(); return; }
  try {
    await registerUser();
    const r = await fetch('/api/catalog');
    if (!r.ok) throw new Error();
    data = await r.json(); renderCategories(); render();
  } catch { $('catalog').innerHTML = '<div class="empty">Не удалось загрузить каталог</div>'; }
}
function renderCategories() {
  const names = ['Все', ...data.categories.map(x => x.name)];
  $('categories').innerHTML = names.map(n => `<button class="category ${n===selected?'active':''}" onclick='selectCat(${JSON.stringify(n)})'>${esc(n)}</button>`).join('');
}
function selectCat(n) { selected=n; renderCategories(); render(); }
function render() {
  const q = $('search').value.trim().toLowerCase();
  const list = data.products.filter(p => {
    const catOk = selected === 'Все' || p.category === selected;
    const searchOk = String(p.name).toLowerCase().includes(q) || String(p.description||'').toLowerCase().includes(q);
    return catOk && searchOk;
  });
  $('sectionTitle').textContent = q ? 'Результаты поиска' : selected==='Все' ? 'Популярные товары' : selected;
  $('catalog').innerHTML = list.length ? `<div class="grid">${list.map((p,i)=>{
    const vars=variantsOf(p);
    return `<article class="card" onclick="openProduct(${p.id})">
      <div class="photo-wrap"><img class="photo" src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy"><span class="badge">${i<2?'Популярное':'Каталог'}</span><button class="fav" onclick="event.stopPropagation();toast('Добавлено в избранное')" aria-label="Избранное">♡</button></div>
      <div class="info"><div class="name">${esc(p.name)}</div><div class="desc">${esc(p.description||'Описание товара')}</div>
      ${vars.length?`<div class="variant-hint">Варианты: ${esc(vars.slice(0,3).join(', '))}${vars.length>3?'…':''}</div>`:''}
      <div class="product-bottom"><span class="price">${Number(p.price).toFixed(0)} zł</span><button class="add" onclick="event.stopPropagation();openProduct(${p.id})">${vars.length?'Выбрать':'В корзину'}</button></div></div></article>`;
  }).join('')}</div>` : '<div class="empty">Ничего не найдено</div>';
}
function openProduct(id) {
  const p=data.products.find(x=>x.id==id); if(!p)return;
  const vars=variantsOf(p);
  const modal=document.createElement('div'); modal.className='modal';
  modal.innerHTML=`<div class="sheet product-sheet"><button class="modal-close" onclick="this.closest('.modal').remove()">×</button><img class="modal-photo" src="${esc(p.image)}" alt="${esc(p.name)}"><h2>${esc(p.name)}</h2><p class="desc">${esc(p.description||'')}</p>
    ${vars.length?`<label class="variant-label">Выберите вариант<select id="variantSelect">${vars.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('')}</select></label>`:''}
    <div class="product-bottom"><b>Цена</b><b class="price">${Number(p.price).toFixed(0)} zł</b></div>
    <button class="primary full" onclick="addSelected(${p.id})">Добавить в корзину</button></div>`;
  document.body.appendChild(modal);
}
window.openProduct=openProduct;
window.addSelected=function(id){ const p=data.products.find(x=>x.id==id); if(!p)return; const variant=$('variantSelect')?.value||''; cart.push({id:p.id,variant,qty:1}); updateCartCount(); document.querySelector('.modal')?.remove(); toast('Добавлено в корзину'); };
function updateCartCount(){ normalizeCart(); $('cartCount').textContent=cart.reduce((s,x)=>s+(Number(x.qty)||1),0); }
function toast(text){ const el=$('toast'); el.textContent=text; el.classList.add('show'); clearTimeout(window.__toast); window.__toast=setTimeout(()=>el.classList.remove('show'),1200); }
$('search').addEventListener('input',render);
$('lang').onclick=()=>toast('Язык: RU');
$('heroCatalog').onclick=()=>$('catalog').scrollIntoView({behavior:'smooth',block:'start'});
$('viewAll').onclick=()=>{selected='Все';renderCategories();render();};
document.querySelectorAll('.side-link').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('.side-link').forEach(x=>x.classList.remove('active'));btn.classList.add('active');const map={home:'Все',catalog:'Все',new:'Новинки',popular:'Популярные',accessories:'Аксессуары'};const wanted=map[btn.dataset.side];if(['Все',...data.categories.map(x=>x.name)].includes(wanted)){selected=wanted;renderCategories();render();}else $('catalog').scrollIntoView({behavior:'smooth',block:'start'});});

$('cart').onclick=()=>{
  normalizeCart();
  const items=cart.map((item,index)=>{const p=data.products.find(x=>x.id==item.id);if(!p)return '';const qty=Number(item.qty)||1;return `<div class="cart-item"><span>${esc(p.name)}${item.variant?` <small>· ${esc(item.variant)}</small>`:''} × ${qty}</span><b>${(Number(p.price)*qty).toFixed(0)} zł</b><button class="cart-remove" onclick="removeCart(${index})">×</button></div>`;}).join('');
  const total=cart.reduce((sum,item)=>{const p=data.products.find(x=>x.id==item.id);return sum+(p?Number(p.price)*(Number(item.qty)||1):0)},0);
  const modal=document.createElement('div');modal.className='modal';modal.innerHTML=`<div class="sheet"><button class="modal-close" onclick="this.closest('.modal').remove()">×</button><h2>Корзина</h2>${items||'<div class="empty">Корзина пуста</div>'}<div class="product-bottom"><b>Итого</b><b class="price">${total.toFixed(0)} zł</b></div><div class="cart-actions"><button class="secondary" onclick="this.closest('.modal').remove()">Закрыть</button>${cart.length?'<button class="primary" onclick="openRequestForm()">Оставить заявку</button>':''}</div></div>`;document.body.appendChild(modal);
};
window.removeCart=function(index){cart.splice(index,1);updateCartCount();document.querySelector('.modal')?.remove();$('cart').click();};
window.openRequestForm=function(){
  normalizeCart(); if(!cart.length){toast('Корзина пуста');return;}
  const items=cart.map(item=>{const p=data.products.find(x=>x.id==item.id);return p?{id:p.id,name:p.name,qty:Number(item.qty)||1,price:Number(p.price),variant:item.variant||''}:null}).filter(Boolean);
  const total=items.reduce((s,x)=>s+x.price*x.qty,0);document.querySelector('.modal')?.remove();const m=document.createElement('div');m.className='modal';m.innerHTML=`<div class="sheet"><button class="modal-close" onclick="this.closest('.modal').remove()">×</button><h2>Новая заявка</h2><div>${items.map(x=>`<div class="cart-item"><span>${esc(x.name)}${x.variant?` <small>· ${esc(x.variant)}</small>`:''} × ${x.qty}</span><b>${(x.price*x.qty).toFixed(0)} zł</b></div>`).join('')}</div><div class="product-bottom"><b>Итого</b><b class="price">${total.toFixed(0)} zł</b></div><textarea id="requestComment" placeholder="Комментарий (необязательно)" style="width:100%;min-height:90px;margin:14px 0;padding:12px;border-radius:10px;border:1px solid #30293b;background:#0d0b12;color:#fff"></textarea><div class="cart-actions"><button class="secondary" onclick="this.closest('.modal').remove()">Отмена</button><button class="primary" onclick="submitRequest()">Отправить заявку</button></div></div>`;document.body.appendChild(m);
};
window.submitRequest=async function(){
  const user=window.Telegram?.WebApp?.initDataUnsafe?.user;if(!user?.id){toast('Откройте каталог внутри Telegram');return;}
  normalizeCart();const items=cart.map(item=>{const p=data.products.find(x=>x.id==item.id);return p?{id:p.id,name:p.name,qty:Number(item.qty)||1,price:Number(p.price),variant:item.variant||''}:null}).filter(Boolean);const total=items.reduce((s,x)=>s+x.price*x.qty,0);
  try{const r=await fetch('/api/requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({user,items,total,comment:$('requestComment')?.value||''})});if(!r.ok)throw new Error();const d=await r.json();cart=[];updateCartCount();document.querySelector('.modal')?.remove();toast('Заявка №'+d.id+' отправлена');}catch{toast('Не удалось отправить заявку');}
};
load();
