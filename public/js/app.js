import { db, authReady } from './firebase.js';
import {
  collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot,
  getDocsFromCache, writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

let customers = [];
let orders = [];
let searchMatches = [];
let customerType = '';
let selectedProducts = [];
let selectedDesignOptions = [];
let attachedPhoto = null;
let draftOrder = null;
let draftMeasurements = null;
let lastCreatedOrder = null;
let lastCreatedMeasurements = null;

const designOptionsList = ['Double Stitching','Single Stitching','Design Button','Steel Button','Shalwar Pocket','No Label','Aik Inch Bein','Aik Inch Aik Suter Bein','Aik Inch Patti','Aik Inch Aik Suter Patti','Double Cuff','Dye Collar','Computer Kanta','Single Jaali Kanta','Double Jaali Kanta','Ring Button Normal','Ring Button Fancy','Ghera Choras','Ghera Goal','Collar','Bein','Front Pocket','Single Side Pocket','Double Side Pocket','Cuff Cutt','Cuff Goal','Trouser','Lable Bazo Pati','Lable Teere Wala'];

const productConfig = {
  'Shalwar Kameez': { fields: [
    ['chati','چھاتی'],['lambai','لمبائی'],
    ['bazu','بازو'],['tera','تیرہ'],
    ['kohni','کہنی'],['kandha','کندھا'],
    ['gheera','گھیرہ'],['kamar','کمر'],
    ['shalwar','شلوار'],['collarM','کالر'],
    ['shalwarGheera','شلوار گھیرہ'],['pancha','پانچہ'],
    ['zip','زپ'],['aasan','آسن']
  ] },
  'Waistcoat': { fields: [
    ['chati','چھاتی'],['lambai','لمبائی'],
    ['kamar','کمر'],['tera','تیرہ'],
    ['collarM','کالر']
  ] }
};

const waistcoatGheraOptions = ['گھیرہ گول', 'گھیرہ چوکور', 'گھیرہ کٹ', 'گول گلا', 'بین', 'V کالر', 'کوٹ کالر', 'بٹن فینسی', 'بٹن سادہ'];
// Customers saved before the options were renamed/split still hold the old wording;
// map it to the current options so their choices stay selected instead of disappearing.
const waistcoatOptionRenames = {
  'گول گلا گھیرہ گول': ['گھیرہ گول', 'گول گلا'],
  'گول گلا گھیرہ چوکور': ['گھیرہ چوکور', 'گول گلا'],
  'گول گلا گھیرہ کٹ': ['گھیرہ کٹ', 'گول گلا'],
  'بین V کالر': ['بین', 'V کالر']
};
function normWaistcoat(arr){
  const out = [];
  (arr || []).forEach(function(o){
    (waistcoatOptionRenames[o] || [o]).forEach(function(n){
      if(waistcoatGheraOptions.indexOf(n) !== -1 && out.indexOf(n) === -1) out.push(n);
    });
  });
  return out;
}
let selectedWaistcoatOptions = [];

function slug(s){ return s.replace(/[^a-zA-Z0-9]/g, ''); }

// A customer saved with only a name has no phone number, so it gets a hidden "NA-..." id
// (stored where the phone normally goes). These helpers keep that id off the screen.
function showPhone(p){ return (p && p.indexOf('NA-') !== 0) ? p : ''; }
function showName(o){ return o.name || showPhone(o.phone) || 'Naam nahi'; }
function phoneLine(o){ return o.name ? showPhone(o.phone) : ''; }
function padOrderNo(n){ n = parseInt(n,10); return (n < 10 ? '0' : '') + n; }
function getDayName(offset){
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString('en-US', { weekday: 'long' });
}
function dateStrForOffset(offset){
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function showScreen(name){
  document.querySelectorAll('.screen').forEach(function(s){ s.classList.add('hidden'); });
  document.getElementById('screen-' + name).classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach(function(b){
    b.classList.toggle('active', b.getAttribute('data-screen') === name);
  });
}

function goToStep(n){
  [1,2,3].forEach(function(i){
    document.getElementById('step' + i).classList.toggle('hidden', i !== n);
    document.getElementById('dot' + i).classList.toggle('active', i <= n);
  });
}

function openNewOrder(){
  resetOrderForm();
  showScreen('neworder');
}

let firstStatsPainted = false;
function renderHomeScreen(){
  if(!firstStatsPainted){ firstStatsPainted = true; performance.mark('stats-first-paint'); }
  document.getElementById('customerCount').textContent = customers.length;

  const todayStr = dateStrForOffset(0);
  const tomorrowStr = dateStrForOffset(1);
  // An order whose return date has already passed without being delivered drops out of
  // "Pending" once that day ends, instead of piling up and inflating later days' totals.
  const pendingOrders = orders.filter(function(o){ return o.status !== 'delivered' && o.returnDate >= todayStr; });
  const todayOrders = pendingOrders.filter(function(o){ return o.returnDate === todayStr; });
  const tomorrowOrders = pendingOrders.filter(function(o){ return o.returnDate === tomorrowStr; });

  document.getElementById('pendingCount').textContent = pendingOrders.length;
  document.getElementById('todayCount').textContent = todayOrders.length;

  const todayList = document.getElementById('todayList');
  todayList.innerHTML = todayOrders.length ? todayOrders.map(function(o){
    return '<li class="order-row" data-order="' + o.orderNo + '">' +
      '<div><p class="row-name">' + showName(o) + '</p><p class="row-sub">' + o.qty + ' suit • Rs ' + o.price + '</p></div>' +
      '<button class="done-btn" onclick="markDelivered(' + o.orderNo + ', this)">De Diya</button>' +
    '</li>';
  }).join('') : '<p style="color:var(--text-muted); font-size:12px;">Aaj koi order wapis nahi.</p>';

  const tomorrowList = document.getElementById('tomorrowList');
  tomorrowList.innerHTML = tomorrowOrders.length ? tomorrowOrders.map(function(o){
    return '<li class="order-row"><div><p class="row-name">' + showName(o) + '</p><p class="row-sub">' + o.qty + ' suit • Rs ' + o.price + '</p></div></li>';
  }).join('') : '<p style="color:var(--text-muted); font-size:12px;">Kal koi order wapis nahi.</p>';
}

function markDelivered(orderNo, btnEl){
  const row = btnEl ? btnEl.closest('.order-row') : document.querySelector('.order-row[data-order="' + orderNo + '"]');
  if(row){
    row.style.opacity = '0';
    row.style.transform = 'translateX(12px)';
  }
  if(btnEl) btnEl.disabled = true;
  updateDoc(doc(db, 'orders', String(orderNo)), { status: 'delivered', deliveredAt: serverTimestamp() })
    .catch(function(e){
      console.error(e);
      if(row){ row.style.opacity = ''; row.style.transform = ''; }
      if(btnEl) btnEl.disabled = false;
    });
}

function setupHomeDays(){
  document.getElementById('todayHeading').textContent = 'Aaj Wapis Milna Hai (' + getDayName(0) + ')';
  document.getElementById('tomorrowHeading').textContent = 'Kal Wapis Milna Hai (' + getDayName(1) + ')';
  const box = document.getElementById('futureDaysList');
  box.innerHTML = [2,3,4].map(function(offset){
    return '<div class="suggestion-row" onclick="showFutureDay(' + offset + ')"><span>' + getDayName(offset) + '</span></div>';
  }).join('');
}

function toggleFutureDropdown(){
  document.getElementById('futureDaysList').classList.toggle('hidden');
}

function showFutureDay(offset){
  const dayName = getDayName(offset);
  document.getElementById('futureDayTitle').textContent = dayName + ' Wapis Milna Hai';
  const dateStr = dateStrForOffset(offset);
  const items = orders.filter(function(o){ return o.status !== 'delivered' && o.returnDate === dateStr; });
  const listEl = document.getElementById('futureDayList');
  listEl.innerHTML = items.length ? items.map(function(o){
    return '<div class="order-row"><div><p class="row-name">' + showName(o) + '</p><p class="row-sub">' + o.qty + ' suit • Rs ' + o.price + '</p></div></div>';
  }).join('') : '<p style="color:var(--text-muted); font-size:12px;">Is din koi customer nahi.</p>';
  document.getElementById('futureDaySection').style.display = '';
  document.getElementById('futureDaysList').classList.add('hidden');
}

function chooseCustomerType(type, el){
  document.querySelectorAll('#customerTypeGroup .chip').forEach(function(c){ c.classList.remove('selected'); });
  el.classList.add('selected');
  customerType = type;
  document.getElementById('newCustomerFields').style.display = (type === 'new') ? '' : 'none';
  document.getElementById('existingCustomerFields').style.display = (type === 'existing') ? '' : 'none';
  document.getElementById('custName').value = '';
  document.getElementById('custPhone').value = '';
  document.getElementById('selectedCustomerConfirm').style.display = 'none';
  document.getElementById('customerSearch').value = '';
}

function toggleProduct(name, el){
  const idx = selectedProducts.indexOf(name);
  if(idx >= 0){ selectedProducts.splice(idx,1); el.classList.remove('selected'); }
  else { selectedProducts.push(name); el.classList.add('selected'); }
}

function toggleDesignOption(name, el){
  const idx = selectedDesignOptions.indexOf(name);
  if(idx >= 0){ selectedDesignOptions.splice(idx,1); el.classList.remove('selected'); }
  else { selectedDesignOptions.push(name); el.classList.add('selected'); }
}

function toggleWaistcoatOption(name, el){
  const idx = selectedWaistcoatOptions.indexOf(name);
  if(idx >= 0){ selectedWaistcoatOptions.splice(idx,1); el.classList.remove('selected'); }
  else { selectedWaistcoatOptions.push(name); el.classList.add('selected'); }
}

function renderDesignOptionsChips(){
  const box = document.getElementById('designGroup');
  box.innerHTML = designOptionsList.map(function(opt){
    return '<button type="button" class="chip" data-value="' + opt + '" onclick="toggleDesignOption(\'' + opt + '\', this)">' + opt + '</button>';
  }).join('');
  const cat = document.getElementById('catalogList');
  cat.innerHTML = designOptionsList.map(function(opt){
    return '<div class="catalog-item-row">' + opt + '</div>';
  }).join('');
}

function fieldLabel(product, key){
  const cfg = productConfig[product];
  if(!cfg) return key;
  const match = cfg.fields.find(function(f){ return f[0] === key; });
  return match ? match[1] : key;
}

let measurementStepBuiltFor = null;

function proceedToStep2(){
  const err = document.getElementById('step1Error');
  if(!selectedProducts.length){
    err.textContent = 'Kam az kam ek product chunen.';
    return;
  }
  err.textContent = '';
  // Only rebuild the measurement fields when the product selection changes, or when the
  // customer identity changes (a different saved customer, or switching to/from one with
  // no saved record) — that's when the prefilled data actually needs to change. Simply
  // going back to tweak the name/phone text (without it matching a different saved
  // customer) keeps the same key, so measurements already typed in are never wiped.
  const phone = document.getElementById('custPhone').value.trim();
  const existing = customers.find(function(c){ return c.phone === phone; });
  const productsKey = selectedProducts.slice().sort().join(',') + '|' + (existing ? existing.phone : '');
  if(measurementStepBuiltFor !== productsKey){
    buildMeasurementStep();
    measurementStepBuiltFor = productsKey;
  }
  goToStep(2);
}

function buildMeasurementStep(){
  const container = document.getElementById('measurementFieldsContainer');
  let html = '';
  selectedProducts.forEach(function(p, idx){
    const cfg = productConfig[p];
    const headingClass = idx === 0 ? 'section-title first' : 'section-title';
    html += '<h2 class="' + headingClass + '">' + p + '</h2>';
    html += '<div class="measure-grid">' + cfg.fields.map(function(f){
      return '<div><label dir="rtl">' + f[1] + '</label><input type="number" id="measure_' + slug(p) + '_' + f[0] + '"></div>';
    }).join('') + '</div>';
    if(p === 'Waistcoat'){
      html += '<div class="chip-group" id="waistcoatOptionsGroup" style="margin-top:12px;">' + waistcoatGheraOptions.map(function(opt){
        return '<button type="button" class="chip" dir="rtl" data-value="' + opt + '" onclick="toggleWaistcoatOption(\'' + opt + '\', this)">' + opt + '</button>';
      }).join('') + '</div>';
      html += '<label>Waistcoat Ke Liye Koi Aur Baat</label><textarea id="waistcoatNote" placeholder="Waistcoat ke hisab se koi baat likhen"></textarea>';
    }
  });
  container.innerHTML = html;

  document.querySelectorAll('#designGroup .chip').forEach(function(c){ c.classList.remove('selected'); });
  selectedDesignOptions = [];
  selectedWaistcoatOptions = [];

  const phone = document.getElementById('custPhone').value.trim();
  const existing = customers.find(function(c){ return c.phone === phone; });
  if(existing){
    selectedProducts.forEach(function(p){
      if(existing.measurements && existing.measurements[p]){
        const vals = existing.measurements[p];
        productConfig[p].fields.forEach(function(f){
          const el = document.getElementById('measure_' + slug(p) + '_' + f[0]);
          if(el) el.value = vals[f[0]] || '';
        });
      }
    });
    if(existing.designOptions){
      selectedDesignOptions = existing.designOptions.filter(function(o){ return designOptionsList.indexOf(o) !== -1; });
      document.querySelectorAll('#designGroup .chip').forEach(function(chip){
        chip.classList.toggle('selected', selectedDesignOptions.indexOf(chip.getAttribute('data-value')) !== -1);
      });
    }
    const wGroup = document.getElementById('waistcoatOptionsGroup');
    if(wGroup && existing.waistcoatOptions){
      selectedWaistcoatOptions = normWaistcoat(existing.waistcoatOptions);
      wGroup.querySelectorAll('.chip').forEach(function(chip){
        chip.classList.toggle('selected', selectedWaistcoatOptions.indexOf(chip.getAttribute('data-value')) !== -1);
      });
    }
    const wNoteEl = document.getElementById('waistcoatNote');
    if(wNoteEl) wNoteEl.value = existing.waistcoatNote || '';
    document.getElementById('designNote').value = existing.note || '';
  } else {
    document.getElementById('designNote').value = '';
  }
}

function compressImage(dataUrl, maxDim, quality){
  return new Promise(function(resolve, reject){
    const img = new Image();
    img.onload = function(){
      let width = img.width, height = img.height;
      if(width > maxDim || height > maxDim){
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// Firestore documents are capped at ~1MiB, so photos are downsized to a data URL
// small enough to sit safely inside the order document (no separate file storage needed).
async function handlePhotoUpload(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = async function(ev){
    let compressed = await compressImage(ev.target.result, 1000, 0.7);
    if(compressed.length * 0.75 > 600000){
      compressed = await compressImage(ev.target.result, 700, 0.5);
    }
    attachedPhoto = compressed;
    document.getElementById('photoPreviewImg').src = attachedPhoto;
    document.getElementById('photoPreviewWrap').style.display = '';
  };
  reader.readAsDataURL(file);
}

function removePhoto(){
  attachedPhoto = null;
  document.getElementById('designPhotoInput').value = '';
  document.getElementById('photoPreviewWrap').style.display = 'none';
}

// Live data (from the server) always wins over the quick cache-only first paint below.
let liveCustomersLoaded = false;
let liveOrdersLoaded = false;

// Show whatever is already saved on this device straight away, without waiting for the login
// check and the network — so the numbers appear right after the app opens, even on a slow phone.
// The live listeners start after sign-in and replace this with fresh data.
async function showCachedData(){
  try{
    const results = await Promise.all([
      getDocsFromCache(collection(db, 'customers')),
      getDocsFromCache(collection(db, 'orders'))
    ]);
    if(liveCustomersLoaded && liveOrdersLoaded) return;
    if(!results[0].size && !results[1].size) return;
    if(!liveCustomersLoaded) customers = results[0].docs.map(function(d){ return d.data(); });
    if(!liveOrdersLoaded) orders = results[1].docs.map(function(d){ return d.data(); });
    renderHomeScreen();
    renderCustomerList(document.getElementById('custSearch') ? document.getElementById('custSearch').value : '');
  }catch(e){
    // Nothing saved on this device yet (first ever open) — live data will fill everything in.
  }
}

function watchCustomers(){
  onSnapshot(collection(db, 'customers'), function(snap){
    liveCustomersLoaded = true;
    customers = snap.docs.map(function(d){ return d.data(); });
    renderCustomerList(document.getElementById('custSearch') ? document.getElementById('custSearch').value : '');
    renderHomeScreen();
  }, function(e){ console.error('customers listener error', e); });
}

function watchOrders(){
  onSnapshot(collection(db, 'orders'), function(snap){
    liveOrdersLoaded = true;
    orders = snap.docs.map(function(d){ return d.data(); });
    renderHomeScreen();
    renderCustomerList(document.getElementById('custSearch') ? document.getElementById('custSearch').value : '');
  }, function(e){ console.error('orders listener error', e); });
}


function searchCustomers(){
  const q = document.getElementById('customerSearch').value.trim().toLowerCase();
  const box = document.getElementById('searchSuggestions');
  if(!q){ box.classList.add('hidden'); box.innerHTML=''; searchMatches=[]; return; }
  searchMatches = customers.filter(function(c){
    return (c.name || '').toLowerCase().includes(q) || showPhone(c.phone).includes(q);
  }).slice(0,5);
  box.classList.remove('hidden');
  if(!searchMatches.length){
    box.innerHTML = '<div class="suggestion-row" style="cursor:default;">Koi customer nahi mila</div>';
    return;
  }
  box.innerHTML = searchMatches.map(function(c, i){
    return '<div class="suggestion-row" onclick="fillCustomerForm(' + i + ')"><span>' + showName(c) + '</span><span class="suggestion-sub">' + phoneLine(c) + '</span></div>';
  }).join('');
}

function fillCustomerForm(i){
  const c = searchMatches[i];
  if(!c) return;
  document.getElementById('custName').value = c.name;
  document.getElementById('custPhone').value = c.phone;
  document.getElementById('customerSearch').value = '';
  document.getElementById('searchSuggestions').classList.add('hidden');
  document.getElementById('selectedCustomerLabel').textContent = showName(c) + (phoneLine(c) ? ' (' + phoneLine(c) + ')' : '');
  document.getElementById('selectedCustomerConfirm').style.display = '';
}

function changeSelectedCustomer(){
  document.getElementById('custName').value = '';
  document.getElementById('custPhone').value = '';
  document.getElementById('selectedCustomerConfirm').style.display = 'none';
}

function resetOrderForm(){
  customerType = '';
  document.querySelectorAll('#customerTypeGroup .chip').forEach(function(c){ c.classList.remove('selected'); });
  document.getElementById('newCustomerFields').style.display = 'none';
  document.getElementById('existingCustomerFields').style.display = 'none';
  document.getElementById('custName').value = '';
  document.getElementById('custPhone').value = '';
  document.getElementById('customerSearch').value = '';
  document.getElementById('searchSuggestions').classList.add('hidden');
  document.getElementById('selectedCustomerConfirm').style.display = 'none';
  selectedProducts = [];
  document.querySelectorAll('#productGroup .chip').forEach(function(c){ c.classList.remove('selected'); });
  document.getElementById('measurementFieldsContainer').innerHTML = '';
  measurementStepBuiltFor = null;
  selectedDesignOptions = [];
  selectedWaistcoatOptions = [];
  document.querySelectorAll('#designGroup .chip').forEach(function(c){ c.classList.remove('selected'); });
  document.getElementById('designNote').value = '';
  document.getElementById('qty').value = '1';
  document.getElementById('price').value = '';
  document.getElementById('returnDate').value = '';
  removePhoto();
  document.getElementById('step1Error').textContent = '';
  document.getElementById('formError').textContent = '';
  draftOrder = null;
  draftMeasurements = null;
  goToStep(1);
}

function createCard(){
  const errorEl = document.getElementById('formError');
  const name = document.getElementById('custName').value.trim();
  let phone = document.getElementById('custPhone').value.trim();
  const price = document.getElementById('price').value;
  const returnDate = document.getElementById('returnDate').value;

  if(!name && !phone){
    errorEl.textContent = 'Customer ka naam ya number likhen.';
    return;
  }
  if(!phone){
    phone = 'NA-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  if(!price || !returnDate){
    errorEl.textContent = 'Price aur wapsi ki tareekh zaroor bharen.';
    return;
  }
  errorEl.textContent = '';

  const maxKnown = orders.reduce(function(m,o){ return Math.max(m, o.orderNo || 0); }, 0);
  const prospectiveOrderNo = maxKnown + 1;
  const qty = document.getElementById('qty').value || '1';
  const note = document.getElementById('designNote').value.trim();
  const wNoteEl = document.getElementById('waistcoatNote');
  const waistcoatNote = (selectedProducts.indexOf('Waistcoat') !== -1 && wNoteEl) ? wNoteEl.value.trim() : '';

  const measurementsByProduct = {};
  selectedProducts.forEach(function(p){
    const obj = {};
    productConfig[p].fields.forEach(function(f){
      obj[f[0]] = document.getElementById('measure_' + slug(p) + '_' + f[0]).value;
    });
    measurementsByProduct[p] = obj;
  });

  renderTicket({
    orderNo: prospectiveOrderNo, name: name, phone: phone, products: selectedProducts,
    qty: qty, price: price, designOptions: selectedDesignOptions, waistcoatOptions: selectedWaistcoatOptions,
    note: note, returnDate: returnDate, photo: attachedPhoto
  });

  draftOrder = {
    orderNo: prospectiveOrderNo, name: name, phone: phone, products: selectedProducts.slice(),
    designOptions: selectedDesignOptions.slice(), waistcoatOptions: selectedWaistcoatOptions.slice(),
    note: note, waistcoatNote: waistcoatNote, qty: qty, price: price, returnDate: returnDate, status: 'pending'
  };
  draftMeasurements = measurementsByProduct;
  lastCreatedOrder = draftOrder;
  lastCreatedMeasurements = draftMeasurements;

  document.getElementById('cardError').textContent = '';
  const btn = document.getElementById('saveCardBtn');
  btn.textContent = 'Save';
  btn.disabled = false;

  document.getElementById('cardActionsNew').style.display = '';
  document.getElementById('cardActionsView').style.display = 'none';
  showScreen('card');
}

function renderTicket(o){
  const dateObj = new Date(o.returnDate + 'T00:00:00');
  const dateLabel = isNaN(dateObj) ? o.returnDate : dateObj.toLocaleDateString('en-GB', { day:'numeric', month:'short' });
  const allChosenOptions = (o.designOptions || []).concat(normWaistcoat(o.waistcoatOptions));
  const designSummary = allChosenOptions.length ? allChosenOptions.join(', ') : 'Simple';

  document.getElementById('ticketOrderNo').textContent = 'Order #' + padOrderNo(o.orderNo);
  document.getElementById('ticketName').textContent = showName(o);
  document.getElementById('ticketPhone').textContent = phoneLine(o);
  document.getElementById('ticketProduct').textContent = o.products.join(', ');
  document.getElementById('ticketQty').textContent = o.qty;
  document.getElementById('ticketPrice').textContent = 'Rs ' + o.price;
  document.getElementById('ticketDesign').textContent = designSummary;
  document.getElementById('ticketDate').textContent = dateLabel;

  const photoEl = document.getElementById('ticketPhoto');
  if(o.photo){ photoEl.src = o.photo; photoEl.style.display = ''; }
  else{ photoEl.style.display = 'none'; }
}

async function saveCurrentCard(){
  if(!draftOrder) return;
  const btn = document.getElementById('saveCardBtn');
  const errorEl = document.getElementById('cardError');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  errorEl.textContent = '';

  try{
    await authReady;

    const phone = draftOrder.phone;
    const existing = customers.find(function(c){ return c.phone === phone; });
    const mergedMeasurements = existing && existing.measurements ? Object.assign({}, existing.measurements) : {};
    Object.keys(draftMeasurements).forEach(function(p){ mergedMeasurements[p] = draftMeasurements[p]; });
    const mergedOrderNumbers = existing && existing.orderNumbers ? existing.orderNumbers.slice() : [];

    // Order number comes from the already-synced local `orders` list (no extra read needed),
    // and all writes go in a single batch — one network round-trip instead of a read+commit
    // transaction, so Save feels fast even on a weaker connection.
    const orderNo = orders.reduce(function(m,o){ return Math.max(m, o.orderNo || 0); }, 0) + 1;
    const finalOrder = Object.assign({}, draftOrder, { orderNo: orderNo, photo: attachedPhoto || null, createdAt: serverTimestamp() });

    const batch = writeBatch(db);
    batch.set(doc(db, 'meta', 'counter'), { value: orderNo }, { merge: true });
    batch.set(doc(db, 'customers', phone), {
      name: finalOrder.name, phone: phone, note: finalOrder.note,
      lastOrderNo: orderNo, lastDate: finalOrder.returnDate, lastProduct: finalOrder.products.join(', '),
      orderNumbers: mergedOrderNumbers.concat([orderNo]), designOptions: finalOrder.designOptions, waistcoatOptions: finalOrder.waistcoatOptions,
      measurements: mergedMeasurements, updatedAt: serverTimestamp()
    }, { merge: true });
    if(finalOrder.products.indexOf('Waistcoat') !== -1){
      batch.set(doc(db, 'customers', phone), { waistcoatNote: finalOrder.waistcoatNote || '' }, { merge: true });
    }
    batch.set(doc(db, 'orders', String(orderNo)), finalOrder);

    // Firestore's offline cache applies the write locally right away and syncs to the
    // server in the background, so the UI doesn't wait on the network round-trip — Save
    // feels instant even on a slow mobile connection. A genuine failure (not just a slow
    // or dropped connection, which Firestore queues and retries on its own) is reported
    // afterwards without blocking.
    const commitPromise = batch.commit();

    lastCreatedOrder = finalOrder;
    lastCreatedMeasurements = draftMeasurements;
    renderTicket(finalOrder);

    btn.textContent = 'Saved';
    draftOrder = null;
    draftMeasurements = null;

    commitPromise.catch(function(e){
      console.error(e);
      errorEl.textContent = 'Save mein masla hua — internet check karen, order dobara banayen.';
    });
  }catch(e){
    console.error(e);
    errorEl.textContent = 'Save nahi ho saka. Internet check karen aur dobara koshish karen.';
    btn.disabled = false;
    btn.textContent = 'Save';
  }
}

function viewOrderCard(orderNo){
  const o = orders.find(function(x){ return x.orderNo === orderNo; });
  if(!o) return;
  renderTicket(o);
  document.getElementById('cardError').textContent = '';
  document.getElementById('cardActionsNew').style.display = 'none';
  document.getElementById('cardActionsView').style.display = '';
  showScreen('card');
}

function formatMeasurements(measurements){
  return Object.keys(measurements || {}).map(function(product){
    const vals = measurements[product];
    const parts = Object.keys(vals).filter(function(k){ return vals[k]; }).map(function(k){
      return fieldLabel(product, k) + ' ' + vals[k] + '&quot;';
    });
    return '<div style="margin-top:6px;"><span style="color:var(--text); font-weight:500;">' + product + ':</span> ' + (parts.length ? parts.join(', ') : 'naap darj nahi') + '</div>';
  }).join('');
}

function renderCustomerDetail(c){
  const allDesign = (c.designOptions || []).concat(normWaistcoat(c.waistcoatOptions));
  const design = allDesign.length ? allDesign.join(', ') : 'Design abhi tak nahi';
  const custOrders = orders.filter(function(o){ return o.phone === c.phone; }).sort(function(a,b){ return b.orderNo - a.orderNo; });
  const ordersHtml = custOrders.length
    ? custOrders.map(function(o){
        const dateObj = new Date(o.returnDate + 'T00:00:00');
        const dateLabel = isNaN(dateObj) ? o.returnDate : dateObj.toLocaleDateString('en-GB', { day:'numeric', month:'short' });
        const photoBtn = o.photo
          ? '<br><button type="button" class="link-btn" style="padding:2px 0 0;" onclick="event.stopPropagation(); toggleOrderPhoto(' + o.orderNo + ', this)">Design Dekhen</button>'
          : '';
        return '<div>' +
          '<div class="suggestion-row" style="align-items:flex-start;">' +
            '<span style="flex:1;"><span onclick="viewOrderCard(' + o.orderNo + ')" style="cursor:pointer;">Order #' + padOrderNo(o.orderNo) + ' — ' + o.products.join(', ') +
              '<br><span style="color:var(--text-muted); font-size:11px;">Wapis: ' + dateLabel + '</span></span>' + photoBtn + '</span>' +
            '<span class="suggestion-sub">Rs ' + o.price + '</span>' +
            '<button type="button" class="link-btn" style="padding:0; margin-left:8px;" onclick="event.stopPropagation(); deleteOrder(' + o.orderNo + ')">Delete</button>' +
          '</div>' +
          '<div id="orderPhoto_' + o.orderNo + '" style="display:none; margin-top:6px;"></div>' +
        '</div>';
      }).join('')
    : '<div style="margin-top:4px;">Koi purana order nahi mila.</div>';
  return formatMeasurements(c.measurements) +
    '<div style="margin-top:6px;">Pichla Design: ' + design + '</div>' +
    '<div style="margin-top:6px;">Koi Aur Baat: ' + (c.note ? c.note : 'Kuch nahi likha') + '</div>' +
    (c.waistcoatNote ? '<div style="margin-top:6px;">Waistcoat Ki Baat: ' + c.waistcoatNote + '</div>' : '') +
    '<div style="margin-top:10px; color:var(--text); font-weight:500;">Purane Cards</div>' +
    '<div style="margin-top:4px; display:flex; flex-direction:column; gap:6px;">' + ordersHtml + '</div>' +
    '<div style="margin-top:14px; display:flex; gap:14px;">' +
      '<button type="button" class="link-btn" style="padding:0;" onclick="event.stopPropagation(); openEditMeasurements(\'' + c.phone + '\')">Naap Edit Karen</button>' +
      '<button type="button" class="link-btn" style="padding:0;" onclick="event.stopPropagation(); deleteCustomer(\'' + c.phone + '\')">Customer Delete Karen</button>' +
    '</div>';
}

function renderCustomerList(filterText){
  const q = (filterText || '').toLowerCase();
  const list = document.getElementById('customerList');
  const filtered = customers.filter(function(c){
    return !q || (c.name || '').toLowerCase().includes(q) || showPhone(c.phone).includes(q);
  });
  if(!filtered.length){
    list.innerHTML = '<p style="color:var(--text-muted); font-size:13px;">Koi customer nahi mila.</p>';
    return;
  }
  list.innerHTML = filtered.map(function(c){
    const initials = showName(c).split(' ').map(function(w){ return w[0]; }).join('').slice(0,2).toUpperCase();
    return '<li class="customer-item">' +
      '<div class="customer-row" onclick="toggleCustomer(this)">' +
        '<div class="cust-avatar">' + initials + '</div>' +
        '<div><p class="row-name">' + showName(c) + '</p><p class="row-sub">' + [phoneLine(c), c.lastProduct, c.lastOrderNo ? '#' + padOrderNo(c.lastOrderNo) : ''].filter(Boolean).join(' • ') + '</p></div>' +
      '</div>' +
      '<div class="cust-detail hidden">' + renderCustomerDetail(c) + '</div>' +
    '</li>';
  }).join('');
}

function filterCustomers(){
  renderCustomerList(document.getElementById('custSearch').value);
}

function toggleCustomer(rowEl){
  const detail = rowEl.nextElementSibling;
  detail.classList.toggle('hidden');
}

async function deleteOrder(orderNo){
  if(!confirm('Yeh order delete karna hai?')) return;
  const ord = orders.find(function(o){ return o.orderNo === orderNo; });
  if(!ord) return;
  try{
    await deleteDoc(doc(db, 'orders', String(orderNo)));
    const cust = customers.find(function(c){ return c.phone === ord.phone; });
    if(cust && cust.orderNumbers){
      const updatedNumbers = cust.orderNumbers.filter(function(n){ return n !== orderNo; });
      await updateDoc(doc(db, 'customers', cust.phone), { orderNumbers: updatedNumbers });
    }
  }catch(e){
    console.error(e);
    alert('Delete nahi ho saka. Dobara koshish karen.');
  }
}

async function deleteCustomer(phone){
  if(!confirm('Yeh customer aur unke saare orders delete karne hain? Yeh wapis nahi ho sakta.')) return;
  try{
    const custOrders = orders.filter(function(o){ return o.phone === phone; });
    const batch = writeBatch(db);
    custOrders.forEach(function(o){ batch.delete(doc(db, 'orders', String(o.orderNo))); });
    batch.delete(doc(db, 'customers', phone));
    await batch.commit();
  }catch(e){
    console.error(e);
    alert('Customer delete nahi ho saka. Dobara koshish karen.');
  }
}

// The photo is only put into the page when "Design Dekhen" is tapped, so customer
// details stay short and the list stays light even if many orders have photos.
function toggleOrderPhoto(orderNo, btn){
  const box = document.getElementById('orderPhoto_' + orderNo);
  if(!box) return;
  if(box.style.display !== 'none'){
    box.style.display = 'none';
    box.innerHTML = '';
    btn.textContent = 'Design Dekhen';
    return;
  }
  const o = orders.find(function(x){ return x.orderNo === orderNo; });
  if(!o || !o.photo) return;
  box.innerHTML = '<img src="' + o.photo + '" style="max-width:100%; border-radius:8px; display:block;">' +
    '<button type="button" class="link-btn" onclick="event.stopPropagation(); deleteOrderPhoto(' + orderNo + ')">Tasveer Delete Karen</button>';
  box.style.display = '';
  btn.textContent = 'Design Chhupayen';
}

function deleteOrderPhoto(orderNo){
  if(!confirm('Yeh tasveer delete karni hai? (Order aur naap mehfooz rahenge)')) return;
  updateDoc(doc(db, 'orders', String(orderNo)), { photo: null }).catch(function(e){
    console.error(e);
    alert('Tasveer delete nahi ho saki. Dobara koshish karen.');
  });
}

let editingCustomerPhone = null;
let editSelectedDesignOptions = [];
let editSelectedWaistcoatOptions = [];

function toggleEditDesignOption(name, el){
  const idx = editSelectedDesignOptions.indexOf(name);
  if(idx >= 0){ editSelectedDesignOptions.splice(idx,1); el.classList.remove('selected'); }
  else { editSelectedDesignOptions.push(name); el.classList.add('selected'); }
}

function toggleEditWaistcoatOption(name, el){
  const idx = editSelectedWaistcoatOptions.indexOf(name);
  if(idx >= 0){ editSelectedWaistcoatOptions.splice(idx,1); el.classList.remove('selected'); }
  else { editSelectedWaistcoatOptions.push(name); el.classList.add('selected'); }
}

function openEditMeasurements(phone){
  const c = customers.find(function(x){ return x.phone === phone; });
  if(!c) return;
  editingCustomerPhone = phone;

  document.getElementById('editMeasureCustName').textContent = 'Naap Edit Karen — ' + showName(c);

  const container = document.getElementById('editMeasurementFieldsContainer');
  const products = Object.keys(c.measurements || {});
  let html = '';
  products.forEach(function(p, idx){
    const cfg = productConfig[p];
    if(!cfg) return;
    const headingClass = idx === 0 ? 'section-title first' : 'section-title';
    html += '<h2 class="' + headingClass + '">' + p + '</h2>';
    html += '<div class="measure-grid">' + cfg.fields.map(function(f){
      const vals = c.measurements[p] || {};
      const val = vals[f[0]] || '';
      return '<div><label dir="rtl">' + f[1] + '</label><input type="number" id="editMeasure_' + slug(p) + '_' + f[0] + '" value="' + val + '"></div>';
    }).join('') + '</div>';
  });
  container.innerHTML = html || '<p class="hint-text">Is customer ke liye koi naap darj nahi hain.</p>';

  editSelectedDesignOptions = (c.designOptions || []).filter(function(o){ return designOptionsList.indexOf(o) !== -1; });
  const designGroup = document.getElementById('editDesignGroup');
  designGroup.innerHTML = designOptionsList.map(function(opt){
    return '<button type="button" class="chip" data-value="' + opt + '" onclick="toggleEditDesignOption(\'' + opt + '\', this)">' + opt + '</button>';
  }).join('');
  designGroup.querySelectorAll('.chip').forEach(function(chip){
    chip.classList.toggle('selected', editSelectedDesignOptions.indexOf(chip.getAttribute('data-value')) !== -1);
  });

  editSelectedWaistcoatOptions = normWaistcoat(c.waistcoatOptions);
  const wGroup = document.getElementById('editWaistcoatOptionsGroup');
  if(products.indexOf('Waistcoat') !== -1){
    wGroup.innerHTML = waistcoatGheraOptions.map(function(opt){
      return '<button type="button" class="chip" dir="rtl" data-value="' + opt + '" onclick="toggleEditWaistcoatOption(\'' + opt + '\', this)">' + opt + '</button>';
    }).join('');
    wGroup.querySelectorAll('.chip').forEach(function(chip){
      chip.classList.toggle('selected', editSelectedWaistcoatOptions.indexOf(chip.getAttribute('data-value')) !== -1);
    });
  } else {
    wGroup.innerHTML = '';
  }
  const hasWaistcoat = products.indexOf('Waistcoat') !== -1;
  document.getElementById('editWaistcoatNoteWrap').style.display = hasWaistcoat ? '' : 'none';
  document.getElementById('editWaistcoatNote').value = hasWaistcoat ? (c.waistcoatNote || '') : '';

  document.getElementById('editNote').value = c.note || '';
  document.getElementById('editMeasureError').textContent = '';
  const btn = document.getElementById('saveMeasureBtn');
  btn.disabled = false;
  btn.textContent = 'Naap Save Karen';

  showScreen('editmeasurements');
}

async function saveEditedMeasurements(){
  if(!editingCustomerPhone) return;
  const c = customers.find(function(x){ return x.phone === editingCustomerPhone; });
  if(!c) return;

  const btn = document.getElementById('saveMeasureBtn');
  const errorEl = document.getElementById('editMeasureError');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  errorEl.textContent = '';

  const products = Object.keys(c.measurements || {});
  const updatedMeasurements = Object.assign({}, c.measurements);
  products.forEach(function(p){
    const cfg = productConfig[p];
    if(!cfg) return;
    const obj = {};
    cfg.fields.forEach(function(f){
      const el = document.getElementById('editMeasure_' + slug(p) + '_' + f[0]);
      obj[f[0]] = el ? el.value : '';
    });
    updatedMeasurements[p] = obj;
  });
  const note = document.getElementById('editNote').value.trim();
  const editedFields = {
    measurements: updatedMeasurements, note: note,
    designOptions: editSelectedDesignOptions, waistcoatOptions: editSelectedWaistcoatOptions,
    updatedAt: serverTimestamp()
  };
  if(products.indexOf('Waistcoat') !== -1){
    editedFields.waistcoatNote = document.getElementById('editWaistcoatNote').value.trim();
  }

  try{
    // Firestore applies the write to the local cache immediately and syncs in the
    // background, so we don't wait on the network round-trip (same approach as card Save).
    const savePromise = setDoc(doc(db, 'customers', editingCustomerPhone), editedFields, { merge: true });
    btn.textContent = 'Saved';
    editingCustomerPhone = null;
    showScreen('customers');
    savePromise.catch(function(e){
      console.error(e);
      alert('Naap save nahi ho saka. Internet check karen aur dobara koshish karen.');
    });
  }catch(e){
    console.error(e);
    errorEl.textContent = 'Naap save nahi ho saka. Dobara koshish karen.';
    btn.disabled = false;
    btn.textContent = 'Naap Save Karen';
  }
}

function playSplash(){
  setTimeout(function(){
    const el = document.getElementById('splashOverlay');
    el.classList.add('fade-out');
    setTimeout(function(){ el.style.display = 'none'; }, 520);
  }, 1700);
}

function printMeasurementSlip(){
  if(!lastCreatedOrder){ return; }
  const o = lastCreatedOrder;
  const m = lastCreatedMeasurements;
  let html = '';
  html += '<div class="p-shop">Life Tailors &amp; Fabrics</div>';
  html += '<div class="p-order">#' + padOrderNo(o.orderNo) + '</div>';
  html += '<div class="p-name">' + showName(o) + '</div>';
  html += '<div class="p-sub">' + (phoneLine(o) ? phoneLine(o) + ' &bull; ' : '') + o.products.join(', ') + '</div>';
  html += '<hr>';
  o.products.forEach(function(p){
    html += '<div class="p-heading">' + p + '</div>';
    const vals = m[p] || {};
    productConfig[p].fields.forEach(function(f){
      if(vals[f[0]]){
        html += '<div class="p-row" dir="rtl"><span>' + f[1] + '</span><span>' + vals[f[0]] + '</span></div>';
      }
    });
    if(p === 'Waistcoat' && o.waistcoatNote){
      html += '<div class="p-heading">Waistcoat Note</div><div class="p-row"><span>' + o.waistcoatNote + '</span></div>';
    }
  });
  const allOpts = (o.designOptions || []).concat(normWaistcoat(o.waistcoatOptions));
  if(allOpts.length){
    html += '<hr><div class="p-heading">Design</div><div class="p-row"><span>' + allOpts.join(', ') + '</span></div>';
  }
  if(o.note){
    html += '<hr><div class="p-heading">Note</div><div class="p-row"><span>' + o.note + '</span></div>';
  }
  document.getElementById('printMeasurements').innerHTML = html;
  window.print();
}

function printBillCard(){
  if(!lastCreatedOrder){ return; }
  const o = lastCreatedOrder;
  const dateObj = new Date(o.returnDate + 'T00:00:00');
  const dateLabel = isNaN(dateObj) ? o.returnDate : dateObj.toLocaleDateString('en-GB', { day:'numeric', month:'short' });
  let html = '';
  html += '<div class="p-shop">Life Tailors &amp; Fabrics</div>';
  html += '<div class="p-address">Business address withheld in public demo</div>';
  html += '<div class="p-contact">Contact details withheld</div>';
  html += '<div class="p-contact">Contact details withheld</div>';
  html += '<hr>';
  html += '<div class="p-order">#' + padOrderNo(o.orderNo) + '</div>';
  html += '<div class="p-name">' + showName(o) + '</div>';
  if(phoneLine(o)){ html += '<div class="p-sub">' + phoneLine(o) + '</div>'; }
  o.products.forEach(function(p){
    html += '<div class="p-sub">' + p + '</div>';
  });
  html += '<hr>';
  html += '<div class="p-row"><span>Quantity</span><span>' + o.qty + '</span></div>';
  html += '<div class="p-row"><span>Price</span><span>Rs ' + o.price + '</span></div>';
  html += '<div class="p-row"><span>Wapis Ki Tareekh</span><span>' + dateLabel + '</span></div>';
  html += '<div class="p-swatch-box">Fabric Ka Tukda Yahan Laga Den</div>';
  html += '<div class="p-footer-note">اپنا آرڈر تین ماہ سے پہلے لے جائیں، اس کے بعد دکاندار کی ذمہ داری نہ ہوگی، شکریہ</div>';
  document.getElementById('printMeasurements').innerHTML = html;
  window.print();
}

// Refreshes the home screen right at midnight so "Aaj/Kal Wapis" and the Pending count
// reflect the new day on their own, even if the app/tab is left open overnight.
function scheduleMidnightRefresh(){
  const now = new Date();
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
  setTimeout(function(){
    setupHomeDays();
    renderHomeScreen();
    scheduleMidnightRefresh();
  }, nextMidnight - now);
}

(async function init(){
  renderDesignOptionsChips();
  setupHomeDays();
  playSplash();
  goToStep(1);
  scheduleMidnightRefresh();
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').catch(function(){});
  }
  showCachedData();
  try{
    await authReady;
    watchCustomers();
    watchOrders();
  }catch(e){
    console.error('Firebase auth failed', e);
  }
})();

Object.assign(window, {
  showScreen, openNewOrder, goToStep, chooseCustomerType, toggleProduct, toggleDesignOption,
  toggleWaistcoatOption, searchCustomers, fillCustomerForm, changeSelectedCustomer, proceedToStep2,
  handlePhotoUpload, removePhoto, createCard, saveCurrentCard, viewOrderCard, filterCustomers,
  toggleCustomer, deleteOrder, deleteCustomer, printMeasurementSlip, printBillCard, toggleFutureDropdown, showFutureDay, markDelivered,
  openEditMeasurements, saveEditedMeasurements, toggleEditDesignOption, toggleEditWaistcoatOption,
  toggleOrderPhoto, deleteOrderPhoto
});
