export const normalize=value=>String(value).toLocaleLowerCase('de').replace(/hauptbahnhof/g,'hbf').replace(/ß/g,'ss').normalize('NFD').replace(/[\u0300-\u036f\s-]/g,'');
export function distanceMetres(a,b){
 if(!a||!b||![a.lat,a.lng,b.lat,b.lng].every(Number.isFinite))return Infinity;
 const radians=Math.PI/180,dlat=(b.lat-a.lat)*radians,dlng=(b.lng-a.lng)*radians;
 const h=Math.sin(dlat/2)**2+Math.cos(a.lat*radians)*Math.cos(b.lat*radians)*Math.sin(dlng/2)**2;
 return 6371000*2*Math.atan2(Math.sqrt(Math.min(1,h)),Math.sqrt(Math.max(0,1-h)));
}
export function sameDirection(a,b,stops){if(a===b)return true;const x=stops.get(a),y=stops.get(b);return !!x&&!!y&&normalize(x.name)===normalize(y.name)&&distanceMetres(x,y)<=150;}
export function reportRelevant(report,{line='',directionId='',visibleStations,stops,showEnded=false}){
 if(!showEnded&&report.status==='resolved')return false;
 if(visibleStations&&!visibleStations.has(report.stationId))return false;
 if(line&&report.lineName&&report.lineName!==line)return false;
 if(directionId&&report.directionId&&!sameDirection(directionId,report.directionId,stops))return false;
 return true;
}
export function warningCandidates(reports,options){
 const {coords,now,lastRefresh,connected,mutedUntil=0,radius=600,stops}=options;
 if(!connected||!coords||now-lastRefresh>90000||coords.accuracy>200||mutedUntil>now)return [];
 return reports.filter(r=>r.status!=='resolved'&&r.expiresAt>now&&reportRelevant(r,options)&&distanceMetres(coords,stops.get(r.stationId))<=radius);
}
export const qualityLabel=status=>({confirmed:'Mehrfach gesehen',unconfirmed:'Einzelne Sichtung',disputed:'Widersprüchliche Rückmeldungen',resolved:'Als beendet gemeldet'}[status]||'Unbestätigt');
