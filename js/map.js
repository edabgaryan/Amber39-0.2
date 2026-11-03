document.addEventListener('DOMContentLoaded', async () => {
  if (document.body.dataset.page !== 'map') return;
  const byId = id => document.getElementById(id);
  const sidebar = byId('filters'), sheet = byId('mapSheet'), backdrop = byId('mapBackdrop');
  const error = byId('mapError');
  const fields = ['search','minPrice','maxPrice','minArea','maxArea','district','vri','tenure','sea','city','power','gas','mortgage','clear','buildable'];
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const mobile = () => matchMedia('(max-width:800px)').matches;
  const notice = message => {error.hidden = false;error.textContent = message;};
  if (!window.L || !L.markerClusterGroup) {notice('Не удалось загрузить библиотеку карты. Проверьте подключение к интернету и обновите страницу.');return;}
  let data;
  try {
    const response = await fetch('data/plots.json', {cache:'no-cache'});
    if (!response.ok) throw new Error('HTTP '+response.status);
    data = await response.json();
    if (!Array.isArray(data)) throw new Error('Invalid data');
  } catch (e) {notice('Не удалось загрузить участки. Проверьте data/plots.json и запустите сайт через локальный сервер или GitHub Pages.');return;}
  const map = L.map('mainMap', {zoomControl:false, preferCanvas:true}).setView([54.71,20.51],9);
  L.control.zoom({position:'bottomright'}).addTo(map);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(map);
  const clusters = L.markerClusterGroup({maxClusterRadius:52, chunkedLoading:true, showCoverageOnHover:false, spiderfyOnMaxZoom:true});
  const polygons = L.layerGroup().addTo(map);
  map.addLayer(clusters);
  let selected = null, mode = 'lots', visible = [];
  const district = byId('district');
  [...new Set(data.map(p => p.district).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru')).forEach(x=>district.add(new Option(x,x)));
  const checked = id => byId(id).checked;
  const num = id => {const v=byId(id).value;return v===''?null:Number(v)};
  const filters = () => {
    const q = byId('search').value.toLocaleLowerCase('ru').trim();
    return data.filter(p => {
      const c = p.communications || {};
      return (!q || [p.cadastral,p.settlement,p.title,p.district].join(' ').toLocaleLowerCase('ru').includes(q))
        && (num('minPrice')===null || p.price>=num('minPrice')) && (num('maxPrice')===null || p.price<=num('maxPrice'))
        && (num('minArea')===null || p.areaSotki>=num('minArea')) && (num('maxArea')===null || p.areaSotki<=num('maxArea'))
        && (!district.value || p.district===district.value) && (!byId('vri').value || p.vri===byId('vri').value)
        && (!byId('tenure').value || p.tenure===byId('tenure').value)
        && (num('sea')===null || p.seaKm<=num('sea')) && (num('city')===null || p.cityMin<=num('city'))
        && (!checked('power') || !!c.power) && (!checked('gas') || !!c.gas)
        && (!checked('mortgage') || !!p.mortgage) && (!checked('clear') || p.legalStatus==='clear')
        && (!checked('buildable') || (p.vri==='ИЖС' && p.surveyed && p.legalStatus==='clear'));
    });
  };
  const layerColor = p => mode==='price' ? (p.pricePerSotka>400000?'#8B3A2F':p.pricePerSotka>200000?'#A67C3D':'#3D6B4F') : mode==='communications' ? (p.communications?.gas && p.communications?.power?'#3D6B4F':'#A67C3D') : '#C4A574';
  const tenureLabel = {own:'Собственность',lease:'Аренда',lease_buyout:'Аренда с выкупом'};
  const statusLabel = {clear:'Предварительно без рисков',review:'На проверке',risk:'Требует внимания'};
  const hideSheet = () => {sheet.classList.remove('open');sheet.innerHTML='';selected=null;syncBackdrop();};
  const syncBackdrop = () => {backdrop.hidden=!(mobile() && (sheet.classList.contains('open')||sidebar.classList.contains('mobile-open')));};
  function show(p) {
    selected=p;
    const c=p.communications||{};
    sheet.innerHTML=`<button type="button" class="sheet-close" id="closeSheet" aria-label="Закрыть">✕</button>
      <div class="lot-visual"><span class="map-visual-label">AMBER 39 / LAND ESTATE</span></div>
      <div class="sheet-content"><span class="pill">${escapeHTML(statusLabel[p.legalStatus]||'Статус уточняется')}</span>
      <h3>${escapeHTML(p.settlement)}</h3><p class="muted">${escapeHTML(p.district)} · ${escapeHTML(p.areaSotki)} сот. · ${escapeHTML(p.vri)}</p>
      <div class="map-sheet-price">${money(p.price)}</div><p class="map-cadastral">${escapeHTML(p.cadastral)}</p>
      <div class="map-details"><span>Право</span><strong>${escapeHTML(tenureLabel[p.tenure]||p.tenure)}</strong><span>Электричество</span><strong>${c.power?'Заявлено':'Не заявлено'}</strong><span>Газ</span><strong>${c.gas?'Заявлен':'Не заявлен'}</strong></div>
      <a class="btn primary map-full-button" href="plot.html?id=${encodeURIComponent(p.id)}">Открыть досье ↗</a>
      <div class="map-sheet-links"><a href="legal.html#request">Проверить юристом</a><a href="cadastre.html#request">Вынести границы</a><a href="plot.html?id=${encodeURIComponent(p.id)}#calculator">Посчитать дом</a></div>
      <p class="disclaimer">${escapeHTML(demo)}</p></div>`;
    sheet.classList.add('open');byId('closeSheet').onclick=hideSheet;syncBackdrop();
  }
  function render() {
    visible=filters();clusters.clearLayers();polygons.clearLayers();
    const batch=[];
    for (const p of visible) {
      if (!Number.isFinite(+p.lat)||!Number.isFinite(+p.lng)) continue;
      const color=layerColor(p);
      const icon=L.divIcon({html:`<span class="map-pin" style="--pin-color:${color}"></span>`,className:'amber-pin-icon',iconSize:[24,24],iconAnchor:[12,12]});
      const marker=L.marker([p.lat,p.lng],{icon,title:`${p.settlement} · ${money(p.price)}`});
      marker.on('click',()=>show(p));batch.push(marker);
      if (Array.isArray(p.polygon)&&p.polygon.length>=3) {
        const polygon=L.polygon(p.polygon,{color,weight:2,fillOpacity:.12,interactive:true});
        polygon.on('click',()=>show(p));polygons.addLayer(polygon);
      }
    }
    clusters.addLayers(batch);
    byId('mapCount').firstChild?.remove();
    let counter=byId('mapCount').querySelector('.map-count-text');
    if (!counter) {counter=document.createElement('div');counter.className='map-count-text';byId('mapCount').prepend(counter)}
    counter.textContent=`Найдено ${visible.length} из ${data.length} демонстрационных участков`;
    const count=fields.filter(id=>{const e=byId(id);return e.type==='checkbox'?e.checked:e.value!==''}).length;
    byId('activeFilterCount').textContent=count?`· ${count}`:'';
    if (selected && !visible.some(p=>p.id===selected.id)) hideSheet();
  }
  let debounce;
  fields.forEach(id=>byId(id).addEventListener(id==='search'?'input':'change',()=>{clearTimeout(debounce);debounce=setTimeout(render,id==='search'?160:0)}));
  ['minPrice','maxPrice','minArea','maxArea','sea','city'].forEach(id=>byId(id).addEventListener('input',()=>{clearTimeout(debounce);debounce=setTimeout(render,250)}));
  function toggleFilters(open) {sidebar.classList.toggle('mobile-open',open);document.body.classList.toggle('map-filters-open',open);syncBackdrop();if(!open)setTimeout(()=>map.invalidateSize(),300)}
  byId('openFilters').onclick=()=>toggleFilters(true);
  byId('applyFilters').onclick=()=>toggleFilters(false);
  byId('closeFilters').onclick=()=>{if(mobile())toggleFilters(false);else sidebar.classList.toggle('collapsed')};
  backdrop.onclick=()=>{toggleFilters(false);hideSheet()};
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){toggleFilters(false);hideSheet()}});
  byId('resetFilters').onclick=()=>{fields.forEach(id=>{const e=byId(id);if(e.type==='checkbox')e.checked=false;else e.value=''});render()};
  document.querySelectorAll('[data-layer]').forEach(b=>b.onclick=()=>{
    mode=b.dataset.layer;document.querySelectorAll('[data-layer]').forEach(x=>{x.classList.toggle('primary',x===b);x.setAttribute('aria-pressed',String(x===b))});
    render();
    if(mode==='sea')map.flyTo([54.88,20.25],10,{duration:.6});
  });
  render();
  setTimeout(()=>map.invalidateSize(),200);
  window.addEventListener('resize',()=>{if(!mobile())toggleFilters(false);map.invalidateSize()});
});
