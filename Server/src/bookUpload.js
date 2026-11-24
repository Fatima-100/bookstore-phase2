const multer = require('multer');

// Files stay in memory until the service has checked them; nothing is written to disk before that.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1, fields: 12, fieldSize: 10000 },
});

// Turns multer's own errors into JSON; every other error goes to the shared error handler.
function handleUploadError(error, req, res, next) {
  if (error instanceof multer.MulterError) {
    const tooBig = error.code === 'LIMIT_FILE_SIZE';
    return res.status(tooBig ? 413 : 400).json({
      message: tooBig ? 'The file must be 25 MB or smaller.' : 'Invalid upload. Send one file and the book details.',
    });
  }
  next(error);
}

module.exports = { upload, handleUploadError };
