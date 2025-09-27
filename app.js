// Advanced app.js for HiTech shop - Firebase based
let cart = [];

function initFirebase(){
  const firebaseConfig = {
    apiKey: "AIzaSyC7bzqvjcPJr1KuNCQHARzViSzBjC2d36U",
    authDomain: "hi-tech-6becf.firebaseapp.com",
    projectId: "hi-tech-6becf",
    storageBucket: "hi-tech-6becf.appspot.com",
    messagingSenderId: "950613396329",
    appId: "1:950613396329:web:af749c15fdcef3805bcbf8",
    measurementId: "G-QS40KV8TVD"
  };
  firebase.initializeApp(firebaseConfig);
  window.db = firebase.firestore();
  window.auth = firebase.auth();
  window.storage = firebase.storage();
  console.log('Firebase initialized for project:', firebaseConfig.projectId);
}

/* ----------------- Customer side ----------------- */
async function loadCategories(){
  const snap = await db.collection('categories').orderBy('created_at','desc').get();
  const list = document.getElementById('categoryList');
  if(!list) return;
  list.innerHTML='';
  snap.forEach(d=>{
    const c = d.data();
    const li = document.createElement('li');
    li.textContent = c.name_ar;
    li.onclick = ()=> loadProducts(null, c.id);
    list.appendChild(li);
  });
}

async function loadProducts(search='', categoryId=null){
  const grid = document.getElementById('productsGrid');
  if(!grid) return;
  grid.innerHTML = '<p>جارٍ التحميل...</p>';
  let q = db.collection('products').orderBy('created_at','desc');
  const snap = await q.get();
  grid.innerHTML='';
  snap.forEach(doc=>{
    const p = doc.data();
    if(categoryId && p.category_id !== categoryId) return;
    if(search && !p.name_ar.includes(search) && !p.description_ar?.includes(search)) return;
    const card = document.createElement('div'); card.className='card';
    const img = (p.images && p.images[0] && p.images[0].url) ? `<img src="${p.images[0].url}" alt="">` : '';
    card.innerHTML = `<div class="card-media">${img}</div><div class="card-body"><h4>${p.name_ar}</h4><p class="price">${p.price} ج.م</p><p>الكمية: ${p.stock||0}</p><div class="actions"><button class="addBtn">أضف للسلة</button><button class="viewBtn">عرض</button></div></div>`;
    card.querySelector('.addBtn').onclick = ()=>{ addToCart(p); };
    card.querySelector('.viewBtn').onclick = ()=>{ alert(p.name_ar + '\n' + (p.description_ar||'')); };
    grid.appendChild(card);
  });
}

function addToCart(product){
  const existing = cart.find(i=>i.id===product.id);
  if(existing){ existing.qty +=1; } else { cart.push({...product, qty:1}); }
  sessionStorage.setItem('hitech_cart', JSON.stringify(cart));
  renderCart();
}

function renderCart(){
  const panel = document.getElementById('cartPanel');
  const count = document.getElementById('cartCount');
  const items = document.getElementById('cartItems');
  const totalEl = document.getElementById('cartTotal');
  cart = JSON.parse(sessionStorage.getItem('hitech_cart')||'[]');
  if(cart.length===0){ panel.style.display='none'; count.textContent='0'; return; }
  panel.style.display='block'; count.textContent = cart.length;
  items.innerHTML='';
  let total=0;
  cart.forEach(item=>{
    total += (item.price||0)*item.qty;
    const div = document.createElement('div'); div.className='cart-item';
    div.innerHTML = `<b>${item.name_ar}</b> - ${item.price} ج.م - <input type="number" value="${item.qty}" min="1" style="width:60px;" /> <button>حذف</button>`;
    div.querySelector('input').onchange = (e)=>{ item.qty = Number(e.target.value); sessionStorage.setItem('hitech_cart', JSON.stringify(cart)); renderCart(); };
    div.querySelector('button').onclick = ()=>{ cart = cart.filter(i=>i.id!==item.id); sessionStorage.setItem('hitech_cart', JSON.stringify(cart)); renderCart(); };
    items.appendChild(div);
  });
  totalEl.textContent = total;
}

