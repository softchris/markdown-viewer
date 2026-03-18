import { Ollama } from "ollama";
import fs from "node:fs/promises";
import path from "node:path";

// Resolve base directory correctly whether running as .ts (tsx) or compiled .js (dist/)
const _dir = import.meta.filename.endsWith(".ts")
  ? import.meta.dirname
  : path.join(import.meta.dirname, "..");

export const DEFAULT_SOURCE_FILE = path.join(_dir, "docs", "sample.md");

const EMBEDDING_MODEL = "embeddinggemma";
const VECTOR_STORE_PATH = path.join(_dir, "vector_store.json");
const CHUNK_SIZE = 500;
const THRESHOLD = 0.3;

export interface VectorStoreEntry {
  text: string;
  vector: number[];
  metadata: { source: string; chunkIndex: number };
}

interface PersistedStore {
  sourceFile: string;
  entries: VectorStoreEntry[];
}

function log(msg: string) {
  console.error(`[LOG] ${msg}`);
}

/**
 * Split a markdown document into chunks, breaking at headings and at CHUNK_SIZE characters.
 * Equivalent to LangChain's MarkdownTextSplitter(chunk_size=500).
 */
export function splitMarkdown(text: string): string[] {
  const chunks: string[] = [];
  let current = "";

  for (const line of text.split("\n")) {
    // Start a new chunk at headings when the current chunk is already large enough
    if (line.match(/^#{1,6}\s/) && current.trim().length >= CHUNK_SIZE / 2) {
      chunks.push(current.trim());
      current = line + "\n";
    } else if (current.length >= CHUNK_SIZE) {
      chunks.push(current.trim());
      current = line + "\n";
    } else {
      current += line + "\n";
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks.filter((c) => c.length > 0);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Ingest a markdown file into an in-memory vector store backed by Ollama embeddings.
 * If a persisted store for the same source file already exists on disk, loads it instead.
 * Equivalent to rag.py's ingest().
 */
export async function ingest(sourceFile: string = DEFAULT_SOURCE_FILE): Promise<VectorStoreEntry[]> {
  const resolvedSource = path.resolve(sourceFile);

  // Try to load an existing vector store from disk
  try {
    const saved = await fs.readFile(VECTOR_STORE_PATH, "utf-8");
    const persisted = JSON.parse(saved) as PersistedStore;
    if (persisted.sourceFile === resolvedSource) {
      log(`Loading vector store from ${VECTOR_STORE_PATH}...`);
      return persisted.entries;
    }
    log("Source file changed, re-ingesting...");
  } catch {
    log("Creating new vector store...");
  }

  const text = await fs.readFile(resolvedSource, "utf-8");
  const chunks = splitMarkdown(text);
  log(`Split document into ${chunks.length} chunks`);

  const ollama = new Ollama();
  const entries: VectorStoreEntry[] = [];

  log("Embedding chunks...");
  for (let i = 0; i < chunks.length; i++) {
    const response = await ollama.embed({ model: EMBEDDING_MODEL, input: chunks[i] });
    entries.push({
      text: chunks[i],
      vector: response.embeddings[0],
      metadata: { source: resolvedSource, chunkIndex: i },
    });
  }

  log(`Saving vector store to ${VECTOR_STORE_PATH}...`);
  const persisted: PersistedStore = { sourceFile: resolvedSource, entries };
  await fs.writeFile(VECTOR_STORE_PATH, JSON.stringify(persisted));

  return entries;
}

/**
 * Return all chunks from the source document without embedding.
 * Equivalent to rag.py's get_chunks().
 */
export async function getChunks(sourceFile: string = DEFAULT_SOURCE_FILE): Promise<string[]> {
  const text = await fs.readFile(sourceFile, "utf-8");
  return splitMarkdown(text);
}

/**
 * Embed the query and find the most similar chunk in the vector store via cosine similarity.
 * Returns (content, chunkIndex, score, source) or null content if nothing crosses the threshold.
 * Equivalent to rag.py's search().
 */
export async function search(
  prompt: string,
  store: VectorStoreEntry[]
): Promise<{ content: string | null; chunkIndex: number; score: number; source: string }> {
  const ollama = new Ollama();

  log(`Query: ${prompt}`);
  log("Searching for the most similar chunk...");

  const response = await ollama.embed({ model: EMBEDDING_MODEL, input: prompt });
  const queryVector = response.embeddings[0];

  let bestScore = -1;
  let bestEntry: VectorStoreEntry | null = null;

  for (const entry of store) {
    const score = cosineSimilarity(queryVector, entry.vector);
    if (score > bestScore) {
      bestScore = score;
      bestEntry = entry;
    }
  }

  if (!bestEntry || bestScore < THRESHOLD) {
    log(`No relevant chunk found (best score: ${bestScore.toFixed(4)} < threshold: ${THRESHOLD})`);
    return { content: null, chunkIndex: -1, score: bestScore, source: "" };
  }

  log(`Most similar chunk (similarity: ${bestScore.toFixed(4)}):`);
  log(`Source: ${bestEntry.metadata.source}, Chunk: ${bestEntry.metadata.chunkIndex}`);
  return {
    content: bestEntry.text,
    chunkIndex: bestEntry.metadata.chunkIndex,
    score: bestScore,
    source: bestEntry.metadata.source,
  };
}
