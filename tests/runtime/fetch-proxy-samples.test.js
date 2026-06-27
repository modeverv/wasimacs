import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { access, mkdir, readFile, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn } from "node:child_process";
import { request as httpsRequest } from "node:https";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

async function executableExists(command) {
  const path = process.env.PATH || "";
  for (const dir of path.split(":")) {
    try {
      await access(join(dir, command), constants.X_OK);
      return true;
    } catch {
      // Keep searching PATH.
    }
  }
  return false;
}

async function getFreePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function startUpstream() {
  const server = createServer((request, response) => {
    if (request.url === "/packages/archive-contents") {
      response.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Wasmacs-Upstream": "ok",
      });
      response.end("archive-data");
      return;
    }
    response.writeHead(404);
    response.end("not found");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server;
}

async function waitForProxy(port, processRef) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (processRef.exitCode !== null) {
      throw new Error(`proxy exited before becoming ready: ${processRef.stderrText || processRef.stdoutText}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`, { method: "GET" });
      if (response.status === 405 || response.status === 400) return;
    } catch {
      // Retry while the runtime starts.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`proxy did not start on port ${port}`);
}

async function waitForHttpsProxy(port, processRef) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (processRef.exitCode !== null) {
      throw new Error(`proxy exited before becoming ready: ${processRef.stderrText || processRef.stdoutText}`);
    }
    try {
      const response = await insecureHttpsJsonRequest({
        port,
        method: "GET",
        path: "/",
      });
      if (response.status === 405 || response.status === 400) return;
    } catch {
      // Retry while the runtime starts.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`HTTPS proxy did not start on port ${port}`);
}

async function insecureHttpsJsonRequest({ port, method, path = "/", headers = {}, body }) {
  return await new Promise((resolve, reject) => {
    const request = httpsRequest({
      hostname: "127.0.0.1",
      port,
      path,
      method,
      headers,
      rejectUnauthorized: false,
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({
          status: response.statusCode,
          headers: response.headers,
          text,
          json: text && /^[[{]/.test(text.trim()) ? JSON.parse(text) : null,
        });
      });
    });
    request.on("error", reject);
    if (body) request.write(body);
    request.end();
  });
}

async function startProxy({ command, args, env }) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdoutText = "";
  child.stderrText = "";
  child.stdout.on("data", (chunk) => {
    child.stdoutText += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    child.stderrText += chunk.toString();
  });
  return child;
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
  await Promise.race([
    once(child, "exit"),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
  if (child.exitCode === null) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }
}

async function assertProxyWorks(sample) {
  const upstream = await startUpstream();
  const upstreamPort = upstream.address().port;
  const proxyPort = await getFreePort();
  const allowedOrigin = `http://127.0.0.1:${upstreamPort}`;
  const pageOrigin = "https://modeverv.github.io";
  const targetUrl = `${allowedOrigin}/packages/archive-contents`;
  const child = await startProxy(sample.start(proxyPort, allowedOrigin));
  try {
    await waitForProxy(proxyPort, child);
    const preflight = await fetch(`http://127.0.0.1:${proxyPort}/`, {
      method: "OPTIONS",
      headers: {
        Origin: pageOrigin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
        "Access-Control-Request-Private-Network": "true",
      },
    });
    assert.equal([200, 204].includes(preflight.status), true);
    assert.equal(preflight.headers.get("access-control-allow-origin"), pageOrigin);
    assert.equal(preflight.headers.get("access-control-allow-private-network"), "true");
    assert.match(preflight.headers.get("vary") || "", /Origin/);
    assert.match(preflight.headers.get("access-control-allow-methods") || "", /POST/);
    assert.match(preflight.headers.get("access-control-allow-headers") || "", /content-type/i);

    const response = await fetch(`http://127.0.0.1:${proxyPort}/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: pageOrigin,
      },
      body: JSON.stringify({
        url: targetUrl,
        method: "GET",
        headers: [["accept", "text/plain"]],
      }),
    });
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.equal(response.headers.get("access-control-allow-origin"), pageOrigin);
    assert.equal(response.headers.get("access-control-allow-private-network"), "true");
    assert.match(response.headers.get("vary") || "", /Origin/);
    assert.equal(payload.status, 200);
    assert.equal(Buffer.from(payload.bodyBase64, "base64").toString("utf8"), "archive-data");
    assert.equal(
      payload.headers.some((header) => header.name.toLowerCase() === "x-wasmacs-upstream"),
      true,
    );

    const denied = await fetch(`http://127.0.0.1:${proxyPort}/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/packages/archive-contents" }),
    });
    assert.equal(denied.status, 400);
    assert.match((await denied.json()).error, /not allowed/);
  } finally {
    await stopProcess(child);
    await new Promise((resolve) => upstream.close(resolve));
  }
}

