import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const reports = sqliteTable('reports', {
 id: text('id').primaryKey(), stationId: text('station_id').notNull(), lineName: text('line_name'),
 directionId: text('direction_id'), createdAt: integer('created_at').notNull(), actorKey: text('actor_key').notNull(),
}, table => [index('reports_created_at_idx').on(table.createdAt), index('reports_actor_created_idx').on(table.actorKey,table.createdAt)]);
