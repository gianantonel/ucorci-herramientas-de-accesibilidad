import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
export const users = sqliteTable('users', {
 id:text('id').primaryKey().$defaultFn(()=>crypto.randomUUID()), name:text('name'), email:text('email').unique(), emailVerified:integer('emailVerified',{mode:'timestamp_ms'}), image:text('image'),
 firstName:text('firstName'), lastName:text('lastName'), passwordHash:text('passwordHash'), createdAt:integer('createdAt'),
});
export const accounts=sqliteTable('accounts',{
 userId:text('userId').notNull().references(()=>users.id,{onDelete:'cascade'}), type:text('type').notNull(), provider:text('provider').notNull(), providerAccountId:text('providerAccountId').notNull(),
 refresh_token:text('refresh_token'),access_token:text('access_token'),expires_at:integer('expires_at'),token_type:text('token_type'),scope:text('scope'),id_token:text('id_token'),session_state:text('session_state')
}, t=>[primaryKey({columns:[t.provider,t.providerAccountId]})]);
export const sessions=sqliteTable('sessions',{sessionToken:text('sessionToken').primaryKey(),userId:text('userId').notNull().references(()=>users.id,{onDelete:'cascade'}),expires:integer('expires',{mode:'timestamp_ms'}).notNull()});
export const verificationTokens=sqliteTable('verificationTokens',{identifier:text('identifier').notNull(),token:text('token').notNull(),expires:integer('expires',{mode:'timestamp_ms'}).notNull()},t=>[primaryKey({columns:[t.identifier,t.token]})]);
