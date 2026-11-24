const { connectDB, closeDB } = require('./db');
const { books } = require('./data/books');

async function seedBooks() {
  try {
    const database = await connectDB();
    const collection = database.collection('books');

    // Each original catalogue ID is used as MongoDB's unique document ID.
    // Re-running the seed adds missing books without overwriting existing edits.
    const result = await collection.bulkWrite(
      books.map((book) => ({
        updateOne: {
          filter: { _id: book.id },
          update: { $setOnInsert: book },
          upsert: true,
        },
      }))
    );

    console.log(`Added ${result.upsertedCount} books. Existing books were kept.`);
  } catch {
    console.error('Could not seed books. Start MongoDB and check Server/.env.');
    process.exitCode = 1;
  } finally {
    await closeDB();
  }
}

seedBooks();
