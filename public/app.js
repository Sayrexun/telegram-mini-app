const tg=window.Telegram?.WebApp;
if(tg){tg.ready();tg.expand();}

let data={products:[],categories:[]}, selected="Все", cart=[];
const $=id=>document.getElementById(id);

async function load(){
  const r=await fetch("/api/catalog"); data=await r.json();
  renderCategories(); render();
}
function renderCategories(){
  const names=["Все",...data.categories.map(x=>x.name)];
  $("categories").innerHTML=names.map(n=>`<button class="category ${n===selected?"active":""}" onclick="selectCat(${JSON.stringify(n)})">${n}</button>`).join("");
}
function selectCat(n){selected=n;renderCategories();render()}
function render(){
  const q=$("search").value.trim().toLowerCase();
  const list=data.products.filter(p=>(selected==="Все"||p.category===selected)&&
    (p.name.toLowerCase().includes(q)||p.description.toLowerCase().includes(q)));
  $("catalog").innerHTML=list.length?`<h2 class="section-title">${selected}</h2><div class="grid">${list.map(p=>`
    <article class="card">
      <img class="photo" src="${esc(p.image||"https://placehold.co/700x700/202024/ffffff?text=Product")}" alt="">
      <div class="info"><div class="name">${esc(p.name)}</div><div class="desc">${esc(p.description||"")}</div>
      <div class="row"><span class="price">${Number(p.price).toFixed(0)} zł</span><button class="add" onclick="add(${p.id})">+</button></div></div>
    </article>`).join("")}</div>`:`<div class="empty">Ничего не найдено</div>`;
}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function add(id){cart.push(id);$("cartCount").textContent=cart.length;toast("Добавлено в корзину")}
function toast(t){$("toast").textContent=t;$("toast").style.display="block";setTimeout(()=>$("toast").style.display="none",1200)}
$("search").addEventListener("input",render);
$("cart").onclick=()=>{
 const counts={};cart.forEach(id=>counts[id]=(counts[id]||0)+1);
 const items=Object.entries(counts).map(([id,n])=>{const p=data.products.find(x=>x.id==id);return p?`<div class="cart-item"><span>${esc(p.name)} × ${n}</span><b>${(p.price*n).toFixed(0)} zł</b></div>`:""}).join("");
 const total=cart.reduce((s,id)=>s+(data.products.find(p=>p.id===id)?.price||0),0);
 const m=document.createElement("div");m.className="modal";m.style.display="flex";m.innerHTML=`<div class="sheet"><h2>Корзина</h2>${items||'<div class="empty">Корзина пуста</div>'}<div class="row"><b>Итого</b><b class="price">${total.toFixed(0)} zł</b></div><div class="cart-actions"><button class="secondary" onclick="this.closest('.modal').remove()">Закрыть</button><button class="primary" onclick="toast('Демо: оформление заказа отключено');this.closest('.modal').remove()">Продолжить</button></div></div>`;document.body.appendChild(m);
};
$("lang").onclick=()=>toast("Язык: RU");
load();
