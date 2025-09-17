import { MongoClient, Db } from "mongodb";

const uri = process.env.MONGODB_URI!;
const dbName = process.env.MONGODB_DB || "tutedude";

let client: MongoClient | null = null;
let db: Db | null = null;

export async function getDb() {
  if (db) return db;
  if (!client) client = new MongoClient(uri);
  await client.connect();
  db = client.db(dbName);
  return db;
}
