import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const children = [];
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
  process.exitCode = code;
}
function start(binary, args) {
  const child = spawn(binary, args, { stdio: "inherit", windowsHide: true });
  children.push(child);
  child.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on("exit", (code) => stop(code ?? 1));
}
if (process.env.BACKGROUND_PROVIDER === "local") {
  const python =
    process.platform === "win32"
      ? ".venv/Scripts/python.exe"
      : ".venv/bin/python";
  if (!existsSync(python))
    throw Error(
      "Install the local Python model dependencies from the README first.",
    );
  start(python, ["local-provider/server.py"]);
}
start(process.execPath, ["worker/index.mjs"]);
start(process.execPath, [
  require.resolve("next/dist/bin/next"),
  "dev",
  "--hostname",
  "127.0.0.1",
]);
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
