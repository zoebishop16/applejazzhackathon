// assets/js/main.js
// Continued improvements: filters, station side panel, localStorage tickets, per-dock flagging, CSV export

const appState = {
  map: null,
  markers: [],
  currentDataset: null,
  stationsById: {},
  allRows: [],
  latestByStation: {},
  parsedTimestamps: [],
  tickets: [],
};

const TICKET_KEY = 'bikeshare_tickets_v1';

function init() {
  loadTicketsFromLocalStorage();
  setupSidebar();
  setupMap();
  populateDatasetSelect();
  setupControls();
  document.getElementById('refresh-data').addEventListener('click', ()=> loadDataset(document.getElementById('dataset-select').value));
  document.getElementById('clear-tickets').addEventListener('click', ()=>{ if(confirm('Clear all local tickets?')){ appState.tickets=[]; saveTickets(); renderMaintenancePage(); } });
}

function setupControls(){
  document.getElementById('filter-district').addEventListener('change', ()=>renderMapMarkers());
  document.getElementById('filter-status').addEventListener('change', ()=>renderMapMarkers());
  document.getElementById('filter-age').addEventListener('change', ()=>renderMapMarkers());
  document.getElementById('filter-open-only').addEventListener('change', ()=>renderMapMarkers());
  document.getElementById('filter-problem-only').addEventListener('change', ()=>renderMapMarkers());
  document.getElementById('export-stockouts').addEventListener('click', exportStockoutsCSV);
}

function loadTicketsFromLocalStorage(){
  try{ const raw = localStorage.getItem(TICKET_KEY); if(raw) appState.tickets = JSON.parse(raw); else appState.tickets=[]; }catch(e){ appState.tickets=[]; }
}
function saveTickets(){ localStorage.setItem(TICKET_KEY, JSON.stringify(appState.tickets)); }
function createTicket(ticket){ ticket.id = 't_'+Date.now(); ticket.opened = new Date().toISOString(); ticket.status='open'; appState.tickets.push(ticket); saveTickets(); }

function setupSidebar(){
  document.querySelectorAll('#sidebar nav li').forEach(li=>{
    li.addEventListener('click', ()=>{
      document.querySelectorAll('#sidebar nav li').forEach(x=>x.classList.remove('active'));
      li.classList.add('active');
      const page = li.dataset.page;
      document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
      document.getElementById('page-'+page).classList.add('active');
      document.getElementById('page-title').textContent = li.textContent;
      renderPage(page);
    })
  })
  document.getElementById('toggle-sidebar').addEventListener('click', ()=>document.getElementById('sidebar').classList.toggle('collapsed'))
}

function setupMap(){
  appState.map = L.map('map', {zoomControl:true}).setView([40.7128, -74.0060], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    attribution: '© OpenStreetMap contributors'
  }).addTo(appState.map);
}

function colorForPercent(pct){
  if(pct === null || pct === undefined || isNaN(pct)) return '#444';
  if(pct === 0) return '#ff4d4f';
  if(pct > 0 && pct <= 0.29) return '#ff9900';
  if(pct >= 0.30 && pct <= 0.69) return '#5cb85c';
  if(pct >= 0.70 && pct < 1.0) return '#2f80ed';
  if(pct >= 1.0) return '#7b3ff0';
  return '#999';
}

async function populateDatasetSelect(){
  const candidates = [
    'data/normal_week/dataset_normal_3weeks.csv',
    'data/normal_week/sample_quick_normal.csv',
    'data/high_failure_week/dataset_high_fail_3weeks.csv',
    'data/high_failure_week/sample_quick_high.csv',
  ];
  const select = document.getElementById('dataset-select');
  select.innerHTML = '';
  for(const path of candidates){
    try{
      const res = await fetch(path, {cache:'no-store'});
      if(res.ok){
        const opt = document.createElement('option'); opt.value = path; opt.textContent = path; select.appendChild(opt);
      }
    }catch(e){/* ignore */}
  }
  if(select.options.length>0){
    select.selectedIndex = 0;
    loadDataset(select.value);
  } else {
    const opt = document.createElement('option'); opt.value = ''; opt.textContent = '(no dataset found)'; select.appendChild(opt);
    document.getElementById('last-updated').textContent = 'no data in repo (run scripts/generate_data.py locally)';
  }
}

