const HOUR=3600000,UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json=(body,status=200,headers={})=>Response.json(body,{status,headers:{'Cache-Control':'no-store',...headers}});
async function hash(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');}
const cache=new WeakMap();
function networkIndex(network){
 if(cache.has(network))return cache.get(network);
 const stops=new Map(network.stations.map(s=>[s.id,s])),parents=new Map(network.stations.map(s=>[s.id,s.id]));
 function root(id){while(parents.get(id)!==id)id=parents.get(id);return id;}
 const names=new Map();for(const s of network.stations){const name=s.name?.trim().toLocaleLowerCase('de');if(!name)continue;const group=names.get(name)||[];group.push(s);names.set(name,group);}
 for(const group of names.values())for(let i=0;i<group.length;i++)for(let j=i+1;j<group.length;j++){
  const a=group[i],b=group[j];if(![a.lat,a.lng,b.lat,b.lng].every(Number.isFinite))continue;
  const dy=(a.lat-b.lat)*111320,dx=(a.lng-b.lng)*111320*Math.cos(a.lat*Math.PI/180);
  if(Math.hypot(dx,dy)<=150){const ar=root(a.id),br=root(b.id);parents.set(ar,[ar,br].sort()[0]);parents.set(br,[ar,br].sort()[0]);}
 }
 const index={stops,group:id=>root(id)};cache.set(network,index);return index;
}
async function votesFor(db,ids){if(!ids.length)return [];return (await db.prepare('SELECT report_id, actor_key, kind, updated_at, seen_at FROM report_votes WHERE report_id IN ('+ids.map(()=>'?').join(',')+')').bind(...ids).all()).results;}
function summarize(row,votes,actor,now){
 const opened=row.opened_at??row.created_at,cutoff=Math.max(opened,now-HOUR+1),relevant=votes.filter(v=>v.report_id===row.id&&v.updated_at>=opened);
 const ownerVote=relevant.find(v=>v.actor_key===row.actor_key),seen=new Map();
 if(row.created_at>=cutoff&&ownerVote?.kind!=='withdrawn')seen.set(row.actor_key,row.created_at);
 for(const vote of relevant)if(vote.kind!=='withdrawn'&&vote.seen_at>=cutoff)seen.set(vote.actor_key,Math.max(seen.get(vote.actor_key)||0,vote.seen_at));
 const lastSeenAt=Math.max(0,...seen.values()),clears=relevant.filter(v=>v.kind==='clear'&&v.updated_at>lastSeenAt&&v.updated_at>now-HOUR);
 const status=!lastSeenAt?'expired':clears.length>=2?'resolved':clears.length?'disputed':seen.size>=2?'confirmed':'unconfirmed';
 const ownVote=relevant.find(v=>v.actor_key===actor),confirmed=[...seen].filter(([key])=>key!==row.actor_key).map(([,at])=>at);
 return {id:row.id,stationId:row.station_id,lineName:row.line_name,directionId:row.direction_id,createdAt:row.created_at,
 lastSeenAt,lastConfirmedAt:confirmed.length?Math.max(...confirmed):null,expiresAt:lastSeenAt+HOUR,status,seenBy:seen.size,
 confirmations:Math.max(0,seen.size-1),clearBy:clears.length,uncertainBy:relevant.filter(v=>v.kind==='unsure'&&v.updated_at>now-HOUR).length,
 own:seen.has(actor),myFeedback:ownVote?.kind??(actor===row.actor_key?'seen':null)};
}
async function readBody(request){if(!request.headers.get('content-type')?.includes('application/json'))return null;if(Number(request.headers.get('content-length')||0)>2048)return null;const raw=await request.text();if(raw.length>2048)return null;try{const body=JSON.parse(raw);return body&&typeof body==='object'&&!Array.isArray(body)?body:null;}catch{return null;}}
export async function handleReports(request,env,network,{userId,now=Date.now()}={}){
 if(!userId)return json({code:'AUTH_REQUIRED'},401);if(!env.DB)return json({code:'STORAGE_UNAVAILABLE'},503);
 const db=env.DB,url=new URL(request.url),path=url.pathname.replace(/\/$/,''),match=path.match(/^\/api\/reports(?:\/([0-9a-f-]+)(?:\/(feedback))?)?$/i);
 if(!match||(match[1]&&!UUID.test(match[1])))return json({code:'NOT_FOUND'},404);
 const id=match[1]||null,isFeedback=!!match[2],actor=await hash('dortmund-reports:'+userId),index=networkIndex(network);
 try{
  if(request.method==='GET'&&!id){
   const rows=(await db.prepare('SELECT * FROM reports WHERE COALESCE(updated_at,created_at) > ? ORDER BY COALESCE(updated_at,created_at) DESC LIMIT 200').bind(now-HOUR).all()).results;
   const votes=await votesFor(db,rows.map(r=>r.id)),reports=rows.map(r=>summarize(r,votes,actor,now)).filter(r=>r.status!=='expired').sort((a,b)=>b.lastSeenAt-a.lastSeenAt);
   return json({reports,serverTime:now,lifetimeMinutes:60});
  }
  if(!['POST','DELETE'].includes(request.method))return json({code:'METHOD_NOT_ALLOWED'},405);
  if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin)return json({code:'ORIGIN_MISMATCH'},403);
  if(request.method==='DELETE'&&id&&!isFeedback){
   const row=await db.prepare('SELECT * FROM reports WHERE id = ?').bind(id).first();if(!row)return json({code:'NOT_FOUND'},404);
   const state=summarize(row,await votesFor(db,[id]),actor,now);if(!state.own)return json({code:'NOT_FOUND'},404);
   await db.prepare("INSERT INTO report_votes(report_id,actor_key,kind,updated_at,seen_at) VALUES(?,?,'withdrawn',?,NULL) ON CONFLICT(report_id,actor_key) DO UPDATE SET kind='withdrawn',updated_at=excluded.updated_at,seen_at=NULL").bind(id,actor,now).run();
   return json({deleted:true});
  }
  if(request.method!=='POST'||(id&&!isFeedback))return json({code:'METHOD_NOT_ALLOWED'},405);
  const body=await readBody(request);if(!body||!UUID.test(body.id||''))return json({code:'INVALID_BODY'},400);
  const action=isFeedback?body.kind:'sighting';if(isFeedback&&!['seen','clear','unsure'].includes(action))return json({code:'INVALID_FEEDBACK'},400);
  const bodyKey=await hash(JSON.stringify({path,body}));
  const prior=await db.prepare('SELECT * FROM report_actions WHERE id = ?').bind(body.id).first();
  if(prior)return prior.actor_key===actor&&prior.body_key===bodyKey?json({id:prior.report_id,duplicate:true}):json({code:'ID_CONFLICT'},409);
  let row=null,groupKey=null,stationId,lineName,directionId,reopen=false;
  if(isFeedback){
   row=await db.prepare('SELECT * FROM reports WHERE id = ?').bind(id).first();if(!row)return json({code:'NOT_FOUND'},404);
   const state=summarize(row,await votesFor(db,[id]),actor,now);
   if(state.expiresAt<=now||state.status==='expired')return json({code:'REPORT_EXPIRED'},410);
   if(state.status==='resolved'&&action!=='seen')return json({code:'REPORT_CLOSED'},409);
   reopen=state.status==='resolved';
  }else{
   stationId=body.stationId;lineName=body.lineName??null;directionId=body.directionId??null;
   if(!index.stops.has(stationId))return json({code:'INVALID_STATION'},400);
   const patterns=network.lines.filter(l=>l.name===lineName&&l.stationIds.includes(stationId));
   if(lineName!==null&&!patterns.length)return json({code:'INVALID_LINE'},400);
   if(directionId!==null&&(!patterns.length||directionId===stationId||!patterns.some(l=>l.stationIds[0]===directionId||l.stationIds.at(-1)===directionId)))return json({code:'INVALID_DIRECTION'},400);
   groupKey=await hash(JSON.stringify([index.group(stationId),lineName,directionId?index.group(directionId):null]));
   row=await db.prepare('SELECT * FROM reports WHERE group_key = ?').bind(groupKey).first();
   if(!row){
    const legacy=(await db.prepare('SELECT * FROM reports WHERE group_key IS NULL AND COALESCE(updated_at,created_at) > ?').bind(now-HOUR).all()).results;
    row=legacy.find(r=>index.group(r.station_id)===index.group(stationId)&&r.line_name===lineName&&(r.direction_id?index.group(r.direction_id):null)===(directionId?index.group(directionId):null))||null;
   }
   if(row){const state=summarize(row,await votesFor(db,[row.id]),actor,now);reopen=state.status==='resolved'||state.status==='expired'||state.expiresAt<=now;}
  }
  const reportId=row?.id||crypto.randomUUID(),cooldown=isFeedback?10000:60000;
  const actionInsert=db.prepare('INSERT INTO report_actions(id,report_id,actor_key,kind,created_at,body_key) SELECT ?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM report_actions WHERE actor_key = ? AND created_at > ?)').bind(body.id,isFeedback?reportId:null,actor,action,now,bodyKey,actor,now-cooldown);
  const statements=[actionInsert];
  if(!isFeedback){
   if(row&&!row.group_key)statements.push(db.prepare('UPDATE reports SET group_key = ? WHERE id = ? AND group_key IS NULL AND NOT EXISTS(SELECT 1 FROM reports WHERE group_key = ?) AND EXISTS(SELECT 1 FROM report_actions WHERE id = ?)').bind(groupKey,row.id,groupKey,body.id));
   statements.push(db.prepare('INSERT INTO reports(id,station_id,line_name,direction_id,created_at,actor_key,group_key,updated_at,opened_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM report_actions WHERE id = ?) ON CONFLICT(group_key) DO UPDATE SET updated_at=excluded.updated_at,created_at=CASE WHEN ? THEN excluded.created_at ELSE reports.created_at END,opened_at=CASE WHEN ? THEN excluded.opened_at ELSE reports.opened_at END,actor_key=CASE WHEN ? THEN excluded.actor_key ELSE reports.actor_key END').bind(reportId,stationId,lineName,directionId,now,actor,groupKey,now,now,body.id,reopen?1:0,reopen?1:0,reopen?1:0));
   statements.push(db.prepare('UPDATE report_actions SET report_id = (SELECT id FROM reports WHERE group_key = ?) WHERE id = ?').bind(groupKey,body.id));
  }else if(action==='seen'){
   statements.push(db.prepare('UPDATE reports SET updated_at = ?,created_at = CASE WHEN ? THEN ? ELSE created_at END,opened_at = CASE WHEN ? THEN ? ELSE opened_at END,actor_key = CASE WHEN ? THEN ? ELSE actor_key END WHERE id = ? AND EXISTS(SELECT 1 FROM report_actions WHERE id = ?)').bind(now,reopen?1:0,now,reopen?1:0,now,reopen?1:0,actor,reportId,body.id));
  }
  statements.push(db.prepare('INSERT INTO report_votes(report_id,actor_key,kind,updated_at,seen_at) SELECT report_id,?,?,?,? FROM report_actions WHERE id = ? ON CONFLICT(report_id,actor_key) DO UPDATE SET kind=excluded.kind,updated_at=excluded.updated_at,seen_at=CASE WHEN excluded.kind = \'seen\' THEN excluded.seen_at ELSE report_votes.seen_at END').bind(actor,isFeedback?action:'seen',now,!isFeedback||action==='seen'?now:null,body.id));
  const results=await db.batch(statements);
  if(!results[0].meta.changes)return json({code:'COOLDOWN',retryAfterSeconds:cooldown/1000},429,{'Retry-After':String(cooldown/1000)});
  const saved=await db.prepare('SELECT report_id FROM report_actions WHERE id = ?').bind(body.id).first();
  const merged=!isFeedback&&!reopen&&(!!row||saved.report_id!==reportId);
  return json({id:saved.report_id,merged,reopened:reopen},isFeedback||merged||reopen?200:201);
 }catch(error){console.error('Report storage request failed',error instanceof Error?error.message:'unknown');return json({code:'STORAGE_UNAVAILABLE'},503);}
}
