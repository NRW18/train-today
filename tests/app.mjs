// Helper for tests: cut named functions out of index.html and run them in a sandbox,
// so the tests check the app's real code without a browser.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

// Source of `function name(...) { ... }`, matching braces and skipping strings and comments.
export function fnSource(name) {
  const start = html.indexOf("function " + name + "(");
  if (start < 0) throw new Error("function " + name + " not found in index.html");
  return braced(html.slice(start - 6, start) === "async " ? start - 6 : start, name);
}

// Source of a `var NAME = { ... };` that spans several lines.
export function varBlock(name) {
  const start = html.indexOf("var " + name + " = {");
  if (start < 0) throw new Error("var " + name + " not found in index.html");
  return braced(start, name) + ";";
}

function braced(start, name) {
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

// Source of a one-line `var NAME = ...;` from index.html.
export function varSource(name) {
  const m = html.match(new RegExp("^\\s*var " + name + " = .*;$", "m"));
  if (!m) throw new Error("var " + name + " not found in index.html");
  return m[0].trim();
}

// Build a sandbox with the given globals, then the one-line vars and functions from index.html.
export function load(names, globals = {}, vars = []) {
  // the app's language helpers, in Thai (the language the code is written in); a test can override them
  const lang = { t: (x) => x, tf: (x, o) => String(x).replace(/\{(\w+)\}/g, (m, k) => (o[k] != null ? o[k] : m)), LANG: "th", LOCALE: "th-TH", AI_LANG: "Thai", track: () => {}, trackOnce: () => {} };
  const policy = {};
  vm.runInNewContext(readFileSync(new URL("../ai-config.js", import.meta.url), "utf8"), policy);
  const ctx = vm.createContext({ ...lang, KryvosAI: policy.KryvosAI, ...globals });
  vm.runInContext(vars.map(anyVar).concat(names.map(fnSource)).join("\n"), ctx);
  return ctx;
}

export { html };

// a one-line var, or a multi-line object var
function anyVar(name) { try { return varSource(name); } catch (e) { return varBlock(name); } }
