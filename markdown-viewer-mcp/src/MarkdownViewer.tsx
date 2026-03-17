/**
 * Markdown Viewer MCP App - React UI
 *
 * Four creative view modes:
 *   1. Magazine  – card grid with excerpts, stats, and colour-coded badges
 *   2. Reader    – full rendered markdown with a floating TOC sidebar
 *   3. Slides    – presentation mode, one heading-section per slide
 *   4. Dashboard – aggregate stats across all documents
 */
import type { App, McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { useApp, useHostStyles } from "@modelcontextprotocol/ext-apps/react";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

// ── Types ──────────────────────────────────────────────────────────────────

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

interface ToolPayload {
  documents: MarkdownDocument[];
  errors: string[];
  products?: Product[];
  categories?: string[];
  filters?: Record<string, unknown>;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const ACCENT_COLOURS = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981",
  "#06b6d4", "#ef4444", "#6366f1", "#14b8a6", "#f97316",
];

function accentFor(index: number) {
  return ACCENT_COLOURS[index % ACCENT_COLOURS.length];
}



// ── Styles ─────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  app: {
    display: "flex",
    flexDirection: "column",
    minHeight: "100vh",
    fontFamily: "var(--font-sans, system-ui, sans-serif)",
  },
  nav: {
    display: "flex",
    gap: "4px",
    padding: "12px 16px",
    borderBottom: "1px solid var(--color-border-primary, #e5e5e5)",
    background: "var(--color-background-secondary, #f5f5f5)",
    flexWrap: "wrap",
    alignItems: "center",
  },
  navBtn: {
    padding: "6px 14px",
    borderRadius: "var(--border-radius-md, 8px)",
    border: "1px solid var(--color-border-primary, #e5e5e5)",
    background: "transparent",
    color: "var(--color-text-secondary, #666)",
    cursor: "pointer",
    fontSize: "var(--font-text-sm-size, 13px)",
    fontWeight: "var(--font-weight-medium, 500)" as React.CSSProperties["fontWeight"],
    transition: "all 0.15s ease",
  },
  navBtnActive: {
    background: "var(--color-text-primary, #1a1a1a)",
    color: "var(--color-background-primary, #fff)",
    borderColor: "transparent",
  },
  body: {
    flex: 1,
    padding: "16px",
    overflow: "auto",
  },
  // Magazine
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: "16px",
  },
  card: {
    borderRadius: "var(--border-radius-lg, 12px)",
    border: "1px solid var(--color-border-primary, #e5e5e5)",
    overflow: "hidden",
    background: "var(--color-background-primary, #fff)",
    cursor: "pointer",
    transition: "transform 0.15s ease, box-shadow 0.15s ease",
  },
  cardBanner: {
    height: "6px",
  },
  cardBody: {
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  cardTitle: {
    fontSize: "var(--font-heading-sm-size, 18px)",
    fontWeight: "var(--font-weight-semibold, 600)" as React.CSSProperties["fontWeight"],
    margin: 0,
    color: "var(--color-text-primary, #1a1a1a)",
  },
  cardExcerpt: {
    fontSize: "var(--font-text-sm-size, 13px)",
    color: "var(--color-text-secondary, #666)",
    lineHeight: 1.5,
    margin: 0,
  },
  badges: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    marginTop: "4px",
  },
  badge: {
    fontSize: "11px",
    padding: "2px 8px",
    borderRadius: "var(--border-radius-sm, 4px)",
    background: "var(--color-background-secondary, #f0f0f0)",
    color: "var(--color-text-secondary, #555)",
    fontFamily: "var(--font-mono, monospace)",
  },
  // Reader
  readerLayout: {
    display: "flex",
    gap: "24px",
    maxWidth: "960px",
    margin: "0 auto",
    width: "100%",
  },
  toc: {
    width: "200px",
    flexShrink: 0,
    position: "sticky" as React.CSSProperties["position"],
    top: "16px",
    alignSelf: "flex-start",
    maxHeight: "calc(100vh - 80px)",
    overflow: "auto",
    fontSize: "var(--font-text-sm-size, 13px)",
  },
  tocItem: {
    display: "block",
    padding: "4px 0",
    color: "var(--color-text-secondary, #666)",
    textDecoration: "none",
    cursor: "pointer",
    border: "none",
    background: "none",
    textAlign: "left" as React.CSSProperties["textAlign"],
    width: "100%",
    fontSize: "var(--font-text-sm-size, 13px)",
    fontFamily: "var(--font-sans, system-ui, sans-serif)",
  },
  prose: {
    flex: 1,
    minWidth: 0,
    lineHeight: 1.7,
    fontSize: "var(--font-text-base-size, 15px)",
  },
  // Slides
  slideContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "calc(100vh - 120px)",
    gap: "24px",
  },
  slide: {
    width: "100%",
    maxWidth: "720px",
    minHeight: "360px",
    padding: "48px 40px",
    borderRadius: "var(--border-radius-lg, 12px)",
    background: "var(--color-background-primary, #fff)",
    border: "1px solid var(--color-border-primary, #e5e5e5)",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    lineHeight: 1.7,
  },
  slideNav: {
    display: "flex",
    gap: "12px",
    alignItems: "center",
  },
  slideBtn: {
    padding: "8px 20px",
    borderRadius: "var(--border-radius-md, 8px)",
    border: "1px solid var(--color-border-primary, #e5e5e5)",
    background: "var(--color-background-secondary, #f5f5f5)",
    cursor: "pointer",
    fontSize: "var(--font-text-sm-size, 14px)",
    color: "var(--color-text-primary, #1a1a1a)",
  },
  slideCounter: {
    fontSize: "var(--font-text-sm-size, 13px)",
    color: "var(--color-text-secondary, #666)",
    fontFamily: "var(--font-mono, monospace)",
  },
  // Dashboard
  statGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
    gap: "16px",
    marginBottom: "24px",
  },
  statCard: {
    padding: "20px",
    borderRadius: "var(--border-radius-lg, 12px)",
    border: "1px solid var(--color-border-primary, #e5e5e5)",
    background: "var(--color-background-primary, #fff)",
    textAlign: "center" as React.CSSProperties["textAlign"],
  },
  statValue: {
    fontSize: "32px",
    fontWeight: "var(--font-weight-semibold, 700)" as React.CSSProperties["fontWeight"],
    margin: 0,
  },
  statLabel: {
    fontSize: "var(--font-text-sm-size, 13px)",
    color: "var(--color-text-secondary, #666)",
    marginTop: "4px",
  },
  bar: {
    height: "24px",
    borderRadius: "var(--border-radius-sm, 4px)",
    transition: "width 0.4s ease",
  },
  barRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    marginBottom: "8px",
    fontSize: "var(--font-text-sm-size, 13px)",
  },
  barLabel: {
    width: "140px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as React.CSSProperties["whiteSpace"],
    color: "var(--color-text-secondary, #666)",
  },
  docSelector: {
    padding: "6px 12px",
    borderRadius: "var(--border-radius-md, 8px)",
    border: "1px solid var(--color-border-primary, #e5e5e5)",
    background: "var(--color-background-secondary, #f5f5f5)",
    color: "var(--color-text-primary, #1a1a1a)",
    fontSize: "var(--font-text-sm-size, 13px)",
    cursor: "pointer",
  },
  empty: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "50vh",
    color: "var(--color-text-secondary, #888)",
    fontSize: "var(--font-text-base-size, 16px)",
  },
  searchInput: {
    padding: "6px 12px",
    borderRadius: "var(--border-radius-md, 8px)",
    border: "1px solid var(--color-border-primary, #e5e5e5)",
    background: "var(--color-background-secondary, #f5f5f5)",
    color: "var(--color-text-primary, #1a1a1a)",
    fontSize: "var(--font-text-sm-size, 13px)",
    outline: "none",
    width: "160px",
    marginLeft: "auto",
  },
  // Products
  productFilters: {
    display: "flex",
    flexWrap: "wrap" as React.CSSProperties["flexWrap"],
    gap: "12px",
    marginBottom: "20px",
    alignItems: "flex-end",
  },
  filterGroup: {
    display: "flex",
    flexDirection: "column" as React.CSSProperties["flexDirection"],
    gap: "4px",
  },
  filterLabel: {
    fontSize: "11px",
    fontWeight: "var(--font-weight-medium, 500)" as React.CSSProperties["fontWeight"],
    textTransform: "uppercase" as React.CSSProperties["textTransform"],
    letterSpacing: "0.05em",
    color: "var(--color-text-secondary, #888)",
  },
  filterInput: {
    padding: "6px 12px",
    borderRadius: "var(--border-radius-md, 8px)",
    border: "1px solid var(--color-border-primary, #e5e5e5)",
    background: "var(--color-background-secondary, #f5f5f5)",
    color: "var(--color-text-primary, #1a1a1a)",
    fontSize: "var(--font-text-sm-size, 13px)",
    outline: "none",
  },
  filterSelect: {
    padding: "6px 12px",
    borderRadius: "var(--border-radius-md, 8px)",
    border: "1px solid var(--color-border-primary, #e5e5e5)",
    background: "var(--color-background-secondary, #f5f5f5)",
    color: "var(--color-text-primary, #1a1a1a)",
    fontSize: "var(--font-text-sm-size, 13px)",
    cursor: "pointer",
  },
  productTable: {
    width: "100%",
    borderCollapse: "collapse" as React.CSSProperties["borderCollapse"],
    fontSize: "var(--font-text-sm-size, 14px)",
  },
  productTh: {
    textAlign: "left" as React.CSSProperties["textAlign"],
    padding: "10px 14px",
    borderBottom: "2px solid var(--color-border-primary, #e5e5e5)",
    fontSize: "12px",
    fontWeight: "var(--font-weight-semibold, 600)" as React.CSSProperties["fontWeight"],
    textTransform: "uppercase" as React.CSSProperties["textTransform"],
    letterSpacing: "0.04em",
    color: "var(--color-text-secondary, #888)",
    cursor: "pointer",
    userSelect: "none" as React.CSSProperties["userSelect"],
  },
  productTd: {
    padding: "10px 14px",
    borderBottom: "1px solid var(--color-border-primary, #f0f0f0)",
    color: "var(--color-text-primary, #1a1a1a)",
  },
  stockBadge: {
    display: "inline-block",
    padding: "2px 10px",
    borderRadius: "var(--border-radius-sm, 4px)",
    fontSize: "12px",
    fontWeight: "var(--font-weight-medium, 500)" as React.CSSProperties["fontWeight"],
  },
  productCount: {
    fontSize: "var(--font-text-sm-size, 13px)",
    color: "var(--color-text-secondary, #666)",
    marginBottom: "12px",
  },
  clearBtn: {
    padding: "6px 14px",
    borderRadius: "var(--border-radius-md, 8px)",
    border: "1px solid var(--color-border-primary, #e5e5e5)",
    background: "transparent",
    color: "var(--color-text-secondary, #666)",
    cursor: "pointer",
    fontSize: "var(--font-text-sm-size, 13px)",
    alignSelf: "flex-end",
  },
};