async function loadDataset(path){
  if(!path) return;
  try{
    const res = await fetch(path, {cache:'no-store'});
    if(!res.ok) throw new Error('dataset not found');
    const text = await res.text();
    parseCSVAndStore(text);
    populateDistrictFilter();
    renderMapMarkers();
    document.getElementById('last-updated').textContent = new Date().toLocaleString();
  }catch(err){
    console.error(err);
    document.getElementById('last-updated').textContent = 'error loading dataset';
  }
}

function parseCSVAndStore(csvText){
  const rows = csvText.trim().split('\n');
  const header = rows.shift().split(',').map(h=>h.trim());
  const data = rows.map(r=>splitCsvRow(r));
  const parsed = data.map(r=>{
    const obj = {};
    for(let i=0;i<header.length;i++) obj[header[i]] = r[i];
    obj.station_id = parseInt(obj.station_id);
    obj.total_docks = parseInt(obj.total_docks);
    obj.broken_docks = parseInt(obj.broken_docks);
    obj.effective_capacity = parseInt(obj.effective_capacity);
    obj.bikes_available = parseInt(obj.bikes_available);
    obj.broken_bike_count = parseInt(obj.broken_bike_count);
    obj.percent_full = obj.percent_full === '' ? NaN : parseFloat(obj.percent_full);
    obj.is_online = obj.is_online === 'True' || obj.is_online === 'true' || obj.is_online === '1';
    obj.out_of_service = obj.out_of_service === 'True' || obj.out_of_service === 'true' || obj.out_of_service === '1';
    obj.timestamp = new Date(obj.timestamp);
    obj.latitude = parseFloat(obj.latitude);
    obj.longitude = parseFloat(obj.longitude);
    return obj;
  });

  appState.allRows = parsed;
  appState.latestByStation = {};
  parsed.forEach(r=>{
    const sid = r.station_id;
    if(!appState.latestByStation[sid] || appState.latestByStation[sid].timestamp < r.timestamp) appState.latestByStation[sid] = r;
  });
  appState.parsedTimestamps = Array.from(new Set(parsed.map(r=>r.timestamp.getTime()))).sort().map(t=>new Date(t));
}

function splitCsvRow(row){
  const result = [];
  let cur = '';
  let inQuotes = false;
  for(let i=0;i<row.length;i++){
    const ch = row[i];
    if(ch === '"'){
      inQuotes = !inQuotes; continue;
    }
    if(ch === ',' && !inQuotes){ result.push(cur); cur=''; } else cur+=ch;
  }
  result.push(cur);
  return result.map(s=>s.trim());
}

function populateDistrictFilter(){
  const set = new Set();
  Object.values(appState.latestByStation).forEach(s=> set.add(s.district));
  const sel = document.getElementById('filter-district'); sel.innerHTML=''; sel.appendChild(new Option('All','all'));
  Array.from(set).sort().forEach(d=> sel.appendChild(new Option(d,d)));
}

