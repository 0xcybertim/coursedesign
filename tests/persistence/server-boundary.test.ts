import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("server-only persistence boundary", () => {
  it("keeps server configuration out of every client module", () => {
    const root = process.cwd();
    const files = sourceFiles(join(root, "src"));
    const violations = files.filter((file) => {
      const source = readFileSync(file, "utf8");
      return (
        source.startsWith('"use client"') &&
        (source.includes("@/server/config") ||
          source.includes("server/config/persistence-config"))
      );
    });
    expect(violations).toEqual([]);
  });
});
