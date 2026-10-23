/* Collects every Korean string the game can show: string literals in src/ (comments are not in the AST) and the static
   text / placeholder / aria-label / title of the three HTML pages. Reports
     - missing:   Korean sources with no English line in src/i18n/en/*.json
     - templates: template literals that mix Korean with ${...} (they can't be looked up; write t("..{x}..", {x}) instead)
   Usage: node scripts/i18n/extract.mjs [--json] [--all]   (--all lists every source, not only missing ones)
   Exit 1 when anything is missing (npm run i18n:check). Skips: src/i18n/ignore.json. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "@babel/parser";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const HANGUL = /[가-힣]/;
const rel = p => path.relative(ROOT, p).split(path.sep).join("/");

export function loadIgnore(){
  const f = path.join(ROOT, "src/i18n/ignore.json");
  const j = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {};
  return { files: j.files || [], strings: new Set(j.strings || []), calls: new Set(j.calls || ["console.log", "console.warn", "console.error", "console.info"]) };
}
export function loadDict(){
  const dir = path.join(ROOT, "src/i18n/en"), d = {};
  for(const f of fs.readdirSync(dir)) if(f.endsWith(".json")) Object.assign(d, JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
  return d;
}
function listFiles(dir, out = []){
  for(const e of fs.readdirSync(dir, { withFileTypes: true })){
    const p = path.join(dir, e.name);
    if(e.isDirectory()) listFiles(p, out); else if(/\.(m?js)$/.test(e.name)) out.push(p);
  }
  return out;
}
const calleeName = n => n.type === "MemberExpression" ? `${calleeName(n.object)}.${n.property.name || ""}` : n.type === "Identifier" ? n.name : "";

/* returns { strings: [{s, file, line}], templates: [{file, line, raw}] } */
export function scanJs(file, ign){
  const code = fs.readFileSync(file, "utf8");
  const ast = parse(code, { sourceType: "module", plugins: ["importAttributes"], errorRecovery: true });
  const strings = [], templates = [];
  const visit = (n, skip) => {
    if(!n || typeof n.type !== "string") return;
    if(n.type === "CallExpression" && ign.calls.has(calleeName(n.callee))) skip = true;
    if(n.type === "ImportDeclaration" || n.type === "ExportAllDeclaration") return;
    if(!skip && n.type === "StringLiteral" && HANGUL.test(n.value)) strings.push({ s: n.value.trim(), file: rel(file), line: n.loc.start.line });
    if(!skip && n.type === "TemplateLiteral"){
      const raw = n.quasis.map(q => q.value.cooked).join("${}");
      if(HANGUL.test(raw)){
        if(n.expressions.length) templates.push({ file: rel(file), line: n.loc.start.line, raw });
        else strings.push({ s: n.quasis[0].value.cooked.trim(), file: rel(file), line: n.loc.start.line });
      }
    }
    for(const k in n){
      if(k === "loc" || k === "start" || k === "end" || k === "leadingComments" || k === "trailingComments" || k === "innerComments") continue;
      const v = n[k];
      if(Array.isArray(v)) v.forEach(c => visit(c, skip)); else if(v && typeof v.type === "string") visit(v, skip);
    }
  };
  visit(ast.program, false);
  return { strings, templates };
}

export function scanHtml(file){
  let h = fs.readFileSync(file, "utf8");
  h = h.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<!--[\s\S]*?-->/g, "");
  const out = [];
  const lineOf = i => h.slice(0, i).split("\n").length;
  for(const m of h.matchAll(/(placeholder|aria-label|title|alt)="([^"]*)"/g)) if(HANGUL.test(m[2])) out.push({ s: m[2].trim(), file: rel(file), line: lineOf(m.index) });
  for(const m of h.matchAll(/>([^<>]+)</g)){
    const s = m[1].replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
    if(HANGUL.test(s)) out.push({ s, file: rel(file), line: lineOf(m.index) });
  }
  return out;
}

export function scanAll(){
  const ign = loadIgnore();
  const files = listFiles(path.join(ROOT, "src")).filter(f => !ign.files.some(g => rel(f).startsWith(g)));
  const strings = [], templates = [];
  for(const f of files){ const r = scanJs(f, ign); strings.push(...r.strings); templates.push(...r.templates); }
  for(const h of ["index.html", "back.html", "side.html"]) strings.push(...scanHtml(path.join(ROOT, h)));
  return { strings: strings.filter(x => x.s && !ign.strings.has(x.s)), templates: templates.filter(x => !ign.strings.has(x.raw)) };
}

export function check(){
  const dict = loadDict(), { strings, templates } = scanAll();
  const seen = new Map();
  for(const x of strings) if(!seen.has(x.s)) seen.set(x.s, x);
  const missing = [...seen.values()].filter(x => !Object.prototype.hasOwnProperty.call(dict, x.s));
  return { total: seen.size, missing, templates, all: [...seen.values()] };
}

if(process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])){
  const r = check(), json = process.argv.includes("--json"), all = process.argv.includes("--all");
  if(json) console.log(JSON.stringify(all ? r : { total: r.total, missing: r.missing, templates: r.templates }, null, 1));
  else {
    for(const x of r.missing) console.log(`missing  ${x.file}:${x.line}  ${x.s.slice(0, 70)}`);
    for(const x of r.templates) console.log(`template ${x.file}:${x.line}  ${x.raw.slice(0, 70)}`);
    console.log(`i18n: ${r.total} sources, ${r.missing.length} missing, ${r.templates.length} Korean templates`);
  }
  process.exit(r.missing.length || r.templates.length ? 1 : 0);
}
