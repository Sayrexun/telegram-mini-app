const tg = window.Telegram?.WebApp; tg?.ready(); tg?.expand();
const user = tg?.initDataUnsafe?.user || null;
if (user) { document.getElementById('user').textContent = user.username ? '@'+user.username : (user.first_name || 'Пользователь'); fetch('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({telegram_user:user})}).catch(()=>{}); }
let all=[];let selected='Все';
async function load(){const r=await fetch('/api/catalog');const d=await r.json();all=d.products||[];renderCats(d.categories||[]);render();}
function renderCats(cats){const el=document.getElementById('categories');el.className='cats';el.innerHTML='';['Все',...cats.map(x=>x.name)].forEach(c=>{const b=document.createElement('button');b.className='cat'+(c===selected?' active':'');b.textContent=c;b.onclick=()=>{selected=c;renderCats(cats);render()};el.appendChild(b)});}
function render(){const p=selected==='Все'?all:all.filter(x=>x.category===selected);document.getElementById('products').className='grid';document.getElementById('products').innerHTML=p.map(x=>`<article class="card"><img src="${x.image||'https://placehold.co/700x700/202024/ffffff?text=Product'}" onerror="this.src='https://placehold.co/700x700/202024/ffffff?text=Product'"><div><div class="name">${escapeHtml(x.name)}</div><div class="muted">${escapeHtml(x.category)}</div><div class="price">${Number(x.price).toFixed(2)} zł</div></div></article>`).join('');}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
load().catch(e=>console.error(e));
