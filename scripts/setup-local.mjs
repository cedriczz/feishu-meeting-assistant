#!/usr/bin/env node
import { copyFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const isMacMode = args.includes("--mac") || process.platform === "darwin";
const envExample = join(root, ".env.example");
const envPath = join(root, ".env");

console.log("Feishu Meeting Assistant local setup");
console.log(`Repository: ${root}`);
console.log("");

if (!existsSync(envPath)) {
  copyFileSync(envExample, envPath);
  console.log("[ok] Created .env from .env.example");
} else {
  console.log("[ok] .env already exists");
}

console.log("");
const doctorArgs = [join(root, "scripts", "doctor.mjs")];
if (isMacMode) doctorArgs.push("--mac");
const result = spawnSync(process.execPath, doctorArgs, {
  cwd: root,
  stdio: "inherit",
  windowsHide: true
});

console.log("");
console.log("Next commands:");
console.log("  npm run dev");
console.log("");
console.log("Optional re-check:");
console.log(isMacMode ? "  npm run doctor:mac" : "  npm run doctor");

process.exitCode = result.status && result.status > 0 ? result.status : 0;