function renderMapMarkers(){
  appState.markers.forEach(m=>appState.map.removeLayer(m)); appState.markers = [];
  const districtFilter = document.getElementById('filter-district').value;
  const statusFilter = document.getElementById('filter-status').value;
  const ageLimit = parseInt(document.getElementById('filter-age').value,10);
  const openOnly = document.getElementById('filter-open-only').checked;
  const problemOnly = document.getElementById('filter-problem-only').checked;

  const now = new Date();

  Object.values(appState.latestByStation).forEach(r=>{
    if(districtFilter !== 'all' && r.district !== districtFilter) return;
    if(statusFilter === 'problem' && !(r.broken_docks>0 || !r.is_online || r.out_of_service)) return;
    if(statusFilter === 'out' && !r.out_of_service) return;
    const ageMin = (now - r.timestamp)/60000; if(ageMin > ageLimit) return;
    if(openOnly && (r.effective_capacity<=0)) return;
    if(problemOnly && !(r.broken_docks>0 || r.broken_bike_count>0 || !r.is_online || r.out_of_service)) return;

    const lat = r.latitude; const lon = r.longitude;
    const pct = r.percent_full; const color = colorForPercent(pct);
    const is_online = r.is_online; const out_of_service = r.out_of_service;

    const el = document.createElement('div'); el.style.width='20px';el.style.height='20px';el.style.display='flex';el.style.alignItems='center';el.style.justifyContent='center';el.style.borderRadius='6px';el.style.border='2px solid #fff';el.style.boxShadow='0 1px 2px rgba(0,0,0,0.2)';
    if(out_of_service || !is_online){ el.style.background='#444'; el.style.transform='rotate(45deg)'; }
    else { el.style.background = color; el.style.borderRadius='4px'; }

    const marker = L.marker([lat,lon],{icon: L.divIcon({className:'', html:el.outerHTML, iconSize:[28,28], iconAnchor:[14,14]})});
    marker.on('click', ()=>{ openStationPanel(r.station_id); });
    marker.addTo(appState.map);
    appState.markers.push(marker);
  });
}

function openStationPanel(station_id){
  const s = appState.latestByStation[station_id];
  if(!s) return;
  const panel = document.getElementById('station-panel'); panel.setAttribute('aria-hidden','false'); panel.style.display='block';
  const cont = document.getElementById('station-details'); cont.innerHTML = '';
  const title = document.createElement('h3'); title.textContent = s.station_name; cont.appendChild(title);
  const meta = document.createElement('div'); meta.innerHTML = `<div><strong>District:</strong> ${s.district}</div><div><strong>Updated:</strong> ${s.timestamp.toLocaleString()}</div><div><strong>Fill:</strong> ${isNaN(s.percent_full)?'n/a':Math.round(s.percent_full*100)+'%'}</div><div><strong>Bikes:</strong> ${s.bikes_available}/${s.effective_capacity} (total docks ${s.total_docks})</div><div><strong>Broken docks:</strong> ${s.broken_docks}</div>`;
  cont.appendChild(meta);

  // 24h sparkline (last 24h values)
  const spark = document.createElement('canvas'); spark.width=260; spark.height=40; spark.style.marginTop='8px'; cont.appendChild(spark);
  drawSparkline(spark, station_id);

  // per-dock grid interactive
  const dockLabel = document.createElement('div'); dockLabel.style.marginTop='8px'; dockLabel.textContent = 'Per-dock view (click to flag a dock)'; cont.appendChild(dockLabel);
  const grid = renderPerDockGridInteractive(s.total_docks, s.broken_docks, s.bikes_available, s.broken_bike_count, station_id);
  cont.appendChild(grid);

  // ticket creation button
  const btn = document.createElement('button'); btn.textContent = 'Create repair ticket for station'; btn.style.marginTop='8px'; btn.addEventListener('click', ()=>{ createTicket({station_id:station_id, station_name:s.station_name, issue:'manual report via UI'}); alert('Ticket created (localStorage)'); renderMaintenancePage(); }); cont.appendChild(btn);
}

document.getElementById?.('close-station-panel')?.addEventListener?.('click', ()=>{ document.getElementById('station-panel').style.display='none'; });

function drawSparkline(canvas, station_id){
  const ctx = canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width,canvas.height);
  // take last 24h (288 samples at 5-min); filter appState.allRows
  const rows = appState.allRows.filter(r=>r.station_id===station_id).sort((a,b)=>a.timestamp-b.timestamp);
  const cutoff = Date.now() - 24*3600*1000;
  const last = rows.filter(r=>r.timestamp.getTime()>=cutoff).slice(-288);
  if(last.length===0){ ctx.fillStyle='#999'; ctx.fillText('no recent data',10,20); return; }
  const vals = last.map(r=> isNaN(r.percent_full)?0:r.percent_full );
  const w = canvas.width, h = canvas.height;
  const maxv = Math.max(...vals), minv = Math.min(...vals);
  ctx.strokeStyle='#2f80ed'; ctx.beginPath();
  vals.forEach((v,i)=>{
    const x = (i/(vals.length-1))*(w-4)+2; const y = h-2 - ((v-minv)/(maxv-minv||1))*(h-4);
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  }); ctx.stroke();
}

