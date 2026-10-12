import 'dotenv/config';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { mkdirSync } from 'node:fs';
let connection;
export function database() {
 if(connection) return connection;
 const url=process.env.DATABASE_URL || (!process.env.VERCEL ? 'file:./data/ucorci.db' : '');
 if(!url || (process.env.VERCEL && url.startsWith('file:'))) throw new Error('SQLite persistente no configurada. Configurar DATABASE_URL y DATABASE_AUTH_TOKEN.');
 if(url.startsWith('file:')) mkdirSync('data',{recursive:true});
 const client=createClient({url,authToken:process.env.DATABASE_AUTH_TOKEN});
 return connection={client,orm:drizzle(client)};
}
export async function migrate(){
 const {client}=database();
 await client.executeMultiple(`
 PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT, email TEXT UNIQUE, emailVerified INTEGER, image TEXT, firstName TEXT, lastName TEXT, passwordHash TEXT, createdAt INTEGER);
 CREATE TABLE IF NOT EXISTS accounts (userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,type TEXT NOT NULL,provider TEXT NOT NULL,providerAccountId TEXT NOT NULL,refresh_token TEXT,access_token TEXT,expires_at INTEGER,token_type TEXT,scope TEXT,id_token TEXT,session_state TEXT,PRIMARY KEY(provider,providerAccountId));
 CREATE TABLE IF NOT EXISTS sessions (sessionToken TEXT PRIMARY KEY,userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS verificationTokens (identifier TEXT NOT NULL,token TEXT NOT NULL,expires INTEGER NOT NULL,PRIMARY KEY(identifier,token));
 CREATE TABLE IF NOT EXISTS usage_events (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,tool TEXT NOT NULL CHECK(tool IN ('tts','stt','dyslexia')),duration_ms INTEGER NOT NULL CHECK(duration_ms>=0),result TEXT NOT NULL CHECK(result IN ('success','error')),created_at INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS usage_tool_time ON usage_events(tool,created_at);
 CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);
 `);
}
export async function limited(key,max=10,window=900000){
 const now=Date.now();
 const result=await database().client.execute({sql:'INSERT INTO rate_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires < ? THEN 1 ELSE count+1 END,expires=CASE WHEN expires < ? THEN ? ELSE expires END RETURNING count',args:[key,now+window,now,now,now+window]});
 return Number(result.rows[0].count)>max;
}
