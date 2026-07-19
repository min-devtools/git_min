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

equal(fileIcon("Dockerfile"), "file-docker");
equal(fileIcon("Dockerfile-dev"), "file-docker");
equal(fileIcon("docker-compose.yml"), "file-docker");
equal(fileIcon(".dockerignore"), "file-docker");

equal(fileIcon("package.json"), "file-npm");
equal(fileIcon("package-lock.json"), "file-npm");
equal(fileIcon("yarn.lock"), "file-yarn");
equal(fileIcon("pnpm-lock.yaml"), "file-pnpm");
equal(fileIcon("pnpm-workspace.yaml"), "file-pnpm");
equal(fileIcon("composer.json"), "file-php");
equal(fileIcon("Gemfile"), "file-gemfile");
equal(fileIcon("Gemfile.lock"), "file-gemfile");
equal(fileIcon("Cargo.toml"), "file-rust");
equal(fileIcon("Cargo.lock"), "file-rust");
equal(fileIcon("build.gradle"), "file-gradle");
equal(fileIcon(".editorconfig"), "file-editorconfig");
equal(fileIcon(".eslintrc.json"), "file-eslint");
equal(fileIcon(".prettierrc"), "file-prettier");

console.log("file icons: all assertions passed");
