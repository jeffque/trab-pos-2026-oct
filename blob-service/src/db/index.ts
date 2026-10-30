import init from "../env/index.js";
import { Pool } from "pg";
import { log } from "../log/index.js";

init();

// cada serviço enxerga só o próprio schema (PGSCHEMA vem do docker-compose)
const pool = new Pool({ options: `-c search_path=${process.env.PGSCHEMA ?? "public"}` });

// conexão ociosa derrubada pelo banco (reinício, failover): sem este handler o processo inteiro cai.
// O pool descarta a conexão e abre outra na próxima consulta.
pool.on("error", (err) => {
  log().warn({ err: err.message }, "conexão ociosa com o banco perdida; o pool vai reconectar")
})

export const query = async (text: string, params?: any[]) => {
  const start = Date.now()
  try {
    const res = await pool.query(text, params)
    log().debug({ query: text, duration_ms: Date.now() - start, rows: res.rowCount }, "consulta executada")
    return res
  } catch (err) {
    log().error({ query: text, err }, "consulta falhou")
    throw err;
  }
}

export const getClient = () => {
  return pool.connect()
}
