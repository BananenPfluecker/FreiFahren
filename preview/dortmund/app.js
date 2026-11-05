'use strict';
const $=id=>document.getElementById(id), normalize=value=>String(value).toLocaleLowerCase('de').replace(/hauptbahnhof/g,'hbf').replace(/ß/g,'ss').normalize('NFD').replace(/[\u0300-\u036f\s-]/g,'');
const map=L.map('map',{preferCanvas:true,zoomControl:false}).setView([51.5136,7.4653],12);
L.control.zoom({position:'bottomright'}).addTo(map);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
const networkLayer=L.layerGroup().addTo(map), reportLayer=L.layerGroup().addTo(map);
let data,stops,stationLines,uniqueLines,visibleStations=new Set(),markers=new Map(),kind='',reports=[],apiReady=false,formStation=null,submissionId=null,loadingReports=false,toastTimer,clockOffset=0;
const hosted=new URLSearchParams(location.search).get('reports')==='1';
function element(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
function badge(name){return element('span',name||'Linie unbekannt','badge');}
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
function padding(){const r=document.querySelector('.panel').getBoundingClientRect();return innerWidth<701?{paddingTopLeft:[25,r.bottom+20],paddingBottomRight:[30,130]}:{paddingTopLeft:[r.right+35,35],paddingBottomRight:[70,110]};}
function fit(points,maxZoom=14){if(points.length)map.fitBounds(points,{...padding(),maxZoom});}
function goStation(station){$('explore').open=false;fit([[station.lat,station.lng]],16);markers.get(station.id)?.openPopup();}
function linePatterns(name,stationId){return data.lines.filter(l=>(!name||l.name===name)&&(!stationId||l.stationIds.includes(stationId)));}
function populateLines(){
 const selected=$('line').value;
 $('line').replaceChildren(new Option('Alle Linien',''));
 for(const line of uniqueLines.filter(l=>!kind||l.type===kind))$('line').add(new Option(line.name,line.name));
 if([...$('line').options].some(o=>o.value===selected))$('line').value=selected;
}
function selectLine(name){$('search').value='';$('line').value=name;$('explore').open=false;render(true);}
function stationPopup(station){
 const box=element('div');box.append(element('strong',station.name));
 for(const name of stationLines.get(station.id)||[])box.append(badge(name),' ');
 const button=element('button',hosted?'Hier Kontrolle melden':'Private Test-App öffnen','primary');
 button.addEventListener('click',()=>hosted?openReport(station.id):window.open('https://freifahren-dortmund-pruefung.bravehost.chatgpt.site','_blank','noopener'));
 box.append(element('br'),button);return box;
}
function render(move=false){
 if(!data)return;
 networkLayer.clearLayers();map.closePopup();markers=new Map();visibleStations=new Set();
 const q=normalize($('search').value), chosen=$('line').value;
 const eligible=data.lines.filter(l=>(!kind||l.type===kind)&&(!chosen||l.name===chosen));
 const exact=q&&eligible.some(l=>normalize(l.name)===q);
 const visible=eligible.filter(l=>!q||(exact?normalize(l.name)===q:normalize(l.name).includes(q)||l.stationIds.some(id=>normalize(stops.get(id)?.name||'').includes(q))));
 for(const line of visible){
  const points=line.stationIds.map(id=>stops.get(id)).filter(Boolean);points.forEach(s=>visibleStations.add(s.id));
  const geometry=Array.isArray(line.geometry)&&line.geometry.length;
  const color=/^#[0-9a-f]{6}$/i.test(line.color)&&!['#000000','#ffffff'].includes(line.color.toLowerCase())?line.color:'#9de6c5';
  if(points.length>1){
   const box=element('div');box.append(element('strong','Linie '+line.name),element('p',geometry?'Verlauf aus GTFS-Streckenkoordinaten':'Schematisch · Streckenkoordinaten fehlen'));
   const button=element('button','Nur diese Linie anzeigen');button.addEventListener('click',()=>selectLine(line.name));box.append(button);
   L.polyline(geometry?line.geometry:points.map(s=>[s.lat,s.lng]),{color,weight:chosen?4:2,opacity:chosen?.8:.3,dashArray:geometry?null:'6 8'}).bindPopup(box).addTo(networkLayer);
  }
 }
 const bounds=[];
 for(const id of visibleStations){const station=stops.get(id);bounds.push([station.lat,station.lng]);const marker=L.circleMarker([station.lat,station.lng],{radius:chosen?5:3,weight:1,color:'#bedfd0',fillColor:'#223f38',fillOpacity:1}).bindPopup(()=>stationPopup(station)).addTo(networkLayer);markers.set(id,marker);}
 const matches=q&&!exact?[...visibleStations].map(id=>stops.get(id)).filter(s=>normalize(s.name).includes(q)):[];
 $('results').replaceChildren();
 if(q){
  const matchingLines=[...new Set(visible.filter(l=>normalize(l.name).includes(q)).map(l=>l.name))];
  for(const name of matchingLines.slice(0,8)){const button=element('button',undefined,'result');button.append(badge(name),element('span','Linie anzeigen'));button.onclick=()=>selectLine(name);$('results').append(button);}
  for(const station of matches.slice(0,20)){const button=element('button',station.name,'result');button.append(element('small',(stationLines.get(station.id)||[]).join(' · ')));button.onclick=()=>goStation(station);$('results').append(button);}
  if(!visible.length)$('results').append(element('p','Keine Treffer. Suche oder Filter ändern.','muted'));
  if(matches.length>20)$('results').append(element('p',matches.length+' Haltestellen gefunden. Suche eingrenzen.','muted'));
 }
 const names=[...new Set(visible.map(l=>l.name))].sort((a,b)=>a.localeCompare(b,'de',{numeric:true}));
 $('line-list').replaceChildren();for(const name of names){const button=element('button',name,'badge'+(chosen===name?' active':''));button.setAttribute('aria-label','Linie '+name+' anzeigen');button.onclick=()=>selectLine(name);$('line-list').append(button);}
 $('line-count').textContent=names.length;
 $('status').textContent=names.length+(names.length===1?' Linie · ':' Linien · ')+visibleStations.size+' Haltestellen';
 $('geometry-status').textContent=(data.geometryVariants||0)+' von '+data.lines.length+' Varianten enthalten Streckenkoordinaten. Die übrigen sind schematisch dargestellt.';
 if(move)fit(matches.length?matches.map(s=>[s.lat,s.lng]):bounds,q||chosen?14:12);
 renderReports();
}
function formatAge(created){const minutes=Math.max(0,Math.floor((Date.now()+clockOffset-created)/60000));return minutes<1?'Gerade eben':'vor '+minutes+' Min.';}
function renderReports(){
 if(!data)return;
 const active=reports.filter(r=>r.expiresAt>Date.now()+clockOffset && visibleStations.has(r.stationId) && (!$('line').value || !r.lineName || r.lineName===$('line').value));
 reportLayer.clearLayers();$('feed-items').replaceChildren();
 $('reports-count').textContent=apiReady?active.length+' Meldung'+(active.length===1?'':'en'):'Meldungen';
 if(!apiReady){const box=element('div',undefined,'empty-state');box.append(element('strong',hosted?'Verbindung unterbrochen':'Meldungen in der privaten App'),element('p',hosted?'Meldungen können gerade nicht geladen werden. Versuche es mit Aktualisieren erneut.':'Die GitHub-Karte zeigt nur das Netz. Zum Melden die private App öffnen.'));if(!hosted){const link=element('a','Private App öffnen');link.href='https://freifahren-dortmund-pruefung.bravehost.chatgpt.site';link.target='_blank';link.rel='noopener';box.append(link);}$('feed-items').append(box);return;}
 if(!active.length){const box=element('div',undefined,'empty-state');box.append(element('strong','Noch keine Meldungen'),element('p','Für diese Ansicht liegen keine Testmeldungen aus den letzten 60 Minuten vor. Das bedeutet nicht, dass keine Kontrolle stattfindet.'));$('feed-items').append(box);}
 for(const report of active){
  const station=stops.get(report.stationId);if(!station)continue;
  const card=element('article',undefined,'report-card');card.append(badge(report.lineName),element('strong',station.name));
  if(report.directionId)card.append(element('p','Richtung '+(stops.get(report.directionId)?.name||'unbekannt')));
  const footer=element('footer');footer.append(element('span',formatAge(report.createdAt)+' · unbestätigt'));
  if(report.own){const button=element('button','Entfernen');button.setAttribute('aria-label','Eigene Meldung an '+station.name+' entfernen');button.onclick=()=>deleteReport(report.id,button);footer.append(button);}card.append(footer);$('feed-items').append(card);
  const popup=element('div');popup.append(element('strong',station.name),element('p',(report.lineName?'Linie '+report.lineName+' · ':'')+formatAge(report.createdAt)),element('p','Unbestätigte Testmeldung'));
  L.circleMarker([station.lat,station.lng],{radius:11,weight:2,color:'#ffb4a2',fillColor:'#ff665f',fillOpacity:.8}).bindPopup(popup).addTo(reportLayer);
 }
}
async function fetchReports(){
 if(!hosted||loadingReports)return;loadingReports=true;
 try{const response=await fetch('/api/reports',{cache:'no-store'});if(!response.ok)throw Error('API');const body=await response.json();if(!Array.isArray(body.reports))throw Error('Invalid response');reports=body.reports;clockOffset=body.serverTime-Date.now();apiReady=true;$('connection').textContent='Verbunden';}
 catch{apiReady=false;$('connection').textContent='Nicht verbunden';}
 finally{loadingReports=false;$('open-report').disabled=!apiReady||!data;renderReports();}
}
async function deleteReport(id,button){button.disabled=true;try{const response=await fetch('/api/reports/'+id,{method:'DELETE'});if(!response.ok)throw Error('Delete failed');reports=reports.filter(r=>r.id!==id);renderReports();toast('Testmeldung entfernt.');}catch{button.disabled=false;toast('Entfernen fehlgeschlagen. Bitte erneut versuchen.');}}
function updateFormLines(){
 const current=$('report-line').value;$('report-line').replaceChildren(new Option('Nicht bekannt',''));
 if(formStation)for(const name of stationLines.get(formStation)||[])$('report-line').add(new Option(name,name));
 if([...$('report-line').options].some(o=>o.value===current))$('report-line').value=current;updateDirections();
}
function updateDirections(){
 $('direction').replaceChildren(new Option('Nicht bekannt',''));
 const line=$('report-line').value;$('direction').disabled=!line||!formStation;
 if(!line||!formStation)return;
 const ids=new Set(linePatterns(line,formStation).flatMap(l=>[l.stationIds[0],l.stationIds.at(-1)]).filter(id=>id!==formStation));
 for(const id of ids)$('direction').add(new Option(stops.get(id)?.name||id,id));
}
function chooseFormStation(id){formStation=id;$('station-query').value=stops.get(id).name;$('station-options').replaceChildren();$('chosen-station').textContent='Ausgewählt: '+stops.get(id).name;$('chosen-station').hidden=false;updateFormLines();submissionId=null;}
function openReport(stationId){
 if(!data)return;
 if(!hosted){window.open('https://freifahren-dortmund-pruefung.bravehost.chatgpt.site','_blank','noopener');return;}
 if(!apiReady){toast('Meldungen sind gerade nicht erreichbar. Bitte aktualisieren.');return;}
 $('report-form').reset();$('form-error').textContent='';$('station-options').replaceChildren();$('chosen-station').hidden=true;formStation=null;submissionId=null;updateFormLines();
 if(stationId)chooseFormStation(stationId);
 if(stationId&&stationLines.get(stationId)?.includes($('line').value)){$('report-line').value=$('line').value;updateDirections();}
 $('report-dialog').showModal();$('station-query').focus();
}
$('station-query').addEventListener('input',()=>{
 formStation=null;submissionId=null;$('chosen-station').hidden=true;updateFormLines();$('station-options').replaceChildren();
 const q=normalize($('station-query').value);if(q.length<2)return;
 const matches=data.stations.filter(s=>normalize(s.name).includes(q));
 for(const station of matches.slice(0,15)){const button=element('button',station.name);button.type='button';button.onclick=()=>chooseFormStation(station.id);$('station-options').append(button);}
 if(!matches.length)$('station-options').append(element('p','Keine Haltestelle gefunden.','muted'));
});
$('report-line').onchange=()=>{submissionId=null;updateDirections();};$('direction').onchange=()=>submissionId=null;
$('report-form').addEventListener('submit',async event=>{
 event.preventDefault();$('form-error').textContent='';
 if(!formStation){$('form-error').textContent='Bitte eine Haltestelle aus den Suchtreffern auswählen.';$('station-query').focus();return;}
 const button=$('submit-report');button.disabled=true;button.textContent='Speichere …';submissionId ||= crypto.randomUUID();
 try{
  const response=await fetch('/api/reports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:submissionId,stationId:formStation,lineName:$('report-line').value||null,directionId:$('direction').value||null})});
  if(!response.ok){const body=await response.json().catch(()=>({}));const messages={COOLDOWN:'Bitte warte eine Minute zwischen zwei Meldungen.',AUTH_REQUIRED:'Bitte melde dich erneut in der privaten App an.',INVALID_LINE:'Diese Linie hält nicht an der gewählten Haltestelle.',INVALID_STATION:'Bitte eine gültige Haltestelle auswählen.',INVALID_DIRECTION:'Bitte die Fahrtrichtung erneut auswählen.'};throw Error(messages[body.code]||'Speichern fehlgeschlagen. Bitte erneut versuchen.');}
  $('report-dialog').close();toast('Testmeldung gespeichert · 60 Minuten sichtbar.');$('feed').hidden=false;submissionId=null;await fetchReports();
 }catch(error){$('form-error').textContent=error.message;}
 finally{button.disabled=false;button.textContent='Testmeldung speichern';}
});
$('search').addEventListener('input',()=>render(true));$('line').onchange=()=>render(true);
for(const button of document.querySelectorAll('[data-mode]'))button.onclick=()=>{kind=button.dataset.mode;for(const tab of document.querySelectorAll('[data-mode]'))tab.setAttribute('aria-pressed',String(tab===button));populateLines();render(true);};
$('reset').onclick=()=>{kind='';$('search').value='';$('explore').open=false;for(const tab of document.querySelectorAll('[data-mode]'))tab.setAttribute('aria-pressed',String(tab.dataset.mode===''));populateLines();$('line').value='';render(true);};
$('show-reports').onclick=()=>{$('feed').hidden=!$('feed').hidden;if(!$('feed').hidden)fetchReports();};$('close-feed').onclick=()=>$('feed').hidden=true;$('refresh').onclick=fetchReports;
$('open-report').onclick=()=>openReport();$('close-report').onclick=()=>$('report-dialog').close();$('info').onclick=()=>$('info-dialog').showModal();$('close-info').onclick=()=>$('info-dialog').close();
new ResizeObserver(()=>{map.invalidateSize();}).observe($('map'));
async function load(){
 $('open-report').disabled=true;
 try{
  const response=await fetch('./data/dortmund.json');if(!response.ok)throw Error('Daten fehlen');data=await response.json();if(!data.stations?.length||!data.lines?.length)throw Error('Daten leer');
  stops=new Map(data.stations.map(s=>[s.id,s]));stationLines=new Map();
  for(const line of data.lines)for(const id of line.stationIds){if(!stationLines.has(id))stationLines.set(id,new Set());stationLines.get(id).add(line.name);}
  stationLines=new Map([...stationLines].map(([id,names])=>[id,[...names].sort((a,b)=>a.localeCompare(b,'de',{numeric:true}))]));
  uniqueLines=[...new Map(data.lines.map(l=>[l.name,{name:l.name,type:l.type}])).values()].sort((a,b)=>a.name.localeCompare(b.name,'de',{numeric:true}));
  populateLines();$('source-date').textContent=data.sourceDate||'VRR-GTFS · Stand unbekannt';render(true);
  if(hosted)await fetchReports();else{$('connection').textContent='Nur Netzkarte';$('open-report').disabled=false;renderReports();}
 }catch{$('status').textContent='Fahrplandaten konnten nicht geladen werden. Bitte die Seite neu laden.';$('connection').textContent='Daten fehlen';}
}
setInterval(()=>{if(!document.hidden)fetchReports();},30000);setInterval(()=>{if(data)renderReports();},60000);
load();
