import init from "../env/index.js";
import { Pool } from "pg";

init();

const pool = new Pool();

export const query = async (text: string, params?: any[]) => {
  const start = Date.now()
  try {
    const res = await pool.query(text, params)
    const duration = Date.now() - start
    console.log('executed query', { text, duration, rows: res.rowCount })
    return res
  } catch (err) {
    console.log('failed query', { text, err })

    throw err;
  }
}

export const getClient = () => {
  return pool.connect()
}