function renderPerDockGridInteractive(total, broken, bikes, stuck, station_id){
  const div = document.createElement('div'); div.className='dock-grid'; div.style.display='flex'; div.style.flexWrap='wrap'; div.style.maxWidth='260px';
  let remaining = total; const brokenCount = Math.min(broken, total); remaining -= brokenCount; const stuckCount = Math.min(stuck, bikes); const occupiedCount = Math.min(bikes - stuckCount, remaining); remaining -= occupiedCount; const emptyCount = remaining;
  for(let i=0;i<brokenCount;i++) div.appendChild(dockSquareInteractive('broken', station_id));
  for(let i=0;i<stuckCount;i++) div.appendChild(dockSquareInteractive('stuck', station_id));
  for(let i=0;i<occupiedCount;i++) div.appendChild(dockSquareInteractive('occupied', station_id));
  for(let i=0;i<emptyCount;i++) div.appendChild(dockSquareInteractive('empty', station_id));
  return div;
}

function dockSquareInteractive(state, station_id){
  const d = document.createElement('div'); d.className='dock-square '+state; d.style.width='14px'; d.style.height='14px'; d.style.margin='2px'; d.style.borderRadius='2px'; d.style.cursor='pointer';
  switch(state){ case 'broken': d.style.background='#444'; d.title='Broken dock'; break; case 'stuck': d.style.background='#8b0000'; d.title='Bike stuck/unrentable'; break; case 'occupied': d.style.background='#2f80ed'; d.title='Occupied (bike available)'; break; case 'empty': d.style.background='#fff'; d.style.border='1px solid #ddd'; d.title='Empty dock'; break; }
  d.addEventListener('click', ()=>{ const reason = prompt('Flag dock issue (e.g. broken, never-locks, stuck bike):'); if(reason){ createTicket({station_id, station_name: appState.latestByStation[station_id].station_name, issue: reason}); alert('Ticket created (localStorage)'); renderMaintenancePage(); } });
  return d;
}

function renderPage(page){
  switch(page){
    case 'map': renderMapMarkers(); break;
    case 'stockouts': renderStockoutsPage(); break;
    case 'health': renderDockHealthPage(); break;
    case 'forecast': renderForecastPage(); break;
    case 'dispatch': renderDispatchPage(); break;
    case 'maintenance': renderMaintenancePage(); break;
    case 'analysis': renderAnalysisPage(); break;
    default: break;
  }
}

