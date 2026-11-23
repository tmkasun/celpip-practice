const { fork, spawn } = require("node:child_process");
const path = require("node:path");
const { proxy } = require("../package.json");

const root = path.join(__dirname, "..");
const clientScript = require.resolve("react-scripts/scripts/start");
const api = fork(path.join(__dirname, "index.cjs"), {
  cwd: root,
  env: { ...process.env, PORT: new URL(proxy).port },
  execArgv: ["--env-file-if-exists=.env.server"],
});
let client;
let stopping = false;

function stop(exitCode) {
  if (stopping) return;
  stopping = true;
  process.exitCode = exitCode;
  for (const child of [api, client]) {
    if (child?.pid && child.exitCode === null && child.signalCode === null) child.kill();
  }
}

function watch(child, name) {
  child.once("error", (error) => {
    if (stopping) return;
    console.error("Could not run " + name + ". " + error.message);
    stop(1);
  });
  child.once("exit", (code, signal) => {
    if (stopping) return;
    if (child === client && code === 0) {
      stop(0);
      return;
    }
    console.error(name + " stopped (" + (signal ?? "exit code " + code) + ").");
    stop(code || 1);
  });
}

watch(api, "the Writing API");
api.once("message", (message) => {
  if (message !== "listening" || stopping) return;
  // Run the React entry point directly so shutdown reaches the dev server.
  client = spawn(process.execPath, [clientScript, ...process.argv.slice(2)], {
    cwd: root,
    stdio: "inherit",
  });
  watch(client, "the React dev server");
});

process.once("SIGINT", () => stop(130));
process.once("SIGTERM", () => stop(143));
