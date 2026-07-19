import { fileIcon } from "../lib/fileIcons";

function equal(actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

equal(fileIcon("src/Main.java"), "file-java");
equal(fileIcon("cmd/server.go"), "file-go");
equal(fileIcon("src/app.js"), "file-javascript");
equal(fileIcon("src/app.jsx"), "file-react");
equal(fileIcon("src/app.ts"), "file-typescript");
equal(fileIcon("src/app.tsx"), "file-react");
equal(fileIcon("src/unknown.xyz"), "file");

console.log("file icons: all assertions passed");
