import { diskDocumentStore } from "../storage/disk-document-store.js";
import type { DocumentStore } from "../storage/document-store.js";

let store: DocumentStore | null = null;

/** The one DocumentStore every service uses, created on first use from DOCUMENTS_DIR. */
export function documents(): DocumentStore {
  if (!store) {
    const root = process.env.DOCUMENTS_DIR;
    if (!root) throw new Error("DOCUMENTS_DIR is not set");
    store = diskDocumentStore(root);
  }
  return store;
}
