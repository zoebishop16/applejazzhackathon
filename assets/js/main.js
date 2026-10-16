// assets/js/main.js
// Simple client-side logic that loads the first available CSV dataset in data/ (if any) and plots stations on a Leaflet map.

const appState = {
  map: null,
  markers: [],
  currentDataset: null,
  stationsById: {}
}

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
  // Look for datasets in data/ (we can't list directories from static site), so we offer the two conventional sample paths.
  const candidates = [
    'data/normal_week/sample_quick_normal.csv',
    'data/normal_week/sample_quick_normal_2.csv',
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
    parseCSVAndRender(text);
    document.getElementById('last-updated').textContent = new Date().toLocaleString();
  }catch(err){
    console.error(err);
    document.getElementById('last-updated').textContent = 'error loading dataset';
  }
}

function parseCSVAndRender(csvText){
  const rows = csvText.trim().split('\n');
  const header = rows.shift().split(',').map(h=>h.trim());
  const data = rows.map(r=>r.split(',').map(c=>c.trim()));
  const parsed = data.map(r=>{
    const obj = {};
    for(let i=0;i<header.length;i++) obj[header[i]] = r[i];
    return obj;
  });

  // collapse to latest timestamp per station
  const byStation = {};
  parsed.forEach(r=>{
    const sid = r.station_id;
    const ts = new Date(r.timestamp);
    if(!byStation[sid] || new Date(byStation[sid].timestamp) < ts) byStation[sid] = r;
  });

  // clear old markers
  appState.markers.forEach(m=>appState.map.removeLayer(m));
  appState.markers = [];

  Object.values(byStation).forEach(r=>{
    const lat = parseFloat(r.latitude);
    const lon = parseFloat(r.longitude);
    const pct = r.percent_full === '' ? NaN : parseFloat(r.percent_full);
    const color = colorForPercent(pct);
    const is_online = r.is_online === 'True' || r.is_online === 'true' || r.is_online === '1';
    const out_of_service = r.out_of_service === 'True' || r.out_of_service === 'true' || r.out_of_service === '1';

    // choose icon
    const el = document.createElement('div'); el.style.width='18px';el.style.height='18px';el.style.borderRadius='6px';el.style.border='2px solid #fff';el.style.boxShadow='0 1px 2px rgba(0,0,0,0.2)';
    if(out_of_service || !is_online){ el.style.background='#444'; el.style.transform='rotate(45deg)'; }
    else el.style.background = color;

    const marker = L.marker([lat,lon],{icon: L.divIcon({className:'', html:el.outerHTML, iconSize:[24,24], iconAnchor:[12,12]})});
    const popupHtml = `<strong>${r.station_name}</strong><br/>District: ${r.district}<br/>Bikes: ${r.bikes_available}/${r.effective_capacity} (${(isNaN(pct)?'n/a':Math.round(pct*100)+'%')})<br/>Broken docks: ${r.broken_docks}`;
    marker.bindPopup(popupHtml);
    marker.addTo(appState.map);
    appState.markers.push(marker);
  });
}

window.addEventListener('DOMContentLoaded', init);