/* ----------------- Orders ----------------- */
async function createOrder(orderPayload, file){
  // validate minimal
  if(!orderPayload.name || !orderPayload.phone || !orderPayload.address) throw new Error('اكمل بيانات العميل');
  const ref = db.collection('orders').doc();
  const id = ref.id;
  let proof = null;
  if(file){
    const allowed = ['png','jpg','jpeg','webp'];
    const ext = file.name.split('.').pop().toLowerCase();
    if(!allowed.includes(ext)) throw new Error('نوع ملف غير مدعوم');
    if(file.size > 2*1024*1024) throw new Error('حجم الملف أكبر من 2 ميجا');
    const sref = storage.ref().child(`payment_screens/${id}_${Date.now()}.${ext}`);
    await sref.put(file);
    const url = await sref.getDownloadURL();
    proof = { url };
  }
  const doc = {
    id, created_at: firebase.firestore.FieldValue.serverTimestamp(),
    customer: { name: orderPayload.name, phone: orderPayload.phone, address: orderPayload.address, notes: orderPayload.notes||'' },
    items: orderPayload.items, payment_method: orderPayload.paymentMethod, payment_proof: proof, total_amount: orderPayload.total, status: 'Pending', seen_by_admin: false
  };
  await ref.set(doc);
  await db.collection('admin_inbox').add({ orderId: id, created_at: firebase.firestore.FieldValue.serverTimestamp(), read:false });
  return { success:true, id };
}

/* ----------------- Admin functions ----------------- */
async function adminLogin(email,password){
  const user = await auth.signInWithEmailAndPassword(email,password);
  return user.user;
}

function listenForOrders(cb){
  return db.collection('orders').orderBy('created_at','desc').onSnapshot(snap=>cb(snap.docs.map(d=>d.data())));
}

async function updateOrderStatus(orderId, status){
  await db.collection('orders').doc(orderId).update({ status, updated_at: firebase.firestore.FieldValue.serverTimestamp() });
}

async function adminAddCategory(name){
  const ref = db.collection('categories').doc();
  const id = ref.id;
  const doc = { id, name_ar: name, created_at: firebase.firestore.FieldValue.serverTimestamp() };
  await ref.set(doc);
  return doc;
}

async function loadCategoriesAdmin(){
  const snap = await db.collection('categories').orderBy('created_at','desc').get();
  const c = document.getElementById('catListAdmin');
  const sel = document.getElementById('prodCategory') || document.getElementById('prodCategory');
  if(c) c.innerHTML='';
  const cats = [];
  snap.forEach(d=>{ cats.push(d.data()); if(c){ const div = document.createElement('div'); div.innerHTML = `<input value="${d.data().name_ar}" id="cat_${d.id}" /> <button onclick="saveCategoryEdit('${d.id}')">حفظ</button> <button onclick="deleteCategory('${d.id}')">حذف</button>`; c.appendChild(div);} });
  // populate selects in admin and customer if exist
  const selProd = document.getElementById('prodCategory');
  if(selProd){ selProd.innerHTML = '<option value="">-- بدون فئة --</option>'; cats.forEach(cat=>{ const opt=document.createElement('option'); opt.value=cat.id; opt.textContent=cat.name_ar; selProd.appendChild(opt); }); }
}

async function saveCategoryEdit(id){
  const name = document.getElementById('cat_'+id).value.trim();
  await db.collection('categories').doc(id).update({ name_ar: name, updated_at: firebase.firestore.FieldValue.serverTimestamp() });
  await loadCategories();
  await loadCategoriesAdmin();
  alert('تم حفظ الفئة');
}

