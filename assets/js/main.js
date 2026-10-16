// assets/js/main.js
// Expanded dashboard logic: loads full CSV dataset and renders pages: Live Map, Stockouts & Heatmap,
// Dock Health, Forecast, Dispatch, Maintenance, and Data Analysis (lightweight implementations).

const appState = {
  map: null,
  markers: [],
  currentDataset: null,
  stationsById: {},
  allRows: [],
  latestByStation: {},
  parsedTimestamps: [],
};

function init() {
  setupSidebar();
  setupMap();
  populateDatasetSelect();
  document.getElementById('refresh-data').addEventListener('click', ()=> loadDataset(document.getElementById('dataset-select').value));
}

function setupSidebar(){
  document.querySelectorAll('#sidebar nav li').forEach(li=>{
    li.addEventListener('click', ()=>{
      document.querySelectorAll('#sidebar nav li').forEach(x=>x.classList.remove('active'));
      li.classList.add('active');
      const page = li.dataset.page;
      document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
      document.getElementById('page-'+page).classList.add('active');
      document.getElementById('page-title').textContent = li.textContent;
      // render page on show
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
    // convert numeric fields
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
  // build latestByStation
  appState.latestByStation = {};
  parsed.forEach(r=>{
    const sid = r.station_id;
    if(!appState.latestByStation[sid] || appState.latestByStation[sid].timestamp < r.timestamp) appState.latestByStation[sid] = r;
  });
  appState.parsedTimestamps = Array.from(new Set(parsed.map(r=>r.timestamp.getTime()))).sort().map(t=>new Date(t));
}

// robust CSV split (handles simple quoted fields)
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

function renderMapMarkers(){
  // clear old markers
  appState.markers.forEach(m=>appState.map.removeLayer(m));
  appState.markers = [];

  Object.values(appState.latestByStation).forEach(r=>{
    const lat = r.latitude;
    const lon = r.longitude;
    const pct = r.percent_full;
    const color = colorForPercent(pct);
    const is_online = r.is_online;
    const out_of_service = r.out_of_service;

    const el = document.createElement('div'); el.style.width='20px';el.style.height='20px';el.style.borderRadius='6px';el.style.border='2px solid #fff';el.style.boxShadow='0 1px 2px rgba(0,0,0,0.2)';
    if(out_of_service || !is_online){ el.style.background='#444'; el.style.transform='rotate(45deg)'; }
    else el.style.background = color;

    const marker = L.marker([lat,lon],{icon: L.divIcon({className:'', html:el.outerHTML, iconSize:[28,28], iconAnchor:[14,14]})});
    const popupHtml = `<strong>${r.station_name}</strong><br/>District: ${r.district}<br/>Bikes: ${r.bikes_available}/${r.effective_capacity} (${(isNaN(pct)?'n/a':Math.round(pct*100)+'%')})<br/>Broken docks: ${r.broken_docks}`;
    marker.bindPopup(popupHtml);
    marker.addTo(appState.map);
    appState.markers.push(marker);
  });
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

// -- Stockouts & Heatmap --
function renderStockoutsPage(){
  const container = document.getElementById('page-stockouts');
  container.innerHTML = '<h2>Stockouts & Heatmap</h2>';
  if(!appState.allRows || appState.allRows.length===0){ container.innerHTML += '<div class="placeholder">No dataset loaded.</div>'; return; }

  const heatDiv = document.createElement('div'); heatDiv.style.display='flex'; heatDiv.style.gap='12px';
  const heatmapCanvas = document.createElement('canvas'); heatmapCanvas.width = 840; heatmapCanvas.height = 360; heatmapCanvas.style.background='#fff'; heatmapCanvas.style.border='1px solid #eee';
  heatDiv.appendChild(heatmapCanvas);

  const tableDiv = document.createElement('div'); tableDiv.style.flex='1';
  const table = document.createElement('table'); table.style.width='100%'; table.className='small-table';
  const thead = document.createElement('thead'); thead.innerHTML='<tr><th>Type</th><th>Station</th><th>Start</th><th>Duration</th></tr>';
  table.appendChild(thead);
  const tbody = document.createElement('tbody'); table.appendChild(tbody);
  tableDiv.appendChild(table);

  container.appendChild(heatDiv); container.appendChild(tableDiv);

  const hourOfWeek = Array.from({length:168}, ()=>[]);

  // group rows by station
  const byStation = {};
  appState.allRows.forEach(r=>{ if(!byStation[r.station_id]) byStation[r.station_id]=[]; byStation[r.station_id].push(r); });

  // detect stockouts and fullouts
  const events = [];
  Object.values(byStation).forEach(rows=>{
    rows.sort((a,b)=>a.timestamp - b.timestamp);
    let inStockout = false, stockStart=null;
    let inFullout = false, fullStart=null;
    rows.forEach(r=>{
      const openSlots = r.effective_capacity - r.bikes_available; // docks open
      const percentOpen = r.effective_capacity>0 ? (openSlots / r.effective_capacity) : NaN;
      const h = (r.timestamp.getDay()*24 + r.timestamp.getHours());
      if(!isNaN(percentOpen)) hourOfWeek[h].push(percentOpen);

      if(r.bikes_available === 0){
        if(!inStockout){ inStockout=true; stockStart=r.timestamp; }
      } else {
        if(inStockout){ events.push({type:'stockout', station:r.station_name, start:stockStart, end:r.timestamp}); inStockout=false; stockStart=null; }
      }

      if(r.effective_capacity>0 && (r.bikes_available >= r.effective_capacity)){
        if(!inFullout){ inFullout=true; fullStart=r.timestamp; }
      } else {
        if(inFullout){ events.push({type:'fullout', station:r.station_name, start:fullStart, end:r.timestamp}); inFullout=false; fullStart=null; }
      }
    });
    // close open events at series end
    if(inStockout) events.push({type:'stockout', station:rows[0].station_name, start:stockStart, end:rows[rows.length-1].timestamp});
    if(inFullout) events.push({type:'fullout', station:rows[0].station_name, start:fullStart, end:rows[rows.length-1].timestamp});
  });

  // populate event table (top recent 200)
  events.sort((a,b)=>b.start - a.start);
  events.slice(0,200).forEach(ev=>{
    const tr = document.createElement('tr');
    const dur = ((ev.end - ev.start)/1000/60).toFixed(1)+' min';
    tr.innerHTML = `<td>${ev.type}</td><td>${ev.station}</td><td>${ev.start.toLocaleString()}</td><td>${dur}</td>`;
    tbody.appendChild(tr);
  });

  // draw heatmap: compute average percentOpen per hour
  const ctx = heatmapCanvas.getContext('2d');
  const cols = 24; const rowsH = 7;
  const cellW = heatmapCanvas.width / cols; const cellH = heatmapCanvas.height / rowsH;
  for(let dow=0;dow<7;dow++){
    for(let hour=0;hour<24;hour++){
      const idx = dow*24 + hour;
      const arr = hourOfWeek[idx];
      const avg = arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : NaN;
      const color = avg===undefined || isNaN(avg) ? '#eee' : interpolateColor(avg);
      ctx.fillStyle = color;
      ctx.fillRect(hour*cellW, dow*cellH, cellW-1, cellH-1);
      ctx.fillStyle = '#666'; ctx.font='10px Arial';
      const label = isNaN(avg) ? '-' : Math.round(avg*100)+'%';
      ctx.fillText(label, hour*cellW+4, dow*cellH+12);
    }
  }

  // legend below heatmap
  const legend = document.createElement('div'); legend.style.marginTop='8px'; legend.innerHTML='<strong>Heatmap:</strong> average percent of docks OPEN (higher = more open slots)';
  container.appendChild(legend);
}

function interpolateColor(frac){
  // map 0->red (no open slots) to 1->green (all open)
  if(frac<=0) return '#ff4d4f';
  if(frac>=1) return '#5cb85c';
  // simple linear blend between red and green
  const r = Math.round(255*(1-frac));
  const g = Math.round(200*frac);
  return `rgb(${r},${g},40)`;
}

// -- Dock Health Page --
function renderDockHealthPage(){
  const container = document.getElementById('page-health');
  container.innerHTML = '<h2>Dock Health</h2>';
  if(!appState.latestByStation || Object.keys(appState.latestByStation).length===0){ container.innerHTML += '<div class="placeholder">No dataset loaded.</div>'; return; }

  const table = document.createElement('table'); table.className='health-table'; table.style.width='100%';
  const thead = document.createElement('thead'); thead.innerHTML='<tr><th>Station</th><th>District</th><th>Effective Capacity</th><th>Broken Docks</th><th>Broken Bikes</th><th>Per-dock</th></tr>';
  table.appendChild(thead);
  const tbody = document.createElement('tbody'); table.appendChild(tbody);

  Object.values(appState.latestByStation).forEach(r=>{
    const tr = document.createElement('tr');
    const perDock = renderPerDockGrid(r.total_docks, r.broken_docks, r.bikes_available, r.broken_bike_count);
    tr.innerHTML = `<td>${r.station_name}</td><td>${r.district}</td><td>${r.effective_capacity}</td><td>${r.broken_docks}</td><td>${r.broken_bike_count}</td>`;
    const td = document.createElement('td'); td.appendChild(perDock);
    tr.appendChild(td);
    tbody.appendChild(tr);
  });
  container.appendChild(table);
}

function renderPerDockGrid(total, broken, bikes, stuck){
  // create a flex grid of small squares representing docks; ordering: broken -> bike stuck -> occupied -> empty
  const div = document.createElement('div'); div.className='dock-grid'; div.style.display='flex'; div.style.flexWrap='wrap'; div.style.maxWidth='260px';
  let remaining = total;
  const brokenCount = Math.min(broken, total); remaining -= brokenCount;
  const stuckCount = Math.min(stuck, bikes); // bikes that are broken
  const occupiedCount = Math.min(bikes - stuckCount, remaining); remaining -= occupiedCount;
  const emptyCount = remaining;
  for(let i=0;i<brokenCount;i++) div.appendChild(dockSquare('broken'));
  for(let i=0;i<stuckCount;i++) div.appendChild(dockSquare('stuck'));
  for(let i=0;i<occupiedCount;i++) div.appendChild(dockSquare('occupied'));
  for(let i=0;i<emptyCount;i++) div.appendChild(dockSquare('empty'));
  return div;
}

function dockSquare(state){
  const d = document.createElement('div'); d.className='dock-square '+state; d.style.width='14px'; d.style.height='14px'; d.style.margin='2px'; d.style.borderRadius='2px';
  switch(state){
    case 'broken': d.style.background='#444'; d.title='Broken dock'; break;
    case 'stuck': d.style.background='#8b0000'; d.title='Bike stuck/unrentable'; break;
    case 'occupied': d.style.background='#2f80ed'; d.title='Occupied (bike available)'; break;
    case 'empty': d.style.background='#fff'; d.style.border='1px solid #ddd'; d.title='Empty dock'; break;
  }
  return d;
}

// -- Forecast & At-Risk --
function renderForecastPage(){
  const container = document.getElementById('page-forecast');
  container.innerHTML = '<h2>Forecast & At-Risk</h2>';
  if(!appState.allRows || appState.allRows.length===0){ container.innerHTML += '<div class="placeholder">No dataset loaded.</div>'; return; }

  const list = document.createElement('div'); list.className='forecast-list';
  // for each station, compute recent slope (last 6 samples) and extrapolate 30/60 minutes
  const byStation = {};
  appState.allRows.forEach(r=>{ if(!byStation[r.station_id]) byStation[r.station_id]=[]; byStation[r.station_id].push(r); });
  const risks = [];
  Object.values(byStation).forEach(rows=>{
    rows.sort((a,b)=>a.timestamp-b.timestamp);
    const latest = rows[rows.length-1];
    const lastN = rows.slice(-6);
    if(lastN.length>=2){
      // linear slope bikes per minute
      const t0 = lastN[0].timestamp.getTime();
      const ys = lastN.map(r=>r.bikes_available);
      const xs = lastN.map(r=> (r.timestamp.getTime()-t0)/60000 );
      const slope = linearSlope(xs, ys);
      const predict30 = latest.bikes_available + slope*30;
      const predict60 = latest.bikes_available + slope*60;
      const riskLevel = Math.max(
        Math.max(0, Math.ceil(latest.effective_capacity - predict30)), // risk of full (need drops)
        Math.max(0, Math.ceil(0 - predict30)) // risk of empty (need pickups)
      );
      risks.push({station:latest.station_name, station_id:latest.station_id, district:latest.district, latest:latest, slope, predict30, predict60, risk: Math.abs(predict30-latest.bikes_available)});
    }
  });
  risks.sort((a,b)=>Math.abs(b.predict30 - a.latest.bikes_available) - Math.abs(a.predict30 - a.latest.bikes_available));

  const table = document.createElement('table'); table.className='small-table'; table.style.width='100%';
  table.innerHTML = `<thead><tr><th>Rank</th><th>Station</th><th>District</th><th>Now</th><th>Pred 30m</th><th>Pred 60m</th><th>Risk</th></tr></thead>`;
  const tbody = document.createElement('tbody');
  risks.slice(0,50).forEach((r,i)=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${i+1}</td><td>${r.station}</td><td>${r.district}</td><td>${r.latest.bikes_available}/${r.latest.effective_capacity}</td><td>${Math.round(Math.max(0,Math.min(r.predict30, r.latest.effective_capacity)))}</td><td>${Math.round(Math.max(0,Math.min(r.predict60, r.latest.effective_capacity)))}</td><td>${Math.round(Math.abs(r.predict30 - r.latest.bikes_available))}</td>`;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  container.appendChild(table);
}

function linearSlope(xs, ys){
  const n = xs.length; const meanX = xs.reduce((a,b)=>a+b,0)/n; const meanY = ys.reduce((a,b)=>a+b,0)/n;
  let num=0, den=0;
  for(let i=0;i<n;i++){ num += (xs[i]-meanX)*(ys[i]-meanY); den += (xs[i]-meanX)*(xs[i]-meanX); }
  return den===0?0:(num/den);
}

// -- Dispatch --
function renderDispatchPage(){
  const container = document.getElementById('page-dispatch');
  container.innerHTML = '<h2>Dispatch</h2>';
  if(!appState.latestByStation || Object.keys(appState.latestByStation).length===0){ container.innerHTML += '<div class="placeholder">No dataset loaded.</div>'; return; }

  // find full stations (excess bikes) and empty stations (need bikes)
  const fulls = [], empties = [];
  Object.values(appState.latestByStation).forEach(s=>{
    if(s.effective_capacity<=0) return;
    const excess = s.bikes_available - s.effective_capacity; // positive means overfull
    const need = s.effective_capacity - s.bikes_available; // positive means need bikes
    if(excess>0) fulls.push({...s, excess});
    if(need>0) empties.push({...s, need});
  });
  // for safety also treat stations with percent_full >=1 as full
  Object.values(appState.latestByStation).forEach(s=>{
    if(s.percent_full>=1) fulls.push({...s, excess: Math.max(1, s.bikes_available - s.effective_capacity)});
    if(s.percent_full===0) empties.push({...s, need: s.effective_capacity});
  });

  // build simple pairing nearest-neighbor
  const moves = [];
  const vans = [ {id:'Van 1',lat:40.7128,lon:-74.0060, capacity:12, load:0}, {id:'Van 2',lat:40.705,lon:-74.01, capacity:12, load:0} ];

  // dedupe fulls/empties by station_id
  const uniqFull = {}; fulls.forEach(f=>{ if(!uniqFull[f.station_id] || uniqFull[f.station_id].excess < f.excess) uniqFull[f.station_id]=f; });
  const uniqEmpty = {}; empties.forEach(e=>{ if(!uniqEmpty[e.station_id] || uniqEmpty[e.station_id].need < e.need) uniqEmpty[e.station_id]=e; });

  const fullArr = Object.values(uniqFull); const emptyArr = Object.values(uniqEmpty);

  fullArr.forEach(f=>{
    // find nearest empty
    let best=null, bestDist=1e9;
    emptyArr.forEach(e=>{
      const d = haversine(f.latitude,f.longitude,e.latitude,e.longitude);
      if(d<bestDist){ bestDist=d; best=e; }
    });
    if(best){
      const moveCount = Math.min(f.excess, best.need, 6);
      moves.push({from:f, to:best, count:moveCount, distance:bestDist.toFixed(2)});
      // decrement
      f.excess -= moveCount; best.need -= moveCount;
    }
  });

  // render three columns: recommended, task queue, vans
  const cols = document.createElement('div'); cols.style.display='flex'; cols.style.gap='12px';
  const col1 = document.createElement('div'); col1.style.flex='1'; const col2 = document.createElement('div'); col2.style.flex='1'; const col3 = document.createElement('div'); col3.style.flex='1';

  col1.innerHTML = '<h3>Recommended Pickup / Drop-off</h3>';
  const ul = document.createElement('ul'); moves.forEach(m=>{ const li = document.createElement('li'); li.textContent = `${m.count} bikes: ${m.from.station_name} → ${m.to.station_name} (${m.distance} km)`; ul.appendChild(li); }); col1.appendChild(ul);

  col2.innerHTML = '<h3>Task Queue</h3><div><strong>Rebalancing</strong></div>'; const rq = document.createElement('ol'); moves.forEach(m=>{ const li = document.createElement('li'); li.textContent = `Move ${m.count} bikes from ${m.from.station_name} to ${m.to.station_name}`; rq.appendChild(li); }); col2.appendChild(rq);
  const repairDiv = document.createElement('div'); repairDiv.innerHTML = '<strong>Repair (auto-generated)</strong>';
  // generate some repair tasks from stations with broken docks
  const repairList = document.createElement('ol'); Object.values(appState.latestByStation).filter(s=>s.broken_docks>0).slice(0,12).forEach(s=>{ const li = document.createElement('li'); li.textContent = `${s.station_name} — ${s.broken_docks} broken docks`; repairList.appendChild(li); }); col2.appendChild(repairDiv); col2.appendChild(repairList);

  col3.innerHTML = '<h3>Van Status</h3>';
  vans.forEach(v=>{ const card = document.createElement('div'); card.style.padding='8px'; card.style.background='#fff'; card.style.marginBottom='8px'; card.style.border='1px solid #eee'; card.innerHTML = `<strong>${v.id}</strong><div>Location: ${v.lat.toFixed(3)}, ${v.lon.toFixed(3)}</div><div>Load: ${v.load}/${v.capacity}</div>`; col3.appendChild(card); });

  cols.appendChild(col1); cols.appendChild(col2); cols.appendChild(col3);
  container.appendChild(cols);
}

function haversine(lat1,lon1,lat2,lon2){
  const R=6371;const toRad=Math.PI/180;const dLat=(lat2-lat1)*toRad;const dLon=(lon2-lon1)*toRad;const a=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(lat1*toRad)*Math.cos(lat2*toRad)*Math.sin(dLon/2)*Math.sin(dLon/2);const c=2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));return R*c;
}

// -- Maintenance --
function renderMaintenancePage(){
  const container = document.getElementById('page-maintenance');
  container.innerHTML = '<h2>Maintenance</h2>';
  if(!appState.allRows || appState.allRows.length===0){ container.innerHTML += '<div class="placeholder">No dataset loaded.</div>'; return; }

  // build tickets from stations with broken docks or offline
  const tickets = [];
  Object.values(appState.latestByStation).forEach(s=>{
    if(s.broken_docks>0 || !s.is_online){
      tickets.push({station:s.station_name, station_id:s.station_id, issue: s.broken_docks>0? `${s.broken_docks} broken docks`: (!s.is_online? 'offline feed':'unknown'), status: Math.random()>0.6?'assigned':'open', opened: new Date(Date.now()-Math.random()*7*24*3600*1000), resolved: null});
    }
  });

  // repeat offenders: count number of times a station had broken docks > 0 in dataset
  const counts = {};
  appState.allRows.forEach(r=>{ if(r.broken_docks>0){ counts[r.station_name] = (counts[r.station_name]||0)+1; } });
  const offenders = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,10);

  const tTable = document.createElement('table'); tTable.className='small-table'; tTable.style.width='100%'; tTable.innerHTML = '<thead><tr><th>Station</th><th>Issue</th><th>Status</th><th>Opened</th></tr></thead>';
  const tbody = document.createElement('tbody'); tickets.forEach(t=>{ const tr=document.createElement('tr'); tr.innerHTML = `<td>${t.station}</td><td>${t.issue}</td><td>${t.status}</td><td>${t.opened.toLocaleDateString()}</td>`; tbody.appendChild(tr); }); tTable.appendChild(tbody);

  const stats = document.createElement('div'); stats.style.marginTop='8px'; stats.innerHTML = `<strong>Mean time to repair (simulated):</strong> ${(Math.random()*8+2).toFixed(1)} hrs <br/><strong>Backlog size:</strong> ${tickets.length}`;

  const offenderDiv = document.createElement('div'); offenderDiv.innerHTML = '<h4>Repeat offenders</h4>';
  offenders.forEach(o=>{ const p=document.createElement('div'); p.textContent = `${o[0]} — ${o[1]} occurrences`; offenderDiv.appendChild(p); });

  container.appendChild(stats); container.appendChild(tTable); container.appendChild(offenderDiv);
}

// -- Data Analysis --
function renderAnalysisPage(){
  const container = document.getElementById('page-analysis');
  container.innerHTML = '<h2>Data Analysis</h2>';
  if(!appState.allRows || appState.allRows.length===0){ container.innerHTML += '<div class="placeholder">No dataset loaded.</div>'; return; }

  // FMEA: count occurrences for categories
  const failureTypes = {
    'Station empty':'stockout',
    'Station full':'fullout',
    'Docks disabled':'broken_docks',
    'Silent feed':'offline',
    'Kiosk offline':'offline',
    'Slow van response':'van_delay',
  };
  const occ = { 'Station empty':0, 'Station full':0, 'Docks disabled':0, 'Silent feed':0, 'Kiosk offline':0, 'Slow van response':0 };

  // compute stockout/fullout counts quickly from previous stockout function
  const byStation = {};
  appState.allRows.forEach(r=>{ if(!byStation[r.station_id]) byStation[r.station_id]=[]; byStation[r.station_id].push(r); });
  Object.values(byStation).forEach(rows=>{
    rows.sort((a,b)=>a.timestamp-b.timestamp);
    rows.forEach(r=>{
      if(r.bikes_available===0) occ['Station empty']++;
      if(r.effective_capacity>0 && r.bikes_available>=r.effective_capacity) occ['Station full']++;
      if(r.broken_docks>0) occ['Docks disabled']++;
      if(!r.is_online) occ['Silent feed']++;
    });
  });
  occ['Kiosk offline'] = occ['Silent feed'];
  occ['Slow van response'] = Math.max(1, Math.round(occ['Station empty']/1000));

  const fmeaTable = document.createElement('table'); fmeaTable.className='small-table'; fmeaTable.style.width='100%'; fmeaTable.innerHTML = '<thead><tr><th>Failure</th><th>Occurrence</th><th>S (1-10)</th><th>O (1-10)</th><th>D (1-10)</th><th>RPN</th></tr></thead>';
  const tbody = document.createElement('tbody');
  Object.keys(occ).forEach(k=>{
    const O = clamp(Math.round(scaleTo(occ[k], 0, Math.max(1,occ['Station empty']), 1,10)),1,10);
    const S = defaultSeverity(k);
    const D = defaultDetection(k);
    const rpn = S*O*D;
    const tr = document.createElement('tr'); tr.innerHTML = `<td>${k}</td><td>${occ[k]}</td><td>${S}</td><td>${O}</td><td>${D}</td><td>${rpn}</td>`; tbody.appendChild(tr);
  });
  fmeaTable.appendChild(tbody);

  container.appendChild(document.createElement('div')).appendChild(document.createTextNode('FMEA (auto-populated)'));
  container.appendChild(fmeaTable);

  // Control chart: proportion of stations unusable at each poll (p-chart)
  const polls = {};
  appState.allRows.forEach(r=>{
    const key = r.timestamp.getTime(); if(!polls[key]) polls[key]=[]; polls[key].push(r);
  });
  const times = Object.keys(polls).map(k=>parseInt(k)).sort();
  const proportions = times.map(t=>{ const arr = polls[t]; const unusable = arr.filter(s=> (s.effective_capacity===0 || s.out_of_service)).length; return {t:new Date(t), p: unusable / arr.length}; });

  // compute grand mean X and standard error
  const X = proportions.reduce((a,b)=>a+b.p,0)/proportions.length;
  const sp = Math.sqrt(X*(1-X)/ (Object.keys(appState.latestByStation).length || 1));
  const UCL = Math.min(1, X + 3*sp); const LCL = Math.max(0, X - 3*sp);

  const cc = document.createElement('div'); cc.style.marginTop='12px'; cc.innerHTML = `<strong>Control Chart (p-chart)</strong><div>Grand mean: ${X.toFixed(3)} UCL: ${UCL.toFixed(3)} LCL: ${LCL.toFixed(3)}</div>`;
  const canvas = document.createElement('canvas'); canvas.width=800; canvas.height=200; canvas.style.background='#fff'; canvas.style.border='1px solid #eee';
  cc.appendChild(canvas); container.appendChild(cc);
  drawControlChart(canvas, proportions.map(p=>p.p), X, UCL, LCL);
}

function drawControlChart(canvas, values, mean, ucl, lcl){
  const ctx = canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width,canvas.height);
  const w = canvas.width; const h=canvas.height; const n = values.length; if(n===0) return;
  const maxv = Math.max(...values.concat([ucl])); const minv = Math.min(...values.concat([lcl]));
  for(let i=0;i<n;i++){
    const x = (i/(n-1))*(w-40)+20; const y = h-20 - ((values[i]-minv)/(maxv-minv||1))*(h-40);
    ctx.fillStyle='#2f80ed'; ctx.beginPath(); ctx.arc(x,y,2,0,2*Math.PI); ctx.fill();
    if(i>0){ const x0 = ((i-1)/(n-1))*(w-40)+20; const y0 = h-20 - ((values[i-1]-minv)/(maxv-minv||1))*(h-40); ctx.strokeStyle='#2f80ed'; ctx.beginPath(); ctx.moveTo(x0,y0); ctx.lineTo(x,y); ctx.stroke(); }
  }
  // draw mean and limits
  const yMean = h-20 - ((mean-minv)/(maxv-minv||1))*(h-40);
  ctx.strokeStyle='#000'; ctx.setLineDash([4,4]); ctx.beginPath(); ctx.moveTo(20,yMean); ctx.lineTo(w-20,yMean); ctx.stroke(); ctx.setLineDash([]);
  const yU = h-20 - ((ucl-minv)/(maxv-minv||1))*(h-40); ctx.strokeStyle='#999'; ctx.beginPath(); ctx.moveTo(20,yU); ctx.lineTo(w-20,yU); ctx.stroke();
  const yL = h-20 - ((lcl-minv)/(maxv-minv||1))*(h-40); ctx.strokeStyle='#999'; ctx.beginPath(); ctx.moveTo(20,yL); ctx.lineTo(w-20,yL); ctx.stroke();
}

function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function scaleTo(v, inMin, inMax, outMin, outMax){ if(inMax===inMin) return outMin; return outMin + ( (v - inMin) * (outMax-outMin) / (inMax - inMin) ); }
function defaultSeverity(k){ if(k.includes('empty')) return 8; if(k.includes('full')) return 6; if(k.includes('Silent')) return 7; return 5; }
function defaultDetection(k){ if(k.includes('Silent')) return 9; if(k.includes('Docks')) return 6; return 5; }

window.addEventListener('DOMContentLoaded', init);
