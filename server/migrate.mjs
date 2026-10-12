import {migrate,database} from './db.mjs';
await migrate(); console.log('SQLite: esquema preparado.'); database().client.close();
