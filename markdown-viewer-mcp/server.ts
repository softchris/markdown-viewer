import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ingest, search, DEFAULT_SOURCE_FILE, type VectorStoreEntry } from "./rag.js";
import { generateResponse } from "./ai.js";

// Module-level vector store cache — populated on first RAG search call
let _vectorStore: VectorStoreEntry[] = [];
let _ingestedFilePath = "";

// Works both from source (server.ts) and compiled (dist/server.js)
const DIST_DIR = import.meta.filename.endsWith(".ts")
  ? path.join(import.meta.dirname, "dist")
  : import.meta.dirname;

interface MarkdownDocument {
  filename: string;
  content: string;
  wordCount: number;
  readingTimeMinutes: number;
  headings: { level: number; text: string }[];
  linkCount: number;
  codeBlockCount: number;
  imageCount: number;
}

interface Product {
  id: number;
  name: string;
  category: string;
  price: number;
  inStock: boolean;
}

interface SearchResult {
  id: string;
  title: string;
  source: string;
  excerpt: string;
  score: number;
}

function parseProductTable(content: string): Product[] {
  const lines = content.split("\n").filter((l) => l.trim().startsWith("|"));
  if (lines.length < 3) return []; // header + separator + at least one row

  // Skip header row and separator row
  const dataRows = lines.slice(2);
  const products: Product[] = [];

  for (const row of dataRows) {
    const cells = row.split("|").map((c) => c.trim()).filter(Boolean);
    if (cells.length < 5) continue;

    const id = parseInt(cells[0], 10);
    const name = cells[1];
    const category = cells[2];
    const price = parseFloat(cells[3].replace(/[^0-9.]/g, ""));
    const inStock = cells[4].toLowerCase() === "yes";

    if (!isNaN(id) && !isNaN(price) && name) {
      products.push({ id, name, category, price, inStock });
    }
  }

  return products;
}

