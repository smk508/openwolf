import * as path from "node:path";

// Keep in sync with CODE_EXTENSIONS in src/scanner/anatomy-scanner.ts
const CODE_EXTS = new Set([
  ".ts", ".js", ".tsx", ".jsx", ".py", ".rs", ".go", ".java",
  ".c", ".cpp", ".h", ".css", ".scss", ".sql", ".sh", ".yaml",
  ".yml", ".json", ".toml", ".xml", ".dart",
  ".kt", ".kts", ".swift", ".m", ".mm",
  ".hpp", ".hh", ".cc", ".cxx",
  ".cs", ".rb", ".php", ".lua",
  ".vue", ".svelte", ".html", ".htm",
  ".proto", ".graphql", ".gql", ".tf",
  ".bash", ".zsh", ".fish",
]);

const PROSE_EXTS = new Set([".md", ".txt", ".rst", ".adoc"]);

export type ContentType = "code" | "prose" | "mixed";

export function detectContentType(filePath: string): ContentType {
  const ext = path.extname(filePath).toLowerCase();
  if (CODE_EXTS.has(ext)) return "code";
  if (PROSE_EXTS.has(ext)) return "prose";
  return "mixed";
}

export function estimateTokens(
  text: string,
  type: ContentType = "mixed"
): number {
  const ratio = type === "code" ? 3.5 : type === "prose" ? 4.0 : 3.75;
  return Math.ceil(text.length / ratio);
}
