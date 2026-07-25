export interface BrowserKeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function browserLocalStorage(): BrowserKeyValueStorage {
  if (typeof window === "undefined") {
    throw new Error("Browser persistence requires a browser context.");
  }
  return window.localStorage;
}
