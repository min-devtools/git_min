import Parser from "web-tree-sitter";
import bashWasmUrl from "tree-sitter-wasms/out/tree-sitter-bash.wasm?url";
import cWasmUrl from "tree-sitter-wasms/out/tree-sitter-c.wasm?url";
import cppWasmUrl from "tree-sitter-wasms/out/tree-sitter-cpp.wasm?url";
import csharpWasmUrl from "tree-sitter-wasms/out/tree-sitter-c_sharp.wasm?url";
import cssWasmUrl from "tree-sitter-wasms/out/tree-sitter-css.wasm?url";
import dartWasmUrl from "tree-sitter-wasms/out/tree-sitter-dart.wasm?url";
import goWasmUrl from "tree-sitter-wasms/out/tree-sitter-go.wasm?url";
import htmlWasmUrl from "tree-sitter-wasms/out/tree-sitter-html.wasm?url";
import javaWasmUrl from "tree-sitter-wasms/out/tree-sitter-java.wasm?url";
import javascriptWasmUrl from "tree-sitter-wasms/out/tree-sitter-javascript.wasm?url";
import jsonWasmUrl from "tree-sitter-wasms/out/tree-sitter-json.wasm?url";
import kotlinWasmUrl from "tree-sitter-wasms/out/tree-sitter-kotlin.wasm?url";
import pythonWasmUrl from "tree-sitter-wasms/out/tree-sitter-python.wasm?url";
import rubyWasmUrl from "tree-sitter-wasms/out/tree-sitter-ruby.wasm?url";
import rustWasmUrl from "tree-sitter-wasms/out/tree-sitter-rust.wasm?url";
import tomlWasmUrl from "tree-sitter-wasms/out/tree-sitter-toml.wasm?url";
import tsxWasmUrl from "tree-sitter-wasms/out/tree-sitter-tsx.wasm?url";
import typescriptWasmUrl from "tree-sitter-wasms/out/tree-sitter-typescript.wasm?url";
import yamlWasmUrl from "tree-sitter-wasms/out/tree-sitter-yaml.wasm?url";
import { escapeHtml } from "./format";
import { languageForExtension, tokenClassForNodeType, type SyntaxRole, type TreeSitterLanguage } from "./highlight";

const coreWasmUrl = new URL("../../node_modules/web-tree-sitter/tree-sitter.wasm", import.meta.url).href;

const LANGUAGE_URLS: Record<TreeSitterLanguage, string> = {
  bash: bashWasmUrl, c: cWasmUrl, cpp: cppWasmUrl, c_sharp: csharpWasmUrl, css: cssWasmUrl,
  dart: dartWasmUrl, go: goWasmUrl, html: htmlWasmUrl, java: javaWasmUrl,
  javascript: javascriptWasmUrl, json: jsonWasmUrl, kotlin: kotlinWasmUrl, python: pythonWasmUrl,
  ruby: rubyWasmUrl, rust: rustWasmUrl, toml: tomlWasmUrl, tsx: tsxWasmUrl, typescript: typescriptWasmUrl, yaml: yamlWasmUrl,
};

type Span = { start: number; end: number; className: string };
const languageCache = new Map<TreeSitterLanguage, Promise<Parser.Language>>();
let parserReady: Promise<void> | null = null;

function loadLanguage(language: TreeSitterLanguage): Promise<Parser.Language> {
  parserReady ??= Parser.init({ locateFile: () => coreWasmUrl });
  let cached = languageCache.get(language);
  if (!cached) {
    cached = parserReady.then(() => Parser.Language.load(LANGUAGE_URLS[language]));
    languageCache.set(language, cached);
  }
  return cached;
}

function containsNode(parent: Parser.SyntaxNode | null | undefined, node: Parser.SyntaxNode): boolean {
  return Boolean(parent && parent.startIndex <= node.startIndex && parent.endIndex >= node.endIndex);
}

