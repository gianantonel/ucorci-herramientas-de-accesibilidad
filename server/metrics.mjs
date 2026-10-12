import {database,migrate} from './db.mjs';
await migrate();
const rows=(await database().client.execute(`SELECT tool,COUNT(*) AS usos,COUNT(DISTINCT user_id) AS personas,ROUND(AVG(duration_ms)) AS tiempo_promedio_ms,SUM(CASE WHEN result='error' THEN 1 ELSE 0 END) AS errores FROM usage_events GROUP BY tool`)).rows;
console.log(JSON.stringify(rows,null,2));database().client.close();