// Stockouts (with CSV export)
function renderStockoutsPage(){
  const container = document.getElementById('page-stockouts'); container.innerHTML = '<h2>Stockouts & Heatmap</h2>';
  if(!appState.allRows || appState.allRows.length===0){ container.innerHTML += '<div class="placeholder">No dataset loaded.</div>'; return; }

  // reuse earlier implementation (compact)
  const heatmapCanvas = document.createElement('canvas'); heatmapCanvas.width = 960; heatmapCanvas.height = 360; heatmapCanvas.style.background='#fff'; heatmapCanvas.style.border='1px solid #eee';
  container.appendChild(heatmapCanvas);
  const table = document.createElement('table'); table.className='small-table'; table.style.marginTop='8px'; table.style.width='100%'; table.innerHTML='<thead><tr><th>Type</th><th>Station</th><th>Start</th><th>Duration</th></tr></thead>'; const tbody=document.createElement('tbody'); table.appendChild(tbody); container.appendChild(table);

  // compute events
  const byStation = {};
  appState.allRows.forEach(r=>{ if(!byStation[r.station_id]) byStation[r.station_id]=[]; byStation[r.station_id].push(r); });
  const events = [];
  Object.values(byStation).forEach(rows=>{
    rows.sort((a,b)=>a.timestamp-b.timestamp);
    let inStockout=false, stockStart=null, inFull=false, fullStart=null;
    rows.forEach(r=>{
      if(r.bikes_available===0){ if(!inStockout){ inStockout=true; stockStart=r.timestamp; } }
      else if(inStockout){ events.push({type:'stockout', station:r.station_name, start:stockStart, end:r.timestamp}); inStockout=false; }
      if(r.effective_capacity>0 && r.bikes_available>=r.effective_capacity){ if(!inFull){ inFull=true; fullStart=r.timestamp; } }
      else if(inFull){ events.push({type:'fullout', station:r.station_name, start:fullStart, end:r.timestamp}); inFull=false; }
    });
  });
  events.sort((a,b)=>b.start-a.start);
  events.slice(0,200).forEach(ev=>{ const tr=document.createElement('tr'); tr.innerHTML=`<td>${ev.type}</td><td>${ev.station}</td><td>${ev.start.toLocaleString()}</td><td>${((ev.end-ev.start)/60000).toFixed(1)} min</td>`; tbody.appendChild(tr); });

  // draw simple heatmap: percent open by hour/day
  const hourOfWeek = Array.from({length:168}, ()=>[]);
  appState.allRows.forEach(r=>{ const openSlots = r.effective_capacity - r.bikes_available; const percentOpen = r.effective_capacity>0 ? openSlots / r.effective_capacity : NaN; const idx = r.timestamp.getDay()*24 + r.timestamp.getHours(); if(!isNaN(percentOpen)) hourOfWeek[idx].push(percentOpen); });
  const ctx = heatmapCanvas.getContext('2d'); const cols=24, rowsH=7; const cellW=heatmapCanvas.width/cols, cellH=heatmapCanvas.height/rowsH; for(let dow=0;dow<7;dow++){ for(let hour=0;hour<24;hour++){ const arr=hourOfWeek[dow*24+hour]; const avg = arr.length? arr.reduce((a,b)=>a+b,0)/arr.length : NaN; ctx.fillStyle = isNaN(avg)? '#eee': interpolateColor(avg); ctx.fillRect(hour*cellW, dow*cellH, cellW-1, cellH-1); ctx.fillStyle='#666'; ctx.font='10px Arial'; const label = isNaN(avg)? '-' : Math.round(avg*100)+'%'; ctx.fillText(label, hour*cellW+4, dow*cellH+12); } }

  // store for export
  appState._stockout_events = events;
}

function exportStockoutsCSV(){
  const events = appState._stockout_events || [];
  if(events.length===0){ alert('No events to export'); return; }
  const rows = [['type','station','start','end','duration_minutes']];
  events.forEach(e=> rows.push([e.type, e.station, e.start.toISOString(), e.end.toISOString(), ((e.end-e.start)/60000).toFixed(1)]));
  const csv = rows.map(r=> r.map(c=>`"${c}"`).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download='stockouts.csv'; a.click(); URL.revokeObjectURL(url);
}

function interpolateColor(frac){ if(frac<=0) return '#ff4d4f'; if(frac>=1) return '#5cb85c'; const r=Math.round(255*(1-frac)); const g=Math.round(200*frac); return `rgb(${r},${g},40)`; }

// Dock Health
function renderDockHealthPage(){
  const container = document.getElementById('page-health'); container.innerHTML = '<h2>Dock Health</h2>';
  if(!appState.latestByStation || Object.keys(appState.latestByStation).length===0){ container.innerHTML += '<div class="placeholder">No dataset loaded.</div>'; return; }
  const table = document.createElement('table'); table.className='health-table small-table'; table.style.width='100%'; table.innerHTML='<thead><tr><th>Station</th><th>District</th><th>Effective Capacity</th><th>Broken Docks</th><th>Broken Bikes</th><th>Per-dock</th></tr></thead>';
  const tbody = document.createElement('tbody'); table.appendChild(tbody);
  Object.values(appState.latestByStation).forEach(r=>{ const tr=document.createElement('tr'); const td1=document.createElement('td'); td1.textContent = r.station_name; const td2=document.createElement('td'); td2.textContent = r.district; const td3=document.createElement('td'); td3.textContent = r.effective_capacity; const td4=document.createElement('td'); td4.textContent = r.broken_docks; const td5=document.createElement('td'); td5.textContent = r.broken_bike_count; const td6=document.createElement('td'); td6.appendChild(renderPerDockGridInteractive(r.total_docks, r.broken_docks, r.bikes_available, r.broken_bike_count, r.station_id)); tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3); tr.appendChild(td4); tr.appendChild(td5); tr.appendChild(td6); tbody.appendChild(tr); }); container.appendChild(table);
}

