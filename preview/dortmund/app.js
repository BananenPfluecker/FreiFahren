'use strict';
const map = L.map('map', {preferCanvas:true}).setView([51.5136,7.4653],11);
map.zoomControl.setPosition('bottomright');
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
const layer = L.layerGroup().addTo(map);
const status = document.getElementById('status'), search = document.getElementById('search'), mode = document.getElementById('mode'), results = document.getElementById('results');
let data, stops;
const normalize = value => String(value).toLocaleLowerCase('de').replace(/hauptbahnhof/g,'hbf').replace(/ß/g,'ss').normalize('NFD').replace(/[\u0300-\u036f\s-]/g,'');
function escapeHtml(value) {return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function padding() {
 const panel = document.querySelector('.panel').getBoundingClientRect();
 return innerWidth < 700 ? {paddingTopLeft:[20,panel.bottom+16],paddingBottomRight:[20,50]} : {paddingTopLeft:[panel.right+20,20],paddingBottomRight:[50,50]};
}
function fit(points,maxZoom=14) {if(points.length) map.fitBounds(points,{...padding(),maxZoom});}
function render() {
 if(!data) return;
 map.closePopup(); layer.clearLayers(); results.replaceChildren();
 const q = normalize(search.value), kind = mode.value;
 const eligible = data.lines.filter(line=>!kind||line.type===kind);
 // An exact line number must not also select every longer line containing it.
 const exact = q && eligible.some(line=>normalize(line.name)===q);
 const visible = eligible.filter(line=>!q || (exact ? normalize(line.name)===q : normalize(line.name).includes(q) || line.stationIds.some(id=>normalize(stops.get(id)?.name||'').includes(q))));
 const stationIds = new Set(), bounds = [], markers = new Map();
 for(const line of visible) {
  const points = line.stationIds.map(id=>stops.get(id)).filter(Boolean);
  points.forEach(s=>stationIds.add(s.id));
  const hasGeometry = Array.isArray(line.geometry) && line.geometry.length > 0;
  if(points.length>1) L.polyline(hasGeometry ? line.geometry : points.map(s=>[s.lat,s.lng]),{color:/^#[0-9a-f]{6}$/i.test(line.color)&&line.color!=='#000000'?line.color:'#1769aa',weight:3,opacity:hasGeometry?.8:.5,dashArray:hasGeometry?null:'6 7'}).bindPopup('Linie '+escapeHtml(line.name)+' · '+(hasGeometry?'Verlauf aus GTFS-Streckenkoordinaten':'Schematische Verbindung – Streckenkoordinaten fehlen')).addTo(layer);
 }
 for(const id of stationIds) {
  const s=stops.get(id); bounds.push([s.lat,s.lng]);
  const names=[...new Set(visible.filter(l=>l.stationIds.includes(id)).map(l=>l.name))].sort((a,b)=>a.localeCompare(b,'de',{numeric:true}));
  const marker=L.circleMarker([s.lat,s.lng],{radius:5,weight:1,color:'#123d60',fillColor:'#f9fafb',fillOpacity:.9}).bindPopup('<strong>'+escapeHtml(s.name)+'</strong><br>Linien: '+names.map(escapeHtml).join(', ')).addTo(layer);
  markers.set(id,marker);
 }
 const matchingStops = q && !exact ? [...stationIds].map(id=>stops.get(id)).filter(s=>normalize(s.name).includes(q)) : [];
 for(const s of matchingStops.slice(0,30)) {
  const button=document.createElement('button'); button.type='button'; button.textContent=s.name;
  button.addEventListener('click',()=>{fit([[s.lat,s.lng]],16);markers.get(s.id).openPopup();});
  results.append(button);
 }
 const geometryCount=visible.filter(l=>l.geometry?.length).length;
 document.getElementById('geometry-status').textContent=visible.length ? geometryCount+' von '+visible.length+' Varianten mit GTFS-Verlauf. '+(geometryCount<visible.length?'Gestrichelt: schematisch, Streckenkoordinaten fehlen.':'Durchgezogen: Verlauf aus GTFS-Streckenkoordinaten.') : '';
 const count=new Set(visible.map(l=>l.type+'|'+l.name)).size;
 status.textContent=(visible.length ? count+' Linien · '+visible.length+' Varianten · '+stationIds.size+' Haltestellen' : 'Keine Treffer. Suche oder Verkehrsmittel ändern.')+' · Stand: '+(data.sourceDate||'VRR-GTFS');
 fit(matchingStops.length ? matchingStops.map(s=>[s.lat,s.lng]) : bounds, q?14:12);
}
async function load() {
 try {
  const res=await fetch('./data/dortmund.json',{cache:'no-store'});
  if(!res.ok) throw Error('Keine GTFS-Daten veröffentlicht ('+res.status+').');
  data=await res.json();
  if(!Array.isArray(data.stations)||!Array.isArray(data.lines)||!data.stations.length||!data.lines.length) throw Error('GTFS-Daten fehlen oder sind leer.');
  stops=new Map(data.stations.map(s=>[s.id,s])); render();
 } catch(error) {status.textContent='Fehler: '+error.message; console.error(error);}
}
search.addEventListener('input',render);mode.addEventListener('change',render);
document.getElementById('reset').addEventListener('click',()=>{search.value='';mode.value='';render();});
new ResizeObserver(()=>{map.invalidateSize();if(data)render();}).observe(document.getElementById('map'));
load();
