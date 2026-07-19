export type TreeSitterLanguage =
  | "bash" | "c" | "cpp" | "c_sharp" | "css" | "dart" | "go" | "html"
  | "java" | "javascript" | "json" | "kotlin" | "python" | "rust" | "toml"
  | "tsx" | "typescript" | "yaml";

const EXTENSIONS: Record<string, TreeSitterLanguage> = {
  bash: "bash", sh: "bash", zsh: "bash", c: "c", h: "c",
  cc: "cpp", cpp: "cpp", cxx: "cpp", hpp: "cpp", hxx: "cpp", cs: "c_sharp",
  css: "css", scss: "css", dart: "dart", go: "go", htm: "html", html: "html",
  java: "java", js: "javascript", cjs: "javascript", mjs: "javascript", jsx: "javascript",
  json: "json", jsonc: "json", kt: "kotlin", kts: "kotlin", py: "python", pyw: "python",
  rs: "rust", toml: "toml", tsx: "tsx", ts: "typescript", cts: "typescript", mts: "typescript",
  yaml: "yaml", yml: "yaml",
};

const KEYWORDS = new Set([
  "abstract", "as", "async", "await", "break", "case", "catch", "class", "const", "continue",
  "crate", "def", "defer", "do", "else", "enum", "export", "extends", "final", "finally", "fn",
  "for", "from", "func", "function", "go", "if", "impl", "import", "in", "instanceof", "interface", "let", "match",
  "mod", "native", "new", "of", "package", "permits", "private", "protected", "pub", "public", "readonly", "record",
  "return", "sealed", "static", "strictfp", "struct", "super", "switch", "synchronized", "this", "throw", "throws",
  "trait", "transient", "try", "type", "typeof", "use", "var", "void", "volatile", "while", "with", "yield",
]);

const PUNCTUATION_RE = /^[()[\]{},;:?]$/;
const OPERATOR_RE = /^(?:[+\-*/%=&|!<>^~?:]+|=>|\.{1,3})$/;
const BUILTIN_TYPES = new Set(["any", "bool", "boolean", "byte", "char", "double", "float", "int", "long", "never", "number", "object", "short", "str", "string", "u8", "u16", "u32", "u64", "usize", "void"]);

export function extOf(file: string): string {
  const base = file.split("/").pop() ?? "";
  const i = base.lastIndexOf(".");
  return i > 0 ? base.slice(i + 1).toLowerCase() : base.toLowerCase();
}

export function languageForExtension(ext: string): TreeSitterLanguage | null {
  return EXTENSIONS[ext.toLowerCase()] ?? null;
}

export type SyntaxRole = "function" | "property" | "parameter" | "type" | "variable";

export function tokenClassForNodeType(
  type: string,
  text: string,
  parentTypes: string | string[] = "",
  role?: SyntaxRole,
): string | null {
  const normalized = type.toLowerCase();
  const parents = (Array.isArray(parentTypes) ? parentTypes : [parentTypes]).map((parent) => parent.toLowerCase());
  const parent = parents.join(" ");
  const legacyParentContext = typeof parentTypes === "string";
  if (normalized.includes("comment")) return "com";
  if (parent.includes("type") && BUILTIN_TYPES.has(text)) return "typ";
  if (normalized.includes("string") || normalized.includes("template") || normalized === "char_literal" || normalized.includes("regex")) return "str";
  if (normalized.includes("number") || normalized.includes("integer") || normalized.includes("float")) return "num";
  if (normalized === "true" || normalized === "false" || normalized === "boolean") return "bool";
  if (normalized === "null" || normalized === "nil" || normalized === "none" || normalized === "undefined") return "null";
  if (KEYWORDS.has(text) || normalized.endsWith("_keyword")) return "kw";
  if (role === "function") return "fn";
  if (role === "property") return "prop";
  if (role === "parameter") return "param";
  if (role === "type") return "typ";
  if (role === "variable") return "var";
  if (normalized.includes("type") || normalized === "class_name" || normalized === "namespace_name") return "typ";
  if (normalized.includes("property") || normalized.includes("field") || (legacyParentContext && (parent.includes("member_expression") || parent.includes("pair")))) return "prop";
  if (normalized.includes("function") || normalized.includes("method") || (legacyParentContext && (parent.includes("call_expression") || parent.includes("function_declaration")))) return "fn";
  if (normalized.includes("tag_name") || normalized.includes("attribute_name")) return "tag";
  if (/^[A-Z][A-Z0-9_]*$/.test(text) && text.includes("_")) return "const";
  if (normalized === "identifier" || normalized.endsWith("_identifier") || normalized === "variable_name") return "var";
  if (PUNCTUATION_RE.test(text) || normalized === "punctuation") return "punc";
  if (OPERATOR_RE.test(text) || normalized.includes("operator")) return "op";
  return null;
}
