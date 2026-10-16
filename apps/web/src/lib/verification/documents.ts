/**
 * Verification documents (PRD wave-1 §2.2-4): up to 5 files, JPG, PNG or PDF, each up to 10 MB. The bucket
 * `certificates` enforces the same type and size, and the database refuses a sixth row; these checks only
 * let the screen say what is wrong before anything is uploaded.
 */
export const MAX_DOCUMENTS = 5;
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_TITLE_LENGTH = 200;

/** Accepted MIME types and the extension the object gets. */
export const DOCUMENT_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "application/pdf": "pdf",
} as const;

export type DocumentType = keyof typeof DOCUMENT_TYPES;

/** For `<input accept>`. */
export const DOCUMENT_ACCEPT = Object.keys(DOCUMENT_TYPES).join(",");

export type DocumentProblem = "wrong-type" | "too-big" | "empty";

export function isDocumentType(type: string): type is DocumentType {
  return Object.hasOwn(DOCUMENT_TYPES, type);
}

/** What is wrong with a picked file, or null when it can be uploaded. */
export function documentProblem(file: { type: string; size: number }): DocumentProblem | null {
  if (!isDocumentType(file.type)) return "wrong-type";
  if (file.size === 0) return "empty";
  if (file.size > MAX_DOCUMENT_BYTES) return "too-big";
  return null;
}

/** Object name inside the bucket: the trainer's folder, then the document id (storage policies check the folder). */
export function documentPath(trainerId: string, documentId: string, type: DocumentType): string {
  return `${trainerId}/${documentId}.${DOCUMENT_TYPES[type]}`;
}