async function deleteCategory(id){
  if(!confirm('تأكيد حذف الفئة؟')) return;
  await db.collection('categories').doc(id).delete();
  await loadCategories();
  await loadCategoriesAdmin();
}

/* Products admin */
async function adminAddProduct(productObj, files){
  const ref = db.collection('products').doc();
  const id = ref.id;
  let images=[];
  if(files && files.length){
    for(let i=0;i<files.length;i++){
      const f = files[i]; const ext=f.name.split('.').pop();
      const sref = storage.ref().child(`product_images/${id}_${Date.now()}_${i}.${ext}`);
      await sref.put(f);
      const url = await sref.getDownloadURL();
      images.push({ url });
    }
  }
  const doc = { id, ...productObj, images, created_at: firebase.firestore.FieldValue.serverTimestamp() };
  await ref.set(doc);
  return doc;
}

async function loadProductsAdmin(){
  const snap = await db.collection('products').orderBy('created_at','desc').get();
  const c = document.getElementById('prodListAdmin');
  if(!c) return;
  c.innerHTML='';
  const cats = await db.collection('categories').get();
  const catMap = {}; cats.forEach(d=>catMap[d.id]=d.data().name_ar);
  snap.forEach(doc=>{
    const p = doc.data();
    const div = document.createElement('div'); div.className='product-admin';
    div.innerHTML = `<b>${p.name_ar}</b> - ${p.price} ج.م - فئة: ${catMap[p.category_id]||'بدون'} <br/>
      <button onclick="startEditProduct('${p.id}')">تعديل</button>
      <button onclick="deleteProduct('${p.id}')">حذف</button>
    `;
    c.appendChild(div);
  });
}

async function startEditProduct(id){
  const doc = await db.collection('products').doc(id).get();
  const p = doc.data();
  const name = prompt('اسم المنتج', p.name_ar);
  if(name===null) return;
  const price = prompt('السعر', p.price);
  if(price===null) return;
  await db.collection('products').doc(id).update({ name_ar:name, price: Number(price), updated_at: firebase.firestore.FieldValue.serverTimestamp() });
  await loadProducts();
  await loadProductsAdmin();
}

async function deleteProduct(id){
  if(!confirm('تأكيد حذف المنتج؟')) return;
  await db.collection('products').doc(id).delete();
  await loadProducts();
  await loadProductsAdmin();
}

/* Utilities */
async function loadCategories(){
  // used by storefront too to populate category list
  const snap = await db.collection('categories').orderBy('created_at','desc').get();
  const list = document.getElementById('categoryList');
  if(!list) return;
  list.innerHTML='';
  snap.forEach(d=>{ const c=d.data(); const li=document.createElement('li'); li.textContent=c.name_ar; li.onclick=()=>loadProducts(null,c.id); list.appendChild(li); });
}

async function loadProducts(){
  // wrapper to call storefront loader
  return loadProducts(null,null);
}

async function getFactorySettings(){
  const doc = await db.collection('settings').doc('app').get();
  return doc.exists ? doc.data() : {};
}

async function saveFactorySettings(obj){
  await db.collection('settings').doc('app').set(obj, { merge:true });
}

/* export order CSV */
async function downloadOrderCSV(orderId){
  const doc = await db.collection('orders').doc(orderId).get();
  if(!doc.exists) return alert('Order not found');
  const o = doc.data();
  const rows = [['Order ID','Product','Qty','Unit','Total']];
  o.items.forEach(it=> rows.push([o.id, it.name_ar||it.name, it.qty, it.price, (it.qty*(it.price||0))]));
  const csv = rows.map(r=>r.map(v=>`"${(v||'')}"`).join(',')).join('\n');
  const blob = new Blob([csv],{type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download = `order_${orderId}.csv`; a.click();
}

/* Admin orders listener wrapper for admin page */
function listenForOrders(cb){
  return db.collection('orders').orderBy('created_at','desc').onSnapshot(snap=>cb(snap.docs.map(d=>d.data())));
}
