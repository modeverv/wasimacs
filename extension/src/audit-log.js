const AUDIT_LOG_KEY = "auditLog";

export async function appendAuditEntry(storage, entry, limit = 100) {
  if (!storage) {
    return;
  }
  const current = await storageGet(storage, AUDIT_LOG_KEY);
  const log = Array.isArray(current[AUDIT_LOG_KEY]) ? current[AUDIT_LOG_KEY] : [];
  const next = [...log, entry].slice(-limit);
  await storageSet(storage, { [AUDIT_LOG_KEY]: next });
}

export async function readAuditLog(storage) {
  if (!storage) {
    return [];
  }
  const current = await storageGet(storage, AUDIT_LOG_KEY);
  return Array.isArray(current[AUDIT_LOG_KEY]) ? current[AUDIT_LOG_KEY] : [];
}

export async function clearAuditLog(storage) {
  if (!storage) {
    return;
  }
  await storageSet(storage, { [AUDIT_LOG_KEY]: [] });
}

export function storageGet(storage, keys) {
  return new Promise((resolve, reject) => {
    try {
      const maybePromise = storage.get(keys, (result) => {
        const error = globalThis.chrome?.runtime?.lastError;
        if (error) {
          reject(new Error(error.message));
        } else {
          resolve(result || {});
        }
      });
      if (maybePromise && typeof maybePromise.then === "function") {
        maybePromise.then((result) => resolve(result || {}), reject);
      }
    } catch (error) {
      reject(error);
    }
  });
}

export function storageSet(storage, value) {
  return new Promise((resolve, reject) => {
    try {
      const maybePromise = storage.set(value, () => {
        const error = globalThis.chrome?.runtime?.lastError;
        if (error) {
          reject(new Error(error.message));
        } else {
          resolve();
        }
      });
      if (maybePromise && typeof maybePromise.then === "function") {
        maybePromise.then(resolve, reject);
      }
    } catch (error) {
      reject(error);
    }
  });
}
