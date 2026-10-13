// Helper for tests: cut named functions out of index.html and run them in a sandbox,
// so the tests check the app's real code without a browser.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

// Source of `function name(...) { ... }`, matching braces and skipping strings and comments.
export function fnSource(name) {
  const start = html.indexOf("function " + name + "(");
  if (start < 0) throw new Error("function " + name + " not found in index.html");
  let i = html.indexOf("{", start), depth = 0;
  for (; i < html.length; i++) {
    const c = html[i];
    if (c === '"' || c === "'" || c === "`") {
      for (i++; i < html.length && html[i] !== c; i++) if (html[i] === "\\") i++;
    } else if (c === "/" && html[i + 1] === "/") {
      i = html.indexOf("\n", i);
    } else if (c === "/" && html[i + 1] === "*") {
      i = html.indexOf("*/", i) + 1;
    } else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error("unbalanced braces in " + name);
}

// Build a sandbox with the given globals and functions from index.html.
export function load(names, globals = {}) {
  const ctx = vm.createContext({ ...globals });
  vm.runInContext(names.map(fnSource).join("\n"), ctx);
  return ctx;
}

export { html };