function analyzeMarkdown(filename: string, content: string): MarkdownDocument {
  const words = content.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));

  const headings: { level: number; text: string }[] = [];
  for (const match of content.matchAll(/^(#{1,6})\s+(.+)$/gm)) {
    headings.push({ level: match[1].length, text: match[2].trim() });
  }

  const linkCount = (content.match(/\[.+?\]\(.+?\)/g) || []).length;
  const codeBlockCount = (content.match(/```/g) || []).length / 2;
  const imageCount = (content.match(/!\[.*?\]\(.+?\)/g) || []).length;

  return { filename, content, wordCount, readingTimeMinutes, headings, linkCount, codeBlockCount: Math.floor(codeBlockCount), imageCount };
}

/**
 * Creates a new MCP server instance with tools and resources registered.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "Markdown Viewer MCP Server",
    version: "1.0.0",
  });

  const resourceUri = "ui://view-markdown/mcp-app.html";

  registerAppTool(
    server,
    "view-markdown",
    {
      title: "View Markdown",
      description:
        "Ingests one or more markdown files and displays them in a creative interactive viewer with multiple view modes: magazine cards, rich reader, presentation slides, and a stats dashboard.",
      inputSchema: z.object({
        filePaths: z
          .array(z.string())
          .describe("Array of file paths to markdown files to ingest and display."),
      }),
      _meta: { ui: { resourceUri } },
    },
    async (args: { filePaths: string[] }): Promise<CallToolResult> => {
      const documents: MarkdownDocument[] = [];
      const errors: string[] = [];

      for (const filePath of args.filePaths) {
        try {
          const resolvedPath = path.resolve(filePath);
          const content = await fs.readFile(resolvedPath, "utf-8");
          const filename = path.basename(resolvedPath);
          documents.push(analyzeMarkdown(filename, content));
        } catch (err) {
          errors.push(`Failed to read ${filePath}: ${(err as Error).message}`);
        }
      }

      const totalWords = documents.reduce((sum, d) => sum + d.wordCount, 0);
      const totalReadingTime = documents.reduce((sum, d) => sum + d.readingTimeMinutes, 0);

      const summary = [
        `📄 Loaded ${documents.length} document${documents.length !== 1 ? "s" : ""}`,
        `📝 ${totalWords.toLocaleString()} total words`,
        `⏱️ ~${totalReadingTime} min total reading time`,
        ...errors.map((e) => `⚠️ ${e}`),
      ].join("\n");

      return {
        content: [{ type: "text", text: summary }],
        structuredContent: { documents, errors },
      };
    },
  );

  registerAppTool(
    server,
    "search-products",
    {
      title: "Search Products",
      description:
        "Reads a markdown product catalogue file, parses the product table, and returns filtered results. Supports filtering by search query, category, price range, and stock availability.",
      inputSchema: z.object({
        filePath: z.string().describe("Path to the markdown file containing the product catalogue table."),
        query: z.string().optional().describe("Search term to filter products by name."),
        category: z.string().optional().describe("Filter products by category (exact match, case-insensitive)."),
        minPrice: z.number().optional().describe("Minimum price filter."),
        maxPrice: z.number().optional().describe("Maximum price filter."),
        inStock: z.boolean().optional().describe("Filter by stock availability. True = in stock only, false = out of stock only."),
      }),
      _meta: { ui: { resourceUri } },
    },
    async (args: {
      filePath: string;
      query?: string;
      category?: string;
      minPrice?: number;
      maxPrice?: number;
      inStock?: boolean;
    }): Promise<CallToolResult> => {
      try {
        const resolvedPath = path.resolve(args.filePath);
        const content = await fs.readFile(resolvedPath, "utf-8");
        let products = parseProductTable(content);

        if (products.length === 0) {
          return {
            content: [{ type: "text", text: "No product table found in the file." }],
            structuredContent: { products: [], categories: [], filters: {} },
          };
        }

        const allCategories = [...new Set(products.map((p) => p.category))].sort();
        const filters: Record<string, unknown> = {};

        if (args.query) {
          const q = args.query.toLowerCase();
          products = products.filter((p) => p.name.toLowerCase().includes(q));
          filters.query = args.query;
        }
        if (args.category) {
          const cat = args.category.toLowerCase();
          products = products.filter((p) => p.category.toLowerCase() === cat);
          filters.category = args.category;
        }
        if (args.minPrice !== undefined) {
          products = products.filter((p) => p.price >= args.minPrice!);
          filters.minPrice = args.minPrice;
        }
        if (args.maxPrice !== undefined) {
          products = products.filter((p) => p.price <= args.maxPrice!);
          filters.maxPrice = args.maxPrice;
        }
        if (args.inStock !== undefined) {
          products = products.filter((p) => p.inStock === args.inStock);
          filters.inStock = args.inStock;
        }

        const summary = [
          `🛍️ Found ${products.length} product${products.length !== 1 ? "s" : ""}`,
          `📂 ${allCategories.length} categories available`,
          `💰 Price range: $${Math.min(...products.map((p) => p.price)).toFixed(2)} – $${Math.max(...products.map((p) => p.price)).toFixed(2)}`,
          Object.keys(filters).length > 0 ? `🔍 Filters applied: ${Object.keys(filters).join(", ")}` : "",
        ].filter(Boolean).join("\n");

        return {
          content: [{ type: "text", text: summary }],
          structuredContent: { products, categories: allCategories, filters },
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Failed to read product catalogue: ${(err as Error).message}` }],
          structuredContent: { products: [], categories: [], filters: {} },
        };
      }
    },
  );

  registerAppTool(
    server,
    "rag-search",
    {
      title: "RAG Search",
      description:
        "Searches a markdown document using semantic similarity via Ollama embeddings, then generates a grounded answer using a local LLM (phi3:mini). Requires Ollama to be running with the 'embeddinggemma' and 'phi3:mini' models.",
      inputSchema: z.object({
        query: z.string().min(1).describe("The natural language search query to run against the document index."),
        filePath: z.string().optional().describe("Path to the markdown file to search. Defaults to the bundled sample document."),
      }),
      _meta: { ui: { resourceUri } },
    },
    async (args: { query: string; filePath?: string }): Promise<CallToolResult> => {
      const sourceFile = args.filePath ? path.resolve(args.filePath) : path.resolve(DEFAULT_SOURCE_FILE);

      // (Re-)ingest if the source file has changed or the store is empty
      if (sourceFile !== _ingestedFilePath || _vectorStore.length === 0) {
        _vectorStore = await ingest(sourceFile);
        _ingestedFilePath = sourceFile;
      }

      const { content: context, chunkIndex, score, source } = await search(args.query, _vectorStore);

      if (!context) {
        return {
          content: [{ type: "text", text: "No relevant content found for your query." }],
          structuredContent: { query: args.query, results: [] },
        };
      }

      const aiResponse = await generateResponse(args.query, context);

      // Extract the first heading from the chunk as its title, or fall back to the first non-empty line
      const titleMatch = context.match(/^#{1,6}\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1].trim() : (context.split("\n").find((l) => l.trim()) ?? "Result");

      const results: SearchResult[] = [
        {
          id: `chunk-${chunkIndex}`,
          title,
          source: path.basename(source),
          excerpt: context.length > 300 ? context.slice(0, 300) + "\u2026" : context,
          score: parseFloat(score.toFixed(4)),
        },
      ];

      return {
        content: [{ type: "text", text: aiResponse }],
        structuredContent: { query: args.query, results },
      };
    },
  );

  registerAppResource(
    server,
    resourceUri,
    resourceUri,
    { mimeType: RESOURCE_MIME_TYPE },
    async (): Promise<ReadResourceResult> => {
      const html = await fs.readFile(path.join(DIST_DIR, "mcp-app.html"), "utf-8");
      return {
        contents: [{ uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: html }],
      };
    },
  );

  return server;
}