async function assertRubyDefaultAllowsAnyOrigin() {
  const upstream = await startUpstream();
  const upstreamPort = upstream.address().port;
  const proxyPort = await getFreePort();
  const targetUrl = `http://127.0.0.1:${upstreamPort}/packages/archive-contents`;
  const child = await startProxy({
    command: "ruby",
    args: ["proxy/ruby/server.rb"],
    env: { PORT: String(proxyPort) },
  });
  try {
    await waitForProxy(proxyPort, child);
    const response = await fetch(`http://127.0.0.1:${proxyPort}/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:5173",
      },
      body: JSON.stringify({ url: targetUrl, method: "GET" }),
    });
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.equal(payload.status, 200);
    assert.equal(Buffer.from(payload.bodyBase64, "base64").toString("utf8"), "archive-data");
  } finally {
    await stopProcess(child);
    await new Promise((resolve) => upstream.close(resolve));
  }
}

test("fetch proxy samples document the shared wasmacs host.network.fetch contract", async () => {
  const readme = await readFile(join(repoRoot, "proxy", "README.md"), "utf8");
  const rootReadme = await readFile(join(repoRoot, "README.md"), "utf8");
  const architecture = await readFile(join(repoRoot, "ARCHITECTURE.md"), "utf8");

  assert.match(readme, /bodyBase64/);
  assert.match(readme, /WASMACS_PROXY_ALLOWED_ORIGINS/);
  assert.match(readme, /Node/);
  assert.match(readme, /PHP/);
  assert.match(readme, /Rust/);
  assert.match(readme, /Perl/);
  assert.match(readme, /Ruby/);
  assert.match(readme, /Python/);
  assert.match(readme, /PowerShell/);
  assert.match(readme, /Access-Control-Allow-Origin/);
  assert.match(readme, /Access-Control-Allow-Private-Network/);
  assert.match(rootReadme, /Network Access/);
  assert.match(rootReadme, /self-hosted fetch proxy/);
  assert.match(architecture, /self-hosted fetch proxy/);
});

test("Node fetch proxy sample fetches allowed origins and rejects others", { timeout: 30_000 }, async () => {
  await assertProxyWorks({
    start: (port, allowedOrigin) => ({
      command: "node",
      args: ["proxy/node/server.mjs"],
      env: { PORT: String(port), WASMACS_PROXY_ALLOWED_ORIGINS: allowedOrigin },
    }),
  });
});

test("PHP fetch proxy sample fetches allowed origins and rejects others", { timeout: 30_000, skip: !(await executableExists("php")) }, async () => {
  await assertProxyWorks({
    start: (port, allowedOrigin) => ({
      command: "php",
      args: ["-S", `127.0.0.1:${port}`, "proxy/php/proxy.php"],
      env: { WASMACS_PROXY_ALLOWED_ORIGINS: allowedOrigin },
    }),
  });
});

test("Rust fetch proxy sample fetches allowed origins and rejects others", { timeout: 120_000, skip: !(await executableExists("cargo")) }, async () => {
  await assertProxyWorks({
    start: (port, allowedOrigin) => ({
      command: "cargo",
      args: ["run", "--manifest-path", "proxy/rust/Cargo.toml"],
      env: { PORT: String(port), WASMACS_PROXY_ALLOWED_ORIGINS: allowedOrigin },
    }),
  });
});

test("Perl fetch proxy sample fetches allowed origins and rejects others", { timeout: 30_000, skip: !(await executableExists("perl")) }, async () => {
  await assertProxyWorks({
    start: (port, allowedOrigin) => ({
      command: "perl",
      args: ["proxy/perl/server.pl"],
      env: { PORT: String(port), WASMACS_PROXY_ALLOWED_ORIGINS: allowedOrigin },
    }),
  });
});

test("Ruby fetch proxy sample fetches allowed origins and rejects others", { timeout: 30_000, skip: !(await executableExists("ruby")) }, async () => {
  await assertProxyWorks({
    start: (port, allowedOrigin) => ({
      command: "ruby",
      args: ["proxy/ruby/server.rb"],
      env: { PORT: String(port), WASMACS_PROXY_ALLOWED_ORIGINS: allowedOrigin },
    }),
  });
});

test("Ruby fetch proxy sample defaults to all origins for localhost development", { timeout: 30_000, skip: !(await executableExists("ruby")) }, async () => {
  await assertRubyDefaultAllowsAnyOrigin();
});

test("Ruby HTTPS fetch proxy sample fetches through TLS and keeps CORS/PNA headers", { timeout: 30_000, skip: !(await executableExists("ruby")) || !(await executableExists("openssl")) }, async () => {
  const upstream = await startUpstream();
  const upstreamPort = upstream.address().port;
  const proxyPort = await getFreePort();
  const certDir = join(repoRoot, "tmp", `ruby-https-proxy-test-${process.pid}-${Date.now()}`);
  const certFile = join(certDir, "localhost.pem");
  const keyFile = join(certDir, "localhost-key.pem");
  const allowedOrigin = `http://127.0.0.1:${upstreamPort}`;
  const pageOrigin = "https://modeverv.github.io";
  const targetUrl = `${allowedOrigin}/packages/archive-contents`;
  let child;

  try {
    await mkdir(certDir, { recursive: true });
    const openssl = spawn("openssl", [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      keyFile,
      "-out",
      certFile,
      "-days",
      "1",
      "-subj",
      "/CN=127.0.0.1",
      "-addext",
      "subjectAltName=IP:127.0.0.1,DNS:localhost",
    ], { stdio: "ignore" });
    await once(openssl, "exit");
    assert.equal(openssl.exitCode, 0);

    child = await startProxy({
      command: "ruby",
      args: ["proxy/ruby/server_https.rb"],
      env: {
        PORT: String(proxyPort),
        TLS_CERT_FILE: certFile,
        TLS_KEY_FILE: keyFile,
        WASMACS_PROXY_ALLOWED_ORIGINS: allowedOrigin,
      },
    });
    await waitForHttpsProxy(proxyPort, child);
    const preflight = await insecureHttpsJsonRequest({
      port: proxyPort,
      method: "OPTIONS",
      headers: {
        Origin: pageOrigin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
        "Access-Control-Request-Private-Network": "true",
      },
    });
    assert.equal([200, 204].includes(preflight.status), true);
    assert.equal(preflight.headers["access-control-allow-origin"], pageOrigin);
    assert.equal(preflight.headers["access-control-allow-private-network"], "true");
    assert.match(preflight.headers.vary || "", /Origin/);

    const response = await insecureHttpsJsonRequest({
      port: proxyPort,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: pageOrigin,
      },
      body: JSON.stringify({
        url: targetUrl,
        method: "GET",
        headers: [["accept", "text/plain"]],
      }),
    });
    assert.equal(response.status, 200, response.text);
    assert.equal(response.headers["access-control-allow-origin"], pageOrigin);
    assert.equal(response.json.status, 200);
    assert.equal(Buffer.from(response.json.bodyBase64, "base64").toString("utf8"), "archive-data");
  } finally {
    await stopProcess(child);
    await new Promise((resolve) => upstream.close(resolve));
    await rm(certDir, { recursive: true, force: true });
  }
});

test("Python fetch proxy sample fetches allowed origins and rejects others", { timeout: 30_000, skip: !(await executableExists("python3")) }, async () => {
  await assertProxyWorks({
    start: (port, allowedOrigin) => ({
      command: "python3",
      args: ["proxy/python/server.py"],
      env: { PORT: String(port), WASMACS_PROXY_ALLOWED_ORIGINS: allowedOrigin },
    }),
  });
});

test("PowerShell fetch proxy sample fetches allowed origins and rejects others", { timeout: 120_000 }, async () => {
  const useInstalledPwsh = await executableExists("pwsh");
  await assertProxyWorks({
    start: (port, allowedOrigin) => ({
      command: useInstalledPwsh ? "pwsh" : "mise",
      args: useInstalledPwsh
        ? ["-NoProfile", "-File", "proxy/powershell/server.ps1"]
        : ["x", "powershell@latest", "--", "pwsh", "-NoProfile", "-File", "proxy/powershell/server.ps1"],
      env: { PORT: String(port), WASMACS_PROXY_ALLOWED_ORIGINS: allowedOrigin },
    }),
  });
});