// Forecast, Dispatch, Maintenance and Analysis reuse earlier implementations but read/write tickets to localStorage
function renderForecastPage(){ const container=document.getElementById('page-forecast'); container.innerHTML='<h2>Forecast & At-Risk</h2>'; if(!appState.allRows||appState.allRows.length===0){ container.innerHTML+='<div class="placeholder">No dataset loaded.</div>'; return;} const byStation={}; appState.allRows.forEach(r=>{ if(!byStation[r.station_id]) byStation[r.station_id]=[]; byStation[r.station_id].push(r); }); const risks=[]; Object.values(byStation).forEach(rows=>{ rows.sort((a,b)=>a.timestamp-b.timestamp); const latest=rows[rows.length-1]; const lastN=rows.slice(-6); if(lastN.length>=2){ const t0=lastN[0].timestamp.getTime(); const ys=lastN.map(r=>r.bikes_available); const xs=lastN.map(r=> (r.timestamp.getTime()-t0)/60000 ); const slope=linearSlope(xs, ys); const predict30=latest.bikes_available + slope*30; const predict60=latest.bikes_available + slope*60; risks.push({station:latest.station_name, station_id:latest.station_id, district:latest.district, latest, slope, predict30, predict60, risk: Math.abs(predict30-latest.bikes_available)}); } }); risks.sort((a,b)=>Math.abs(b.predict30 - b.latest.bikes_available) - Math.abs(a.predict30 - a.latest.bikes_available)); const table=document.createElement('table'); table.className='small-table'; table.style.width='100%'; table.innerHTML='<thead><tr><th>Rank</th><th>Station</th><th>District</th><th>Now</th><th>Pred 30m</th><th>Pred 60m</th><th>Risk</th></tr></thead>'; const tbody=document.createElement('tbody'); risks.slice(0,50).forEach((r,i)=>{ const tr=document.createElement('tr'); tr.innerHTML = `<td>${i+1}</td><td>${r.station}</td><td>${r.district}</td><td>${r.latest.bikes_available}/${r.latest.effective_capacity}</td><td>${Math.round(Math.max(0,Math.min(r.predict30, r.latest.effective_capacity)))}</td><td>${Math.round(Math.max(0,Math.min(r.predict60, r.latest.effective_capacity)))}</td><td>${Math.round(Math.abs(r.predict30 - r.latest.bikes_available))}</td>`; tbody.appendChild(tr); }); table.appendChild(tbody); container.appendChild(table); }

function linearSlope(xs, ys){ const n=xs.length; const meanX=xs.reduce((a,b)=>a+b,0)/n; const meanY=ys.reduce((a,b)=>a+b,0)/n; let num=0, den=0; for(let i=0;i<n;i++){ num+=(xs[i]-meanX)*(ys[i]-meanY); den+=(xs[i]-meanX)*(xs[i]-meanX); } return den===0?0:(num/den); }

