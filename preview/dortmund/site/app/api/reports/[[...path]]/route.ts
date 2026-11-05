import { env } from 'cloudflare:workers';
import network from '../../../../public/map/data/dortmund.json';
import { handleReports } from '../../../../lib/reports-api.mjs';
export const dynamic = 'force-dynamic';
const handle = (request: Request) => handleReports(request, env, network, {
 userId: request.headers.get('oai-authenticated-user-id') || (process.env.NODE_ENV === 'development' ? 'local-preview' : null),
});
export const GET = handle;
export const POST = handle;
export const DELETE = handle;
