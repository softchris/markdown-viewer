#!/usr/bin/env node
/**
 * Standalone ingest script for RAG vector store.
 * Pre-computes embeddings and caches the vector store for faster searches.
 *
 * Usage:
 *   npm run ingest              # Ingest default document (docs/sample.md)
 *   npm run ingest -- path/to/file.md  # Ingest a specific file
 */

import { ingest, DEFAULT_SOURCE_FILE } from "./rag.js";

async function main(): Promise<void> {
  try {
    const sourceFile = (process as any).argv[2] || DEFAULT_SOURCE_FILE;

    console.log(`\n🔍 Starting ingest for: ${sourceFile}\n`);
    const startTime = Date.now();

    await ingest(sourceFile);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n✅ Ingest complete in ${elapsed}s\n`);
    (process as any).exit(0);
  } catch (error) {
    console.error("\n❌ Ingest failed:", error);
    (process as any).exit(1);
  }
}

await main();