function renderDispatchPage(){ const container=document.getElementById('page-dispatch'); container.innerHTML='<h2>Dispatch</h2>'; if(!appState.latestByStation||Object.keys(appState.latestByStation).length===0){ container.innerHTML+='<div class="placeholder">No dataset loaded.</div>'; return;} const fulls=[]; const empties=[]; Object.values(appState.latestByStation).forEach(s=>{ if(s.effective_capacity<=0) return; const excess = s.bikes_available - s.effective_capacity; const need = s.effective_capacity - s.bikes_available; if(excess>0) fulls.push({...s,excess}); if(need>0) empties.push({...s,need}); if(s.percent_full>=1) fulls.push({...s,excess:Math.max(1,s.bikes_available - s.effective_capacity)}); if(s.percent_full===0) empties.push({...s,need:s.effective_capacity}); }); const moves=[]; const uniqFull={}; fulls.forEach(f=>{ if(!uniqFull[f.station_id]||uniqFull[f.station_id].excess<f.excess) uniqFull[f.station_id]=f; }); const uniqEmpty={}; empties.forEach(e=>{ if(!uniqEmpty[e.station_id]||uniqEmpty[e.station_id].need<e.need) uniqEmpty[e.station_id]=e; }); const fullArr=Object.values(uniqFull), emptyArr=Object.values(uniqEmpty); fullArr.forEach(f=>{ let best=null,bestDist=1e9; emptyArr.forEach(e=>{ const d=haversine(f.latitude,f.longitude,e.latitude,e.longitude); if(d<bestDist){ bestDist=d; best=e; } }); if(best){ const moveCount=Math.min(f.excess,best.need,6); moves.push({from:f,to:best,count:moveCount,distance:bestDist.toFixed(2)}); f.excess-=moveCount; best.need-=moveCount; } }); const cols=document.createElement('div'); cols.style.display='flex'; cols.style.gap='12px'; const col1=document.createElement('div'); col1.style.flex='1'; const col2=document.createElement('div'); col2.style.flex='1'; const col3=document.createElement('div'); col3.style.flex='1'; col1.innerHTML='<h3>Recommended Pickup / Drop-off</h3>'; const ul=document.createElement('ul'); moves.forEach(m=>{ const li=document.createElement('li'); li.textContent=`${m.count} bikes: ${m.from.station_name} → ${m.to.station_name} (${m.distance} km)`; ul.appendChild(li); }); col1.appendChild(ul); col2.innerHTML='<h3>Task Queue</h3><div><strong>Rebalancing</strong></div>'; const rq=document.createElement('ol'); moves.forEach(m=>{ const li=document.createElement('li'); li.textContent=`Move ${m.count} bikes from ${m.from.station_name} to ${m.to.station_name}`; rq.appendChild(li); }); col2.appendChild(rq); const repairDiv=document.createElement('div'); repairDiv.innerHTML='<strong>Repair (auto-generated)</strong>'; const repairList=document.createElement('ol'); Object.values(appState.latestByStation).filter(s=>s.broken_docks>0).slice(0,12).forEach(s=>{ const li=document.createElement('li'); li.textContent=`${s.station_name} — ${s.broken_docks} broken docks`; repairList.appendChild(li); }); col2.appendChild(repairDiv); col2.appendChild(repairList); col3.innerHTML='<h3>Van Status</h3>'; const vans=[{id:'Van 1',lat:40.7128,lon:-74.0060,capacity:12,load:0},{id:'Van 2',lat:40.705,lon:-74.01,capacity:12,load:0}]; vans.forEach(v=>{ const card=document.createElement('div'); card.style.padding='8px'; card.style.background='#fff'; card.style.marginBottom='8px'; card.style.border='1px solid #eee'; card.innerHTML=`<strong>${v.id}</strong><div>Location: ${v.lat.toFixed(3)}, ${v.lon.toFixed(3)}</div><div>Load: ${v.load}/${v.capacity}</div>`; col3.appendChild(card); }); cols.appendChild(col1); cols.appendChild(col2); cols.appendChild(col3); container.appendChild(cols); }

