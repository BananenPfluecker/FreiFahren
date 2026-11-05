'use strict';
import { normalize, distanceMetres, sameDirection, reportRelevant, warningCandidates, qualityLabel } from './map-logic.mjs';
const $=id=>document.getElementById(id);
const map=L.map('map',{preferCanvas:true,zoomControl:false}).setView([51.5136,7.4653],12);
L.control.zoom({position:'bottomright'}).addTo(map);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
const networkLayer=L.layerGroup().addTo(map), reportLayer=L.layerGroup().addTo(map);
let data,stops,stationLines,uniqueLines,visibleStations=new Set(),markers=new Map(),kind='',reports=[],apiReady=false,formStation=null,submissionId=null,loadingReports=false,toastTimer,clockOffset=0;
let lastRefresh=0,coords=null,locationWatch=null,locationMarker=null,accuracyCircle=null,mutedUntil=0,audio=null;
const alerted=new Map();
let prefs={theme:'dark',warnEnabled:false,radius:600,sound:false,vibration:false};
try{Object.assign(prefs,JSON.parse(localStorage.getItem('dortmund-preferences')||'{}'));}catch{}
const hosted=new URLSearchParams(location.search).get('reports')==='1';
async function apiFetch(url,options={}){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{return await fetch(url,{...options,signal:controller.signal});}catch{throw Error('Verbindung unterbrochen. Bitte erneut versuchen.');}finally{clearTimeout(timer);}}
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
 updateTripDirections();
}
function selectLine(name){$('search').value='';$('line').value=name;$('explore').open=false;updateTripDirections();render(true);}
function stationPopup(station){
 const box=element('div');box.append(element('strong',station.name));
 for(const name of stationLines.get(station.id)||[])box.append(badge(name),' ');
 const button=element('button',hosted?'Hier Kontrolle melden':'Private Test-App Ã¶ffnen','primary');
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
 const selectedLine=chosen?visible.find(l=>l.name===chosen):null;
 const selectedStationIds=new Set(selectedLine?.stationIds||[]);
 const selectedColor=selectedLine&&/^#[0-9a-f]{6}$/i.test(selectedLine.color)&&!['#000000','#ffffff'].includes(selectedLine.color.toLowerCase())?selectedLine.color:'#65d6c3';
 for(const line of visible){
  const points=line.stationIds.map(id=>stops.get(id)).filter(Boolean);points.forEach(s=>visibleStations.add(s.id));
  const geometry=Array.isArray(line.geometry)&&line.geometry.length;
  const color=/^#[0-9a-f]{6}$/i.test(line.color)&&!['#000000','#ffffff'].includes(line.color.toLowerCase())?line.color:'#9de6c5';
  if(points.length>1){
   const box=element('div');box.append(element('strong','Linie '+line.name),element('p',geometry?'Verlauf aus GTFS-Streckenkoordinaten':'Schematisch Â· Streckenkoordinaten fehlen'));
   const button=element('button','Nur diese Linie anzeigen');button.addEventListener('click',()=>selectLine(line.name));box.append(button);
   const highlighted=Boolean(selectedLine&&line.name===selectedLine.name);
   L.polyline(geometry?line.geometry:points.map(s=>[s.lat,s.lng]),{color:highlighted?selectedColor:color,weight:highlighted?7:(chosen?3:2),opacity:highlighted?1:(chosen?.35:.28),dashArray:geometry?null:'6 8',lineCap:'round'}).bindPopup(box).addTo(networkLayer);
  }
 }
 const bounds=[];
 for(const id of visibleStations){const station=stops.get(id),highlighted=selectedStationIds.has(id);bounds.push([station.lat,station.lng]);const marker=L.circleMarker([station.lat,station.lng],{radius:highlighted?8:(chosen?5:3),weight:highlighted?3:1,color:highlighted?selectedColor:'#b9d1df',fillColor:highlighted?selectedColor:'#183148',fillOpacity:highlighted?1:.95}).bindPopup(()=>stationPopup(station)).addTo(networkLayer);markers.set(id,marker);}
 const matches=q&&!exact?[...visibleStations].map(id=>stops.get(id)).filter(s=>normalize(s.name).includes(q)):[];
 $('results').replaceChildren();
 if(q){
  const matchingLines=[...new Set(visible.filter(l=>normalize(l.name).includes(q)).map(l=>l.name))];
  for(const name of matchingLines.slice(0,8)){const button=element('button',undefined,'result');button.append(badge(name),element('span','Linie anzeigen'));button.onclick=()=>selectLine(name);$('results').append(button);}
  for(const station of matches.slice(0,20)){const button=element('button',station.name,'result');button.append(element('small',(stationLines.get(station.id)||[]).join(' Â· ')));button.onclick=()=>goStation(station);$('results').append(button);}
  if(!visible.length)$('results').append(element('p','Keine Treffer. Suche oder Filter Ã¤ndern.','muted'));
  if(matches.length>20)$('results').append(element('p',matches.length+' Haltestellen gefunden. Suche eingrenzen.','muted'));
 }
 const names=[...new Set(visible.map(l=>l.name))].sort((a,b)=>a.localeCompare(b,'de',{numeric:true}));
 $('line-list').replaceChildren();for(const name of names){const button=element('button',name,'badge'+(chosen===name?' active':''));button.setAttribute('aria-label','Linie '+name+' anzeigen');button.onclick=()=>selectLine(name);$('line-list').append(button);}
 $('line-count').textContent=names.length;
 $('status').textContent=names.length+(names.length===1?' Linie Â· ':' Linien Â· ')+visibleStations.size+' Haltestellen';
 $('geometry-status').textContent=(data.geometryVariants||0)+' von '+data.lines.length+' Varianten enthalten Streckenkoordinaten. Die Ã¼brigen sind schematisch dargestellt.';
 if(move)fit(matches.length?matches.map(s=>[s.lat,s.lng]):bounds,q||chosen?14:12);
 renderReports();
}
function formatAge(created){const minutes=Math.max(0,Math.floor((Date.now()+clockOffset-created)/60000));return minutes<1?'Gerade eben':'vor '+minutes+' Min.';}
function filteredReports(){return reports.filter(r=>r.expiresAt>Date.now()+clockOffset&&reportRelevant(r,{line:$('line').value,directionId:$('trip-direction').value,visibleStations,stops,showEnded:$('show-ended').checked}));}
function renderReports(){
 if(!data)return;
 const active=filteredReports();reportLayer.clearLayers();$('feed-items').replaceChildren();
 $('reports-count').textContent=!apiReady&&!lastRefresh?'Meldungen':(apiReady?'':'Archiv Â· ')+active.filter(r=>r.status!=='resolved').length+' Meldung'+(active.filter(r=>r.status!=='resolved').length===1?'':'en');
 $('freshness-status').textContent=!hosted?'Nur Netzkarte.':lastRefresh?'Zuletzt geladen: '+formatAge(lastRefresh)+(apiReady?'':' Â· Nicht verbunden, gespeicherter Stand'):'Noch keine Meldungen geladen.';
 if(!apiReady){const box=element('div',undefined,'empty-state');box.append(element('strong',hosted?'Keine aktuelle Verbindung':'Meldungen in der privaten App'),element('p',hosted?'Gespeicherte Meldungen kÃ¶nnen veraltet sein. Umkreishinweise sind angehalten. Bitte aktualisieren.':'Die GitHub-Karte zeigt das Netz. Zum Melden die private App Ã¶ffnen.'));if(!hosted){const link=element('a','Private App Ã¶ffnen');link.href='https://freifahren-dortmund-pruefung.bravehost.chatgpt.site';link.target='_blank';link.rel='noopener';box.append(link);}$('feed-items').append(box);}
 if(!active.length&&apiReady){const box=element('div',undefined,'empty-state');box.append(element('strong','Keine passenden Meldungen'),element('p','FÃ¼r diese Auswahl liegen keine aktuellen Testmeldungen vor. Das ist keine Entwarnung.'));$('feed-items').append(box);}
 for(const report of active){
  const station=stops.get(report.stationId);if(!station)continue;
  const card=element('article',undefined,'report-card '+report.status);card.append(badge(report.lineName),element('span',qualityLabel(report.status),'quality '+report.status),element('strong',station.name));
  card.append(element('p',report.directionId?'Richtung '+(stops.get(report.directionId)?.name||'unbekannt'):'Fahrtrichtung unbekannt'));
  card.append(element('p','Zuletzt gesehen: '+formatAge(report.lastSeenAt),'last-seen'));
  card.append(element('p',(report.seenBy===1?'Eine sichtende Anmeldung':report.seenBy+' sichtende Anmeldungen')+(report.clearBy?' Â· '+report.clearBy+' Ã nicht mehr vorhanden':'')));
  if(report.lastConfirmedAt)card.append(element('p','Weitere BestÃ¤tigung: '+formatAge(report.lastConfirmedAt)));
  if(report.uncertainBy)card.append(element('p',report.uncertainBy+' Ã unsicher (ohne Auswirkung auf die Laufzeit)'));
  if(coords)card.append(element('p',Math.round(distanceMetres(coords,station))+' m Luftlinie entfernt'));
  const actions=element('div',undefined,'feedback-actions');
  for(const [kind,label] of [['seen','Noch da'],['clear','Nicht mehr da'],['unsure','Unsicher']]){
   if(report.status==='resolved'&&kind!=='seen')continue;
   const button=element('button',label);button.disabled=!apiReady;button.setAttribute('aria-pressed',String(report.myFeedback===kind));button.onclick=()=>sendFeedback(report,kind,button);actions.append(button);
  }
  card.append(actions);
  const footer=element('footer');footer.append(element('span','Erste Meldung: '+formatAge(report.createdAt)));
  if(report.own){const button=element('button','Meine Sichtung zurÃ¼ckziehen');button.disabled=!apiReady;button.onclick=()=>deleteReport(report.id,button);footer.append(button);}
  card.append(footer);$('feed-items').append(card);
  const popup=element('div');popup.append(element('strong',station.name),element('p',(report.lineName?'Linie '+report.lineName+' Â· ':'')+qualityLabel(report.status)),element('p','Zuletzt gesehen '+formatAge(report.lastSeenAt)));
  const button=element('button','Meldung bewerten');button.onclick=()=>{$('feed').hidden=false;card.scrollIntoView({block:'nearest'});};popup.append(button);
  const color=report.status==='resolved'?'#92a5a5':report.status==='disputed'?'#ffc36a':'#ff665f';
  L.circleMarker([station.lat,station.lng],{radius:11,weight:2,color,fillColor:color,fillOpacity:.8}).bindPopup(popup).addTo(reportLayer);
 }
 updateWarningState();checkWarnings();
}
async function fetchReports(){
 if(!hosted||loadingReports)return;loadingReports=true;
 try{
  const response=await apiFetch('/api/reports',{cache:'no-store'});if(!response.ok)throw Error('API');const body=await response.json();if(!Array.isArray(body.reports))throw Error('Invalid response');reports=body.reports;clockOffset=body.serverTime-Date.now();lastRefresh=body.serverTime;apiReady=true;$('connection').textContent='Verbunden';
 }catch{apiReady=false;$('connection').textContent='Nicht verbunden';}
 finally{loadingReports=false;$('open-report').disabled=!apiReady||!data;renderReports();}
}
async function sendFeedback(report,kind,button){
 const requestId=button.dataset.requestId||crypto.randomUUID();button.dataset.requestId=requestId;button.disabled=true;
 try{const response=await apiFetch('/api/reports/'+report.id+'/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:requestId,kind})});if(!response.ok){const body=await response.json().catch(()=>({}));throw Error(body.code==='COOLDOWN'?'Bitte 10 Sekunden zwischen RÃ¼ckmeldungen warten.':body.code==='REPORT_EXPIRED'?'Diese Meldung ist inzwischen abgelaufen. Bitte aktualisieren.':'RÃ¼ckmeldung konnte nicht gespeichert werden.');}toast(kind==='unsure'?'Unsicherheit vermerkt Â· Laufzeit bleibt unverÃ¤ndert.':'RÃ¼ckmeldung gespeichert.');await fetchReports();}catch(error){button.disabled=false;toast(error.message);}
}
async function deleteReport(id,button){button.disabled=true;try{const response=await apiFetch('/api/reports/'+id,{method:'DELETE'});if(!response.ok)throw Error();toast('Deine Sichtung wurde zurÃ¼ckgezogen. Andere Sichtungen bleiben erhalten.');await fetchReports();}catch{button.disabled=false;toast('ZurÃ¼ckziehen fehlgeschlagen. Bitte erneut versuchen.');}}
function updateTripDirections(){
 const prior=$('trip-direction').value;$('trip-direction').replaceChildren(new Option('Alle Fahrtrichtungen',''));const line=$('line').value;$('trip-direction').hidden=!line;
 if(line){const endpoints=new Map();for(const id of new Set(linePatterns(line).flatMap(l=>[l.stationIds[0],l.stationIds.at(-1)]))){const s=stops.get(id);if(s&&!endpoints.has(normalize(s.name)))endpoints.set(normalize(s.name),s);}for(const s of endpoints.values())$('trip-direction').add(new Option('Richtung '+s.name,s.id));}
 if([...$('trip-direction').options].some(o=>o.value===prior))$('trip-direction').value=prior;
}
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
function chooseFormStation(id){formStation=id;$('station-query').value=stops.get(id).name;$('station-options').replaceChildren();$('chosen-station').textContent='AusgewÃ¤hlt: '+stops.get(id).name;$('chosen-station').hidden=false;updateFormLines();if(stationLines.get(id)?.includes($('line').value)){$('report-line').value=$('line').value;updateDirections();if([...$('direction').options].some(o=>o.value===$('trip-direction').value))$('direction').value=$('trip-direction').value;}submissionId=null;}
function openReport(stationId){
 if(!data)return;
 if(!hosted){window.open('https://freifahren-dortmund-pruefung.bravehost.chatgpt.site','_blank','noopener');return;}
 if(!apiReady){toast('Meldungen sind gerade nicht erreichbar. Bitte aktualisieren.');return;}
 $('report-form').reset();$('form-error').textContent='';$('station-options').replaceChildren();$('chosen-station').hidden=true;formStation=null;submissionId=null;updateFormLines();
 if(stationId)chooseFormStation(stationId);
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
 if(!formStation){$('form-error').textContent='Bitte eine Haltestelle aus den Suchtreffern auswÃ¤hlen.';$('station-query').focus();return;}
 const button=$('submit-report');button.disabled=true;button.textContent='Speichere â¦';submissionId ||= crypto.randomUUID();
 try{
  const response=await apiFetch('/api/reports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:submissionId,stationId:formStation,lineName:$('report-line').value||null,directionId:$('direction').value||null})});
  if(!response.ok){const body=await response.json().catch(()=>({}));const messages={COOLDOWN:'Bitte warte eine Minute zwischen zwei Meldungen.',AUTH_REQUIRED:'Bitte melde dich erneut in der privaten App an.',INVALID_LINE:'Diese Linie hÃ¤lt nicht an der gewÃ¤hlten Haltestelle.',INVALID_STATION:'Bitte eine gÃ¼ltige Haltestelle auswÃ¤hlen.',INVALID_DIRECTION:'Bitte die Fahrtrichtung erneut auswÃ¤hlen.'};throw Error(messages[body.code]||'Speichern fehlgeschlagen. Bitte erneut versuchen.');}
  const saved=await response.json();$('report-dialog').close();toast(saved.merged?'Sichtung mit vorhandener Meldung zusammengefÃ¼hrt.':'Testmeldung gespeichert Â· 60 Minuten ab letzter Sichtung.');$('feed').hidden=false;submissionId=null;await fetchReports();
 }catch(error){$('form-error').textContent=error.message;}
 finally{button.disabled=false;button.textContent='Testmeldung speichern';}
});
$('search').addEventListener('input',()=>render(true));$('line').onchange=()=>{updateTripDirections();render(true);};$('trip-direction').onchange=()=>renderReports();$('show-ended').onchange=renderReports;
for(const button of document.querySelectorAll('[data-mode]'))button.onclick=()=>{kind=button.dataset.mode;for(const tab of document.querySelectorAll('[data-mode]'))tab.setAttribute('aria-pressed',String(tab===button));populateLines();render(true);};
$('reset').onclick=()=>{kind='';$('search').value='';$('explore').open=false;for(const tab of document.querySelectorAll('[data-mode]'))tab.setAttribute('aria-pressed',String(tab.dataset.mode===''));populateLines();$('line').value='';updateTripDirections();render(true);};
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
  populateLines();$('source-date').textContent=data.sourceDate||'VRR-GTFS Â· Stand unbekannt';render(true);
  if(hosted)await fetchReports();else{$('connection').textContent='Nur Netzkarte';$('open-report').disabled=false;renderReports();}
 }catch{$('status').textContent='Fahrplandaten konnten nicht geladen werden. Bitte die Seite neu laden.';$('connection').textContent='Daten fehlen';}
}
setInterval(()=>{if(!document.hidden)fetchReports();},30000);setInterval(()=>{if(data)renderReports();},10000);
function savePrefs(){prefs.mutedUntil=mutedUntil;try{localStorage.setItem('dortmund-preferences',JSON.stringify(prefs));}catch{}}
function applyTheme(){document.body.classList.toggle('theme-light',prefs.theme==='light'||(prefs.theme==='auto'&&matchMedia('(prefers-color-scheme:light)').matches));}
function updateWarningState(){
 const now=Date.now()+clockOffset;
 let text=!prefs.warnEnabled?'Umkreishinweise sind ausgeschaltet.':mutedUntil>now?'Stumm fÃ¼r noch '+Math.ceil((mutedUntil-now)/60000)+' Min.':!coords?'FÃ¼r Umkreishinweise zuerst Standort aktivieren.':coords.accuracy>200?'Standort zu ungenau. Hinweise angehalten.':!apiReady||now-lastRefresh>90000?'Daten nicht aktuell. Hinweise angehalten.':'Hinweise aktiv Â· '+prefs.radius+' m Â· nur in der sichtbaren App.';
 if(prefs.warnEnabled&&prefs.sound&&audio?.state!=='running')text+=' Ton nach dem Ãffnen einmal Ã¼ber âTon testenâ freigeben.';
 $('warning-state').textContent=text;$('mute').textContent=mutedUntil>now?'Stummschaltung beenden ('+Math.ceil((mutedUntil-now)/60000)+' Min.)':'FÃ¼r 5 Minuten stumm';
}
async function prepareAudio(){
 const Context=window.AudioContext||window.webkitAudioContext;if(!Context){toast('Hinweiston wird hier nicht unterstÃ¼tzt.');return false;}
 audio ||= new Context();try{await audio.resume();return audio.state==='running';}catch{return false;}
}
function playTone(){
 if(audio?.state!=='running')return;const oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.connect(gain);gain.connect(audio.destination);oscillator.frequency.value=660;gain.gain.setValueAtTime(.001,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.08,audio.currentTime+.03);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.35);oscillator.start();oscillator.stop(audio.currentTime+.36);
}
function checkWarnings(){
 if(!data||!prefs.warnEnabled||document.hidden)return;
 const now=Date.now()+clockOffset,candidates=warningCandidates(reports,{coords,now,lastRefresh,connected:apiReady,mutedUntil,radius:Number(prefs.radius),line:$('line').value,directionId:$('trip-direction').value,visibleStations,stops});
 const fresh=candidates.filter(r=>{const prior=alerted.get(r.id);return !prior||(r.lastSeenAt>prior.lastSeenAt&&now-prior.at>=900000);});if(!fresh.length)return;
 fresh.forEach(r=>alerted.set(r.id,{at:now,lastSeenAt:r.lastSeenAt}));const report=fresh.sort((a,b)=>distanceMetres(coords,stops.get(a.stationId))-distanceMetres(coords,stops.get(b.stationId)))[0],station=stops.get(report.stationId);
 $('nearby-title').textContent=fresh.length>1?fresh.length+' Meldungen im Umkreis':'Testmeldung im Umkreis';
 const message=(report.lineName?'Linie '+report.lineName+' Â· ':'Linie unbekannt Â· ')+station.name+' Â· ca. '+Math.round(distanceMetres(coords,station))+' m Luftlinie Â· '+qualityLabel(report.status);
 $('nearby-text').textContent=message;$('nearby-hint').hidden=false;
 if(prefs.sound)playTone();if(prefs.vibration&&navigator.vibrate)navigator.vibrate([150,80,150]);
 if(prefs.notifications&&'Notification' in window&&Notification.permission==='granted'){try{new Notification('FahrtRadar Â· Testmeldung im Umkreis',{body:message,tag:'dortmund-'+report.id});}catch{}}
}
function stopLocation(){
 if(locationWatch!==null)navigator.geolocation?.clearWatch(locationWatch);locationWatch=null;coords=null;
 if(locationMarker){map.removeLayer(locationMarker);locationMarker=null;}if(accuracyCircle){map.removeLayer(accuracyCircle);accuracyCircle=null;}
 $('stop-location').disabled=true;$('locate').disabled=false;$('location-status').textContent='Standort ist ausgeschaltet.';$('nearby-hint').hidden=true;if(data)renderReports();
}
function locate(){
 if(!navigator.geolocation){$('location-status').textContent='Standort wird von diesem Browser nicht unterstÃ¼tzt.';return;}
 $('location-status').textContent='Warte auf Standortfreigabe â¦';$('locate').disabled=true;let first=true;
 locationWatch=navigator.geolocation.watchPosition(position=>{
  coords={lat:position.coords.latitude,lng:position.coords.longitude,accuracy:position.coords.accuracy};
  if(!locationMarker)locationMarker=L.circleMarker([coords.lat,coords.lng],{radius:7,fillColor:'#75b9ff',color:'#e1f1ff',weight:3,fillOpacity:1}).bindPopup('Dein Standort Â· nicht im Meldespeicher abgelegt').addTo(map);else locationMarker.setLatLng([coords.lat,coords.lng]);
  if(accuracyCircle)map.removeLayer(accuracyCircle);accuracyCircle=L.circle([coords.lat,coords.lng],{radius:Math.min(coords.accuracy,2000),color:'#75b9ff',weight:1,fillOpacity:.05}).addTo(map);
  $('stop-location').disabled=false;$('location-status').textContent='Standort aktiv Â· Genauigkeit ca. '+Math.round(coords.accuracy)+' m.';
  if(first){fit([[coords.lat,coords.lng]],15);first=false;}if(data)renderReports();
 },error=>{stopLocation();$('location-status').textContent=error.code===1?'Standort nicht freigegeben. Die App funktioniert auch ohne Standort.':'Standort gerade nicht verfÃ¼gbar. Bitte erneut versuchen.';},{enableHighAccuracy:true,maximumAge:15000,timeout:15000});
}
function notificationStatus(){
 const supported='Notification' in window;
 $('notification-status').textContent=!supported?'Systemhinweise werden hier nicht unterstÃ¼tzt.':Notification.permission==='denied'?'Im Browser gesperrt. Bei Bedarf in den Website-Einstellungen Ã¤ndern.':prefs.notifications&&Notification.permission==='granted'?'Systemhinweise eingeschaltet.':'Systemhinweise ausgeschaltet.';
 $('enable-notifications').disabled=!supported||Notification.permission==='denied';$('enable-notifications').textContent=prefs.notifications?'Systemhinweise ausschalten':'Systemhinweise erlauben';
}
prefs.theme=['dark','light','auto'].includes(prefs.theme)?prefs.theme:'dark';prefs.radius=[300,600,1000].includes(Number(prefs.radius))?Number(prefs.radius):600;mutedUntil=Number(prefs.mutedUntil)||0;
$('map-theme').value=prefs.theme;$('warn-radius').value=String(prefs.radius);$('warn-enabled').checked=!!prefs.warnEnabled;$('sound-enabled').checked=!!prefs.sound;$('vibration-enabled').checked=!!prefs.vibration;$('vibration-enabled').disabled=!('vibrate' in navigator);
$('map-theme').onchange=()=>{prefs.theme=$('map-theme').value;savePrefs();applyTheme();};matchMedia('(prefers-color-scheme:light)').addEventListener('change',applyTheme);
$('warn-enabled').onchange=()=>{prefs.warnEnabled=$('warn-enabled').checked;savePrefs();updateWarningState();checkWarnings();};$('warn-radius').onchange=()=>{prefs.radius=Number($('warn-radius').value);savePrefs();updateWarningState();checkWarnings();};
$('sound-enabled').onchange=async()=>{prefs.sound=$('sound-enabled').checked;if(prefs.sound)await prepareAudio();savePrefs();updateWarningState();};$('test-sound').onclick=async()=>{if(await prepareAudio())playTone();updateWarningState();};
$('vibration-enabled').onchange=()=>{prefs.vibration=$('vibration-enabled').checked;savePrefs();};
$('enable-notifications').onclick=async()=>{if(prefs.notifications){prefs.notifications=false;}else if('Notification' in window){try{prefs.notifications=(await Notification.requestPermission())==='granted';}catch{prefs.notifications=false;}}savePrefs();notificationStatus();};
$('mute').onclick=()=>{mutedUntil=mutedUntil>Date.now()+clockOffset?0:Date.now()+clockOffset+300000;savePrefs();updateWarningState();};
$('locate').onclick=locate;$('stop-location').onclick=stopLocation;
$('settings').onclick=()=>{updateWarningState();notificationStatus();$('settings-dialog').showModal();};$('close-settings').onclick=()=>$('settings-dialog').close();
$('nearby-open').onclick=()=>{$('feed').hidden=false;$('nearby-hint').hidden=true;};$('nearby-dismiss').onclick=()=>$('nearby-hint').hidden=true;
window.addEventListener('online',fetchReports);window.addEventListener('offline',()=>{apiReady=false;$('connection').textContent='Offline';$('open-report').disabled=true;renderReports();});document.addEventListener('visibilitychange',()=>{if(!document.hidden)fetchReports();});
applyTheme();notificationStatus();updateWarningState();load();
