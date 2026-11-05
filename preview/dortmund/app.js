'use strict';
const map=L.map('map',{preferCanvas:true}).setView([51.5136,7.4653],11);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
const layer=L.layerGroup().addTo(map),status=document.getElementById('status'),search=document.getElementById('search'),mode=document.getElementById('mode');
let data;
function render(){
 if(!data)return;
 layer.clearLayers();
 const q=search.value.trim().toLocaleLowerCase('de'),kind=mode.value;
 const stops=new Map(data.stations.map(s=>[s.id,s]));
 const visible=data.lines.filter(l=>(!kind||l.type===kind)&&(!q||l.name.toLocaleLowerCase('de').includes(q)||l.stationIds.some(id=>stops.get(id)?.name.toLocaleLowerCase('de').includes(q))));
 const stationIds=new Set(),bounds=[];
 for(const l of visible){
   const pts=l.stationIds.map(id=>stops.get(id)).filter(Boolean);
   pts.forEach(s=>stationIds.add(s.id));
   if(pts.length>1){
     const coords=pts.map(s=>[s.lat,s.lng]);
     L.polyline(coords,{color:/^#[0-9a-f]{6}$/i.test(l.color)&&l.color!=='#000000'?l.color:'#1769aa',weight:3,opacity:.65}).bindPopup('Linie '+escapeHtml(l.name)+' · schematische Verbindung').addTo(layer);
   }
 }
 for(const id of stationIds){const s=stops.get(id);if(!s)continue;bounds.push([s.lat,s.lng]);L.circleMarker([s.lat,s.lng],{radius:4,weight:1,color:'#123d60',fillColor:'#f9fafb',fillOpacity:.9}).bindPopup(escapeHtml(s.name)).addTo(layer)}
 status.textContent=visible.length+' Linienvarianten · '+stationIds.size+' Haltestellen · Stand: '+(data.sourceDate||'VRR-GTFS');
 if(q&&bounds.length)map.fitBounds(bounds,{padding:[25,25],maxZoom:14});
}
function escapeHtml(x){return String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
Promise.resolve().then(async()=>{
 const res=await fetch('./data/dortmund.json',{cache:'no-store'});
 if(!res.ok)throw Error('Keine GTFS-Daten veröffentlicht ('+res.status+').');
 data=await res.json();
 if(!Array.isArray(data.stations)||!Array.isArray(data.lines)||!data.stations.length||!data.lines.length)throw Error('GTFS-Daten fehlen oder sind leer.');
 render();
}).catch(e=>{status.textContent='Fehler: '+e.message;console.error(e)});
search.addEventListener('input',render);mode.addEventListener('change',render);