function haversine(lat1,lon1,lat2,lon2){ const R=6371; const toRad=Math.PI/180; const dLat=(lat2-lat1)*toRad; const dLon=(lon2-lon1)*toRad; const a=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(lat1*toRad)*Math.cos(lat2*toRad)*Math.sin(dLon/2)*Math.sin(dLon/2); const c=2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a)); return R*c; }

function renderMaintenancePage(){ const container=document.getElementById('page-maintenance'); container.innerHTML='<h2>Maintenance</h2>'; // show tickets from localStorage
  const tdiv=document.createElement('div'); tdiv.style.marginTop='8px'; tdiv.innerHTML=`<strong>Local tickets:</strong> (${appState.tickets.length}) <button id='new-ticket-btn'>New ticket</button>`; container.appendChild(tdiv);
  document.getElementById('new-ticket-btn')?.addEventListener('click', ()=>{ const station = prompt('Station name'); const issue = prompt('Issue description'); if(station && issue){ createTicket({station_name:station, issue}); renderMaintenancePage(); } });
  const table=document.createElement('table'); table.className='small-table'; table.style.width='100%'; table.innerHTML='<thead><tr><th>ID</th><th>Station</th><th>Issue</th><th>Opened</th><th>Status</th></tr></thead>'; const tbody=document.createElement('tbody'); appState.tickets.forEach(t=>{ const tr=document.createElement('tr'); tr.innerHTML=`<td>${t.id}</td><td>${t.station_name||''}</td><td>${t.issue}</td><td>${new Date(t.opened).toLocaleString()}</td><td>${t.status}</td>`; tbody.appendChild(tr); }); table.appendChild(tbody); container.appendChild(table);
  // repeat-offender quick report
  const counts={}; appState.tickets.forEach(t=>{ if(t.station_name) counts[t.station_name]=(counts[t.station_name]||0)+1; }); const offenders=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,10); const rep=document.createElement('div'); rep.style.marginTop='8px'; rep.innerHTML='<h4>Repeat offenders</h4>'; offenders.forEach(o=>{ const p=document.createElement('div'); p.textContent=`${o[0]} — ${o[1]} tickets`; rep.appendChild(p); }); container.appendChild(rep); }

function renderAnalysisPage(){ const container=document.getElementById('page-analysis'); container.innerHTML='<h2>Data Analysis</h2>'; if(!appState.allRows||appState.allRows.length===0){ container.innerHTML+='<div class="placeholder">No dataset loaded.</div>'; return; } // basic FMEA table
  const occ = {'Station empty':0,'Station full':0,'Docks disabled':0,'Silent feed':0}; appState.allRows.forEach(r=>{ if(r.bikes_available===0) occ['Station empty']++; if(r.effective_capacity>0 && r.bikes_available>=r.effective_capacity) occ['Station full']++; if(r.broken_docks>0) occ['Docks disabled']++; if(!r.is_online) occ['Silent feed']++; }); const table=document.createElement('table'); table.className='small-table'; table.style.width='100%'; table.innerHTML='<thead><tr><th>Failure</th><th>Occurrence</th><th>S</th><th>O</th><th>D</th><th>RPN</th></tr></thead>'; const tbody=document.createElement('tbody'); Object.keys(occ).forEach(k=>{ const O=Math.max(1,Math.min(10,Math.round(occ[k]/10))); const S=defaultSeverity(k); const D=defaultDetection(k); const rpn=S*O*D; const tr=document.createElement('tr'); tr.innerHTML=`<td>${k}</td><td>${occ[k]}</td><td>${S}</td><td>${O}</td><td>${D}</td><td>${rpn}</td>`; tbody.appendChild(tr); }); table.appendChild(tbody); container.appendChild(table); }

function defaultSeverity(k){ if(k.includes('empty')) return 8; if(k.includes('full')) return 6; if(k.includes('Silent')) return 7; return 5; }
function defaultDetection(k){ if(k.includes('Silent')) return 9; if(k.includes('Docks')) return 6; return 5; }

window.addEventListener('DOMContentLoaded', init);
