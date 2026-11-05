const HOUR = 60*60*1000, COOLDOWN = 60*1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function json(body,status=200,extra={}) {return Response.json(body,{status,headers:{'Cache-Control':'no-store',...extra}});}
export async function handleReports(request,env,network,{userId,now=Date.now()}={}) {
 if(!userId) return json({code:'AUTH_REQUIRED'},401);
 if(!env.DB) return json({code:'STORAGE_UNAVAILABLE'},503);
 const url = new URL(request.url), path = url.pathname.replace(/\/$/,'');
 const id = path.startsWith('/api/reports/') ? path.slice('/api/reports/'.length) : null;
 if(path!=='/api/reports' && (!id || !UUID.test(id))) return json({code:'NOT_FOUND'},404);
 const stations = new Map(network.stations.map(s=>[s.id,s]));
 const actorBytes = await crypto.subtle.digest('SHA-256',new TextEncoder().encode('dortmund-reports:'+userId));
 const actor = [...new Uint8Array(actorBytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
 try {
  if(request.method==='GET' && !id) {
   const result = await env.DB.prepare('SELECT id, station_id, line_name, direction_id, created_at, actor_key FROM reports WHERE created_at > ? ORDER BY created_at DESC LIMIT 100').bind(now-HOUR).all();
   return json({reports:result.results.map(row=>({id:row.id,stationId:row.station_id,lineName:row.line_name,directionId:row.direction_id,createdAt:row.created_at,expiresAt:row.created_at+HOUR,own:row.actor_key===actor})),serverTime:now,lifetimeMinutes:60});
  }
  if(!['POST','DELETE'].includes(request.method)) return json({code:'METHOD_NOT_ALLOWED'},405);
  if(request.headers.get('origin') && request.headers.get('origin')!==url.origin) return json({code:'ORIGIN_MISMATCH'},403);
  if(request.method==='DELETE' && id) {
   const result = await env.DB.prepare('DELETE FROM reports WHERE id = ? AND actor_key = ?').bind(id,actor).run();
   return result.meta.changes ? json({deleted:true}) : json({code:'NOT_FOUND'},404);
  }
  if(request.method!=='POST' || id) return json({code:'METHOD_NOT_ALLOWED'},405);
  if(!request.headers.get('content-type')?.includes('application/json')) return json({code:'INVALID_BODY'},415);
  if(Number(request.headers.get('content-length')||0)>2048) return json({code:'INVALID_BODY'},413);
  const raw = await request.text();
  if(raw.length>2048) return json({code:'INVALID_BODY'},413);
  let body;
  try {body=JSON.parse(raw);} catch {return json({code:'INVALID_BODY'},400);}
  if(!body || typeof body!=='object' || Array.isArray(body)) return json({code:'INVALID_BODY'},400);
  const {id:reportId,stationId} = body, lineName=body.lineName??null, directionId=body.directionId??null;
  if(!UUID.test(reportId||'') || !stations.has(stationId)) return json({code:'INVALID_STATION'},400);
  const patterns=network.lines.filter(l=>l.name===lineName && l.stationIds.includes(stationId));
  if(lineName!==null && !patterns.length) return json({code:'INVALID_LINE'},400);
  if(directionId!==null && (!patterns.length || directionId===stationId || !patterns.some(l=>l.stationIds[0]===directionId || l.stationIds.at(-1)===directionId))) return json({code:'INVALID_DIRECTION'},400);
  const prior=await env.DB.prepare('SELECT station_id, line_name, direction_id, actor_key FROM reports WHERE id = ?').bind(reportId).first();
  if(prior) return prior.actor_key===actor && prior.station_id===stationId && prior.line_name===lineName && prior.direction_id===directionId ? json({id:reportId,duplicate:true}) : json({code:'ID_CONFLICT'},409);
  const inserted = await env.DB.prepare('INSERT INTO reports (id, station_id, line_name, direction_id, created_at, actor_key) SELECT ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM reports WHERE actor_key = ? AND created_at > ?)').bind(reportId,stationId,lineName,directionId,now,actor,actor,now-COOLDOWN).run();
  if(!inserted.meta.changes) return json({code:'COOLDOWN',retryAfterSeconds:60},429,{'Retry-After':'60'});
  return json({id:reportId,createdAt:now,expiresAt:now+HOUR},201);
 } catch(error) {
  console.error('Report storage request failed',error instanceof Error?error.name:'unknown');
  return json({code:'STORAGE_UNAVAILABLE'},503);
 }
}
