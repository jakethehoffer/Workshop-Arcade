import { readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptsDir = path.join(repoRoot, "scripts");
const entries = await readdir(scriptsDir, { withFileTypes: true });
const scriptFiles = entries
  .filter((entry) => entry.isFile() && entry.name.endsWith(".mjs"))
  .map((entry) => path.join(scriptsDir, entry.name))
  .sort((a, b) => a.localeCompare(b));
const failures = [];

for (const file of scriptFiles) {
  const result = await nodeCheck(file);
  if (result.code !== 0) failures.push({ file, stderr: result.stderr.trim(), stdout: result.stdout.trim() });
}

if (failures.length) {
  console.error("Tool syntax checks failed:");
  for (const failure of failures) {
    console.error(`- ${path.relative(repoRoot, failure.file)}`);
    if (failure.stderr) console.error(failure.stderr);
    if (failure.stdout) console.error(failure.stdout);
  }
  process.exit(1);
}

console.log(`Tool syntax checks passed for ${scriptFiles.length} Node scripts.`);

function nodeCheck(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--check", file], { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.on("error", (error) => resolve({ code: 1, stdout, stderr: error.message }));
  });
}
