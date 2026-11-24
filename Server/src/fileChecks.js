const path = require('node:path');
const { TextDecoder } = require('node:util');

const BOOK_TYPES = ['PDF', 'UNICODE', 'AUDIO'];
const EXTENSIONS = { PDF: ['.pdf'], UNICODE: ['.txt'], AUDIO: ['.mp3', '.wav', '.ogg', '.m4a'] };

// Checks the file name AND the file's real content (magic bytes), not just the extension.
function matchesFormat(file, type) {
  const extension = path.extname(file.originalname).toLowerCase();
  const buffer = file.buffer;
  if (!buffer?.length || !EXTENSIONS[type]?.includes(extension)) return false;

  if (type === 'PDF') return buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'));
  if (type === 'UNICODE') {
    if (buffer.includes(0)) return false;
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(buffer);
      return true;
    } catch {
      return false;
    }
  }
  if (extension === '.mp3') {
    return buffer.subarray(0, 3).toString() === 'ID3' ||
      (buffer.length > 1 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
  }
  if (extension === '.wav') return buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WAVE';
  if (extension === '.ogg') return buffer.subarray(0, 4).toString() === 'OggS';
  if (extension === '.m4a') return buffer.subarray(4, 8).toString() === 'ftyp';
  return false;
}

module.exports = { BOOK_TYPES, EXTENSIONS, matchesFormat };
