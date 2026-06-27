import { DEFAULT_OPTIONS, validateTargetPattern } from "../src/allowlist.js";
import { clearAuditLog, readAuditLog, storageGet, storageSet } from "../src/audit-log.js";

const fields = {
  allowedCallerOrigins: document.querySelector("#allowedCallerOrigins"),
  targetAllowlist: document.querySelector("#targetAllowlist"),
  maxResponseBytes: document.querySelector("#maxResponseBytes"),
  timeoutMs: document.querySelector("#timeoutMs"),
  allowCredentials: document.querySelector("#allowCredentials"),
  allowPrivateNetworkTargets: document.querySelector("#allowPrivateNetworkTargets"),
};
const status = document.querySelector("#status");
const auditRows = document.querySelector("#auditRows");

document.querySelector("#save").addEventListener("click", saveOptions);
document.querySelector("#reset").addEventListener("click", async () => {
  await storageSet(chrome.storage.local, { ...DEFAULT_OPTIONS });
  await loadOptions();
  showStatus("Defaults restored");
});
document.querySelector("#clearAudit").addEventListener("click", async () => {
  await clearAuditLog(chrome.storage.local);
  await renderAuditLog();
});

await loadOptions();
await renderAuditLog();

async function loadOptions() {
  const stored = await storageGet(chrome.storage.local, Object.keys(DEFAULT_OPTIONS));
  const options = { ...DEFAULT_OPTIONS, ...stored };
  fields.allowedCallerOrigins.value = options.allowedCallerOrigins.join("\n");
  fields.targetAllowlist.value = options.targetAllowlist.join("\n");
  fields.maxResponseBytes.value = String(options.maxResponseBytes);
  fields.timeoutMs.value = String(options.timeoutMs);
  fields.allowCredentials.checked = Boolean(options.allowCredentials);
  fields.allowPrivateNetworkTargets.checked = Boolean(options.allowPrivateNetworkTargets);
}

async function saveOptions() {
  const targetAllowlist = lines(fields.targetAllowlist.value);
  const invalid = targetAllowlist.map(validateTargetPattern).find(Boolean);
  if (invalid) {
    showStatus(invalid.message);
    return;
  }
  await storageSet(chrome.storage.local, {
    allowedCallerOrigins: lines(fields.allowedCallerOrigins.value),
    targetAllowlist,
    maxResponseBytes: Number(fields.maxResponseBytes.value),
    timeoutMs: Number(fields.timeoutMs.value),
    allowCredentials: fields.allowCredentials.checked,
    allowPrivateNetworkTargets: fields.allowPrivateNetworkTargets.checked,
  });
  showStatus("Saved");
}

async function renderAuditLog() {
  const log = await readAuditLog(chrome.storage.local);
  auditRows.replaceChildren(...log.slice().reverse().map((entry) => {
    const row = document.createElement("tr");
    for (const key of ["time", "callerOrigin", "method", "url", "status", "bytes", "result"]) {
      const cell = document.createElement("td");
      cell.textContent = entry[key] == null ? "" : String(entry[key]);
      if (key === "url") {
        cell.className = "url";
      }
      row.append(cell);
    }
    return row;
  }));
}

function lines(value) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function showStatus(message) {
  status.textContent = message;
  setTimeout(() => {
    if (status.textContent === message) {
      status.textContent = "";
    }
  }, 3000);
}
