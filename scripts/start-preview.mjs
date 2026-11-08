import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const address = "http://localhost:5180/";

async function isRunning() {
  try {
    const response = await fetch(address, {
      signal: AbortSignal.timeout(1000),
    });
    return (
      response.ok &&
      (await response.text()).includes("<title>POS ISFINALS")
    );
  } catch {
    return false;
  }
}

async function start() {
  if (await isRunning()) {
    console.log(`POS is already running: ${address}`);
    return;
  }

  const expo = join(root, "node_modules", "expo", "bin", "cli");
  if (!existsSync(expo)) {
    throw new Error("Install dependencies with npm ci, then run npm start again.");
  }

  const logDirectory = join(root, ".qa");
  mkdirSync(logDirectory, { recursive: true });
  const logPath = join(logDirectory, "preview-server.log");
  const log = openSync(logPath, "a");
  let server;
  try {
    server = spawn(
      process.execPath,
      [expo, "start", "--web", "--port", "5180"],
      {
        cwd: root,
        detached: true,
        windowsHide: true,
        env: { ...process.env, APP_ENV: 'development', CI: 'false', EXPO_NO_TELEMETRY: '1' },
        stdio: ["ignore", log, log],
      },
    );
    await new Promise((resolve, reject) => {
      server.once("spawn", resolve);
      server.once("error", reject);
    });
    server.unref();
  } finally {
    closeSync(log);
  }

  for (let attempt = 0; attempt < 90; attempt += 1) {
    if (await isRunning()) {
      console.log(`POS is running in the background: ${address}`);
      console.log("After restarting your computer, run Start POS.cmd or npm start again.");
      return;
    }
    if (server.exitCode !== null) break;
    await delay(500);
  }

  throw new Error(`The preview could not start. Check ${logPath} for details.`);
}

start().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
