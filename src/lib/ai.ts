import { invoke } from "@tauri-apps/api/core";
import { useApp } from "../store";
import { stagedDiff } from "./git";
import { condenseDiff } from "./gitUi";

export interface ChatMsg {
  role: "user" | "assistant" | "system";
  content: string;
}

const SYSTEM = `You write concise Conventional Commits commit messages. Return exactly one line.
No markdown. No fences. No quotes. No explanations. Lowercase after the type/scope.
Imperative mood. Under 72 characters when possible. Describe what changed and why,
never restate the diff line by line.`;

/** Ask the configured OpenAI-compatible provider. Returns raw assistant text. */
export async function askAi(messages: ChatMsg[]): Promise<string> {
  const { aiProvider } = useApp.getState();
  if (!aiProvider.model) throw new Error("No AI model configured — set one in Settings.");
  return invoke<string>("ai_chat", {
    endpoint: aiProvider.endpoint,
    apiKey: aiProvider.apiKey,
    model: aiProvider.model,
    messages,
  });
}

/** Read the staged diff and turn it into a commit message.
 *  `prefix` is whatever already sits in the commit box (e.g. "feat(auth):") — the
 *  model then only writes the part after it, lazygit custom-command style. */
export async function generateCommitMessage(path: string, prefix = ""): Promise<string> {
  const diff = await stagedDiff(path);
  if (!diff.trim()) throw new Error("Nothing staged — stage some files first.");
  // only the ± lines and file/hunk headers travel — naming a change never needed
  // the context lines, and the full diff burned tokens for nothing
  const clipped = condenseDiff(diff);
  const head = prefix.trim().replace(/\s+$/, "");
  const user = head
    ? `Condensed staged diff (only changed lines):\n\n${clipped}\n\nThe user already chose this Conventional Commit prefix:\n${head}\n\nReturn only the text that should come after that prefix. Do not repeat the prefix. Keep it short and specific.`
    : `Condensed staged diff (only changed lines):\n\n${clipped}\n\nReturn one complete Conventional Commit message, for example: fix(auth): refresh expired session`;
  const text = await askAi([
    { role: "system", content: SYSTEM },
    { role: "user", content: user },
  ]);
  const message = text.replace(/^```[a-z]*\n?|```$/g, "").replace(/\s+/g, " ").trim();
  if (!message) throw new Error("The provider returned an empty commit message.");
  if (!head) return message;
  // the model often echoes the prefix anyway — strip it before re-joining
  const rest = message.startsWith(head) ? message.slice(head.length).trim() : message;
  return `${head} ${rest}`.trim();
}
