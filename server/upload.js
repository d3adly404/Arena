/**
 * FieldLink — file uploads (photographs and documents).
 * Files land in the FieldLink data folder and are only ever streamed back through an
 * authorised API route, so family photographs are never publicly reachable.
 */
import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import { UPLOAD_DIR } from './db.js';
import { bad } from './util.js';

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif'];
const DOC_TYPES = [
  'application/pdf', 'text/plain', 'text/csv', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
];

const EXT_FALLBACK = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/heic': '.heic', 'image/heif': '.heif',
  'image/gif': '.gif', 'application/pdf': '.pdf', 'text/plain': '.txt', 'text/csv': '.csv',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/zip': '.zip',
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').slice(0, 8) || EXT_FALLBACK[file.mimetype] || '.bin';
    cb(null, `${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}${ext.toLowerCase()}`);
  },
});

function makeUploader(allowed) {
  return multer({
    storage,
    limits: { fileSize: 25 * 1024 * 1024, files: 12 },
    fileFilter: (req, file, cb) => {
      if (allowed.includes(file.mimetype)) return cb(null, true);
      cb(bad(`That file type is not supported (${file.mimetype}). Use a photo, PDF, Word or Excel file.`));
    },
  });
}

export const photoUpload = makeUploader(PHOTO_TYPES.concat(DOC_TYPES));
export const documentUpload = makeUploader(DOC_TYPES.concat(PHOTO_TYPES));
export const PHOTO_MIME = PHOTO_TYPES;

export function kindFor(mime) {
  return PHOTO_TYPES.includes(mime) ? 'photo' : 'document';
}
