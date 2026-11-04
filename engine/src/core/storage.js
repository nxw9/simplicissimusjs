const open = () =>
  new Promise((resolve, reject) => {
    const r = indexedDB.open("hearth-studio", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("documents");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
export async function draft(action, value) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(
        "documents",
        action === "read" ? "readonly" : "readwrite",
      );
      const store = tx.objectStore("documents");
      const request =
        action === "read" ? store.get("draft") : store.put(value, "draft");
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export function download(name, text, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export function errorText(error) {
  return error?.issues
    ? error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .slice(0, 4)
        .join("\n")
    : error.message || String(error);
}
