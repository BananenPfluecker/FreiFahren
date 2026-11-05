import { sqliteTable, text, integer, index, uniqueIndex, primaryKey } from 'drizzle-orm/sqlite-core';
export const reports = sqliteTable('reports', {
 id: text('id').primaryKey(), stationId: text('station_id').notNull(), lineName: text('line_name'),
 directionId: text('direction_id'), createdAt: integer('created_at').notNull(), actorKey: text('actor_key').notNull(),
 groupKey: text('group_key'), updatedAt: integer('updated_at'), openedAt: integer('opened_at'),
}, table => [index('reports_created_at_idx').on(table.createdAt), index('reports_actor_created_idx').on(table.actorKey,table.createdAt), uniqueIndex('reports_group_key_idx').on(table.groupKey)]);
export const reportVotes = sqliteTable('report_votes', {
 reportId:text('report_id').notNull(), actorKey:text('actor_key').notNull(), kind:text('kind').notNull(),
 updatedAt:integer('updated_at').notNull(), seenAt:integer('seen_at'),
}, table=>[primaryKey({columns:[table.reportId,table.actorKey]}),index('votes_report_idx').on(table.reportId)]);
export const reportActions = sqliteTable('report_actions', {
 id:text('id').primaryKey(), reportId:text('report_id'), actorKey:text('actor_key').notNull(),
 kind:text('kind').notNull(), createdAt:integer('created_at').notNull(), bodyKey:text('body_key').notNull(),
}, table=>[index('actions_actor_created_idx').on(table.actorKey,table.createdAt)]);