// ── Sub-components ─────────────────────────────────────────────────────────

function ProductsView({ products, categories }: { products: Product[]; categories: string[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [stockFilter, setStockFilter] = useState<"all" | "yes" | "no">("all");
  const [sortCol, setSortCol] = useState<"id" | "name" | "category" | "price" | "inStock">("id");
  const [sortAsc, setSortAsc] = useState(true);

  const filtered = useMemo(() => {
    let result = [...products];
    if (query) {
      const q = query.toLowerCase();
      result = result.filter((p) => p.name.toLowerCase().includes(q));
    }
    if (category) {
      result = result.filter((p) => p.category === category);
    }
    if (minPrice) {
      const min = parseFloat(minPrice);
      if (!isNaN(min)) result = result.filter((p) => p.price >= min);
    }
    if (maxPrice) {
      const max = parseFloat(maxPrice);
      if (!isNaN(max)) result = result.filter((p) => p.price <= max);
    }
    if (stockFilter !== "all") {
      result = result.filter((p) => p.inStock === (stockFilter === "yes"));
    }
    result.sort((a, b) => {
      let cmp = 0;
      if (sortCol === "id") cmp = a.id - b.id;
      else if (sortCol === "name") cmp = a.name.localeCompare(b.name);
      else if (sortCol === "category") cmp = a.category.localeCompare(b.category);
      else if (sortCol === "price") cmp = a.price - b.price;
      else if (sortCol === "inStock") cmp = Number(a.inStock) - Number(b.inStock);
      return sortAsc ? cmp : -cmp;
    });
    return result;
  }, [products, query, category, minPrice, maxPrice, stockFilter, sortCol, sortAsc]);

  const handleSort = (col: typeof sortCol) => {
    if (sortCol === col) setSortAsc((prev) => !prev);
    else { setSortCol(col); setSortAsc(true); }
  };

  const clearFilters = () => {
    setQuery(""); setCategory(""); setMinPrice(""); setMaxPrice(""); setStockFilter("all");
  };

  const hasFilters = query || category || minPrice || maxPrice || stockFilter !== "all";
  const sortArrow = (col: typeof sortCol) => sortCol === col ? (sortAsc ? " ↑" : " ↓") : "";

  if (products.length === 0) {
    return <div style={S.empty}>No product data available. Use the "Search Products" tool to load a product catalogue.</div>;
  }

  return (
    <div>
      {/* Filters */}
      <div style={S.productFilters}>
        <div style={S.filterGroup}>
          <span style={S.filterLabel}>Search</span>
          <input
            style={{ ...S.filterInput, width: "200px" }}
            placeholder="Search products…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div style={S.filterGroup}>
          <span style={S.filterLabel}>Category</span>
          <select style={S.filterSelect} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All Categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div style={S.filterGroup}>
          <span style={S.filterLabel}>Min Price</span>
          <input
            style={{ ...S.filterInput, width: "90px" }}
            type="number"
            min="0"
            step="0.01"
            placeholder="$0"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
          />
        </div>
        <div style={S.filterGroup}>
          <span style={S.filterLabel}>Max Price</span>
          <input
            style={{ ...S.filterInput, width: "90px" }}
            type="number"
            min="0"
            step="0.01"
            placeholder="$999"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
          />
        </div>
        <div style={S.filterGroup}>
          <span style={S.filterLabel}>Stock</span>
          <select style={S.filterSelect} value={stockFilter} onChange={(e) => setStockFilter(e.target.value as "all" | "yes" | "no")}>
            <option value="all">All</option>
            <option value="yes">In Stock</option>
            <option value="no">Out of Stock</option>
          </select>
        </div>
        {hasFilters && (
          <button style={S.clearBtn} onClick={clearFilters}>Clear Filters</button>
        )}
      </div>

      {/* Result count */}
      <p style={S.productCount}>
        Showing {filtered.length} of {products.length} product{products.length !== 1 ? "s" : ""}
      </p>

      {/* Table */}
      <table style={S.productTable}>
        <thead>
          <tr>
            <th style={S.productTh} onClick={() => handleSort("id")}>#{ sortArrow("id")}</th>
            <th style={S.productTh} onClick={() => handleSort("name")}>Product{sortArrow("name")}</th>
            <th style={S.productTh} onClick={() => handleSort("category")}>Category{sortArrow("category")}</th>
            <th style={S.productTh} onClick={() => handleSort("price")}>Price{sortArrow("price")}</th>
            <th style={S.productTh} onClick={() => handleSort("inStock")}>Stock{sortArrow("inStock")}</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((p) => (
            <tr key={p.id}>
              <td style={S.productTd}>{p.id}</td>
              <td style={{ ...S.productTd, fontWeight: "var(--font-weight-medium, 500)" as React.CSSProperties["fontWeight"] }}>{p.name}</td>
              <td style={S.productTd}>
                <span style={{ ...S.badge, background: accentFor(categories.indexOf(p.category)), color: "#fff" }}>
                  {p.category}
                </span>
              </td>
              <td style={{ ...S.productTd, fontFamily: "var(--font-mono, monospace)" }}>${p.price.toFixed(2)}</td>
              <td style={S.productTd}>
                <span style={{
                  ...S.stockBadge,
                  background: p.inStock ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.12)",
                  color: p.inStock ? "#059669" : "#dc2626",
                }}>
                  {p.inStock ? "In Stock" : "Out of Stock"}
                </span>
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={5} style={{ ...S.productTd, textAlign: "center", color: "var(--color-text-secondary, #888)", padding: "32px" }}>
                No products match your filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Root ────────────────────────────────────────────────────────────────────

function MarkdownViewerApp() {
  const [toolResult, setToolResult] = useState<CallToolResult | null>(null);
  const [toolInput, setToolInput] = useState<ToolPayload | null>(null);
  const [hostContext, setHostContext] = useState<McpUiHostContext | undefined>();

  const { app, error } = useApp({
    appInfo: { name: "Markdown Viewer", version: "1.0.0" },
    capabilities: {},
    onAppCreated: (app) => {
      app.onteardown = async () => ({ });

      app.ontoolinput = async (input) => {
        const args = input.arguments as { filePaths?: string[] } | undefined;
        if (args?.filePaths) {
          setToolInput(null);
        }
      };

      app.ontoolresult = async (result) => {
        setToolResult(result);
        const sc = result.structuredContent as ToolPayload | undefined;
        if (sc) setToolInput(sc);
      };

      app.ontoolcancelled = (params) => {
        console.info("Tool call cancelled:", params.reason);
      };

      app.onerror = console.error;

      app.onhostcontextchanged = (params) => {
        setHostContext((prev) => ({ ...prev, ...params }));
      };
    },
  });

  useHostStyles(app ?? null);

  useEffect(() => {
    if (app) setHostContext(app.getHostContext());
  }, [app]);

  if (error) return <div style={{ padding: 16 }}><strong>ERROR:</strong> {error.message}</div>;
  if (!app) return <div style={{ padding: 16 }}>Connecting…</div>;

  return (
    <MarkdownViewerInner
      app={app}
      payload={toolInput}
      toolResult={toolResult}
      hostContext={hostContext}
    />
  );
}

interface InnerProps {
  app: App;
  payload: ToolPayload | null;
  toolResult: CallToolResult | null;
  hostContext?: McpUiHostContext;
}

function MarkdownViewerInner({ payload, hostContext }: InnerProps) {
  const products = payload?.products ?? [];
  const productCategories = payload?.categories ?? [];

  const safePad = hostContext?.safeAreaInsets;

  if (products.length === 0) {
    return (
      <div style={{ ...S.app, paddingTop: safePad?.top, paddingRight: safePad?.right, paddingBottom: safePad?.bottom, paddingLeft: safePad?.left }}>
        <div style={S.empty}>Waiting for product data…</div>
      </div>
    );
  }

  return (
    <div style={{ ...S.app, paddingTop: safePad?.top, paddingRight: safePad?.right, paddingBottom: safePad?.bottom, paddingLeft: safePad?.left }}>
      {/* Body */}
      <div style={S.body}>
        <ProductsView products={products} categories={productCategories} />
      </div>
    </div>
  );
}

// ── Mount ──────────────────────────────────────────────────────────────────

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MarkdownViewerApp />
  </StrictMode>,
);
