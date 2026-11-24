const { getDB } = require('../db');

async function findBooks(bookType = 'ALL') {
  // MongoDB applies this filter before sending results back to Node.js.
  const filter = bookType === 'ALL' ? {} : { bookType };

  return getDB()
    .collection('books')
    .find(filter, { projection: { _id: 0 } })
    .toArray();
}

module.exports = { findBooks };
