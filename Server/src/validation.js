const { BOOK_TYPES, EXTENSIONS } = require('./fileChecks');

// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

// Every value must be a plain string: this also blocks object payloads such as {"$ne": ""}.
function cleanText(value) {
  return typeof value === 'string' ? value.replace(CONTROL_CHARACTERS, '').trim() : null;
}

const BOOK_FIELDS = {
  title: { label: 'Title', min: 1, max: 200 },
  author: { label: 'Author', min: 1, max: 200 },
  category: { label: 'Category', min: 1, max: 100 },
  subtitle: { label: 'Subtitle', min: 0, max: 300 },
  description: { label: 'Description', min: 0, max: 2000 },
};

// Only the whitelisted fields are copied; everything else the client sends is ignored.
// partial = true (edits) validates only the fields that were actually sent.
function validateBookFields(input = {}, { partial = false } = {}) {
  const values = {};
  const errors = {};
  for (const [field, rule] of Object.entries(BOOK_FIELDS)) {
    if (input[field] === undefined) {
      if (!partial && rule.min > 0) errors[field] = `${rule.label} is required.`;
      continue;
    }
    const text = cleanText(input[field]);
    if (text === null) errors[field] = `${rule.label} must be text.`;
    else if (text.length < rule.min) errors[field] = `${rule.label} is required.`;
    else if (text.length > rule.max) errors[field] = `${rule.label} must be ${rule.max} characters or fewer.`;
    else values[field] = text;
  }
  return { values, errors };
}

// A permitted file link: http(s) only, no embedded credentials, correct extension, optional host allow-list.
function validateFileUrl(value, bookType) {
  const text = cleanText(value);
  if (!text || text.length > 2000) return { error: 'Enter a file link of 2000 characters or fewer.' };
  let url;
  try {
    url = new URL(text);
  } catch {
    return { error: 'The file link is not a valid URL.' };
  }
  if (!['http:', 'https:'].includes(url.protocol)) return { error: 'The file link must start with http:// or https://.' };
  if (url.username || url.password) return { error: 'The file link must not contain a username or password.' };
  const extension = url.pathname.toLowerCase().match(/\.[a-z0-9]+$/)?.[0];
  if (!extension || !EXTENSIONS[bookType].includes(extension)) {
    return { error: `A ${bookType} link must end in ${EXTENSIONS[bookType].join(', ')}.` };
  }
  const allowedHosts = (process.env.ALLOWED_URL_HOSTS || '').split(',').map((host) => host.trim().toLowerCase()).filter(Boolean);
  if (allowedHosts.length && !allowedHosts.includes(url.hostname.toLowerCase())) {
    return { error: 'Files from this website are not permitted.' };
  }
  return { value: url.href };
}

function validateBookType(value) {
  const type = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return BOOK_TYPES.includes(type) ? type : null;
}

module.exports = { validateBookFields, validateFileUrl, validateBookType, cleanText };