function semanticRole(node: Parser.SyntaxNode): SyntaxRole | undefined {
  let fallbackRole: SyntaxRole | undefined;
  for (let ancestor = node.parent, depth = 0; ancestor && depth < 5; ancestor = ancestor.parent, depth++) {
    const type = ancestor.type.toLowerCase();
    if (type.includes("call") || type.includes("invocation")) {
      const callable = ancestor.childForFieldName("function") ?? ancestor.childForFieldName("name");
      if (containsNode(callable, node)) {
        if (callable?.childCount === 0) return "function";
        const calledMember = callable?.childForFieldName("property")
          ?? callable?.childForFieldName("field")
          ?? callable?.childForFieldName("name")
          ?? null;
        if (containsNode(calledMember, node)) return "function";
      }
    }
    if (type.includes("new_expression") || type.includes("object_creation")) {
      const constructor = ancestor.childForFieldName("constructor") ?? ancestor.childForFieldName("type");
      if (containsNode(constructor, node)) return "type";
    }
    const name = ancestor.childForFieldName("name");
    const property = ancestor.childForFieldName("property") ?? ancestor.childForFieldName("field");
    if (containsNode(property, node)) {
      fallbackRole ??= "property";
      continue;
    }
    if (!containsNode(name, node)) continue;
    if (type.includes("parameter")) return "parameter";
    if (type.includes("class") || type.includes("interface") || type.includes("enum") || type.includes("type_")) return "type";
    if (type.includes("field") || type.includes("property") || type.includes("pair")) return "property";
    if (type.includes("function") || type.includes("method") || type.includes("call") || type.includes("constructor")) return "function";
  }
  return fallbackRole;
}

function collectLeafSpans(node: Parser.SyntaxNode, lines: string[], spans: Span[][]): void {
  if (node.childCount > 0) {
    for (const child of node.children) collectLeafSpans(child, lines, spans);
    return;
  }
  const startRow = node.startPosition.row;
  const endRow = node.endPosition.row;
  if (startRow >= lines.length) return;
  const sample = startRow === endRow
    ? lines[startRow].slice(node.startPosition.column, node.endPosition.column)
    : lines[startRow].slice(node.startPosition.column);
  const ancestors: string[] = [];
  for (let ancestor = node.parent; ancestor && ancestors.length < 5; ancestor = ancestor.parent) {
    ancestors.push(ancestor.type);
  }
  const className = tokenClassForNodeType(node.type, sample, ancestors, semanticRole(node));
  if (!className) return;
  for (let row = startRow; row <= Math.min(endRow, lines.length - 1); row++) {
    const start = row === startRow ? node.startPosition.column : 0;
    const end = row === endRow ? node.endPosition.column : lines[row].length;
    if (end > start) spans[row].push({ start, end, className });
  }
}

function renderLine(line: string, spans: Span[]): string {
  let cursor = 0;
  let html = "";
  for (const span of spans.sort((a, b) => a.start - b.start || b.end - a.end)) {
    if (span.start < cursor) continue;
    html += escapeHtml(line.slice(cursor, span.start));
    html += `<span class="tok-${span.className}">${escapeHtml(line.slice(span.start, span.end))}</span>`;
    cursor = span.end;
  }
  return html + escapeHtml(line.slice(cursor));
}

/** Parse complete reconstructed source so multiline strings/comments retain grammar state. */
export async function highlightSourceLines(lines: string[], ext: string): Promise<string[]> {
  const languageName = languageForExtension(ext);
  if (!languageName || !lines.length) return lines.map(escapeHtml);
  try {
    const language = await loadLanguage(languageName);
    const parser = new Parser();
    parser.setLanguage(language);
    const tree = parser.parse(lines.join("\n"));
    if (!tree) return lines.map(escapeHtml);
    const spans = lines.map(() => [] as Span[]);
    collectLeafSpans(tree.rootNode, lines, spans);
    const result = lines.map((line, row) => renderLine(line, spans[row]));
    tree.delete();
    parser.delete();
    return result;
  } catch (error) {
    console.warn("Tree-sitter highlight failed", error);
    return lines.map(escapeHtml);
  }
}
