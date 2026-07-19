import assert from "node:assert/strict";
import { extOf, languageForExtension, tokenClassForNodeType } from "./highlight";

assert.equal(languageForExtension("tsx"), "tsx");
assert.equal(languageForExtension("mts"), "typescript");
assert.equal(languageForExtension("rs"), "rust");
assert.equal(languageForExtension("unknown"), null);

assert.equal(tokenClassForNodeType("comment", "// note"), "com");
assert.equal(tokenClassForNodeType("string_fragment", "hello"), "str");
assert.equal(tokenClassForNodeType("property_identifier", "theme"), "prop");
assert.equal(tokenClassForNodeType("type_identifier", "EditorApp"), "typ");
assert.equal(tokenClassForNodeType("string", "string", "type_annotation"), "typ");
assert.equal(tokenClassForNodeType("string", "string", "predefined_type"), "typ");
assert.equal(tokenClassForNodeType("identifier", "total", "function_declaration"), "fn");
assert.equal(tokenClassForNodeType("identifier", "get", "method_invocation", "function"), "fn");
assert.equal(tokenClassForNodeType("identifier", "lookup", "method_invocation", "variable"), "var");
assert.equal(tokenClassForNodeType("identifier", "account", ["member_expression", "assignment_expression"]), "var");
assert.equal(tokenClassForNodeType(".", ".", ["member_expression"]), "op");
assert.equal(tokenClassForNodeType("identifier", "field", "field_access", "property"), "prop");
assert.equal(tokenClassForNodeType("identifier", "itemObj", "formal_parameter", "parameter"), "param");
assert.equal(tokenClassForNodeType("identifier", "MAX_RETRIES"), "const");
assert.equal(tokenClassForNodeType("true", "true"), "bool");
assert.equal(tokenClassForNodeType("null", "null"), "null");
assert.equal(tokenClassForNodeType("undefined", "undefined"), "null");
assert.equal(tokenClassForNodeType("+", "+"), "op");
assert.equal(tokenClassForNodeType("=", "="), "op");
assert.equal(tokenClassForNodeType(";", ";"), "punc");
assert.equal(tokenClassForNodeType("{", "{"), "punc");
assert.equal(tokenClassForNodeType("identifier", "value"), "var");
assert.equal(tokenClassForNodeType("identifier", "const"), "kw");

assert.equal(extOf("src/lib/Foo.tsx"), "tsx");
assert.equal(extOf("Makefile"), "makefile");

console.log("highlight: ok");
