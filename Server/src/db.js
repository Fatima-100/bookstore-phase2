const { MongoClient } = require('mongodb');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });

const client = new MongoClient(
  process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017',
  { serverSelectionTimeoutMS: 5000 }
);

// Open one shared connection for the application.
async function connectDB() {
  await client.connect();
  const database = client.db(process.env.MONGODB_DB || 'bookstore');
  await database.command({ ping: 1 });
  return database;
}

function getDB() {
  return client.db(process.env.MONGODB_DB || 'bookstore');
}

async function closeDB() {
  await client.close();
}

module.exports = { connectDB, getDB, closeDB };
