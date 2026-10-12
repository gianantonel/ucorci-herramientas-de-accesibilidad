import { database, migrate } from "./db.mjs";
import { isInsforge } from "./store.mjs";
import { createAdminClient } from "@insforge/sdk";
if (isInsforge()) {
  const admin = createAdminClient({
    baseUrl: process.env.INSFORGE_URL,
    apiKey: process.env.INSFORGE_API_KEY,
  });
  const { data, error } = await admin.database.rpc("ucorci_usage_summary");
  if (error) throw new Error("No se pudo obtener el informe de métricas.");
  console.log(JSON.stringify(data, null, 2));
  process.exit(0);
}
await migrate();
const rows = (
  await database().client.execute(
    `SELECT tool,COUNT(*) AS usos,COUNT(DISTINCT user_id) AS personas,ROUND(AVG(duration_ms)) AS tiempo_promedio_ms,SUM(CASE WHEN result='error' THEN 1 ELSE 0 END) AS errores FROM usage_events GROUP BY tool`,
  )
).rows;
console.log(JSON.stringify(rows, null, 2));
database().client.close();
