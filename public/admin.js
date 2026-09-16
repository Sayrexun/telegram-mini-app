let key=localStorage.getItem('adminKey')||'';
let items=[];

function login(){
  const value=document.getElementById('key').value.trim();
  if(!value)return alert('Введи Admin key');
  key=value;
  localStorage.setItem('adminKey',key);
  document.getElementById('login').hidden=true;
  document.getElementById('panel').hidden=false;
  load();
}

async function api(url,opt={}){
  opt.headers={...(opt.headers||{}),'Content-Type':'application/json','x-admin-key':key};
  const r=await fetch(url,opt);
  const text=await r.text();
  let data;
  try{data=JSON.parse(text)}catch{throw new Error('Сервер вернул не JSON. Проверь Render и server.js.')} 
  if(r.status===401)throw new Error('Неверный Admin key');
  if(!r.ok)throw new Error(data.error||'Ошибка сервера');
  return data;
}

async function load(){
  try{
    items=await api('/api/admin/products');
    render();
  }catch(e){alert(e.message)}
}

async function save(){
  const n=document.getElementById('name').value.trim();
  const c=document.getElementById('category').value.trim();
  const p=Number(document.getElementById('price').value);
  const i=document.getElementById('image').value.trim();
  const d=document.getElementById('description').value.trim();
  if(!n||!c||!Number.isFinite(p))return alert('Заполни название, категорию и цену');
  try{
    await api('/api/admin/products',{method:'POST',body:JSON.stringify({name:n,category:c,price:p,image:i,description:d})});
    ['name','category','price','image','description'].forEach(id=>document.getElementById(id).value='');
    await load();
  }catch(e){alert(e.message)}
}

async function toggle(id){
  const p=items.find(x=>x.id===id); if(!p)return;
  try{
    await api('/api/admin/products/'+id,{method:'PUT',body:JSON.stringify({name:p.name,category:p.category,price:Number(p.price),image:p.image||'',description:p.description||'',active:p.active?0:1,variants:p.variants||[],variant_type:p.variant_type||''})});
    await load();
  }catch(e){alert(e.message)}
}

async function del(id){
  if(!confirm('Удалить товар?'))return;
  try{await api('/api/admin/products/'+id,{method:'DELETE'});await load()}catch(e){alert(e.message)}
}

function render(){
  document.getElementById('list').innerHTML=items.map((x,k)=>`<div class="item"><div><b>${esc(x.name)}</b><div class="muted">${esc(x.category)} · ${Number(x.price).toFixed(2)} zł · ${x.active?'активен':'скрыт'}</div></div><button onclick="toggle(${x.id})">${x.active?'Скрыть':'Показать'}</button><button onclick="del(${x.id})">Удалить</button></div>`).join('')||'<p>Товаров пока нет.</p>';
}

function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

if(key){
  document.getElementById('key').value=key;
  document.getElementById('login').hidden=true;
  document.getElementById('panel').hidden=false;
  load();
}
