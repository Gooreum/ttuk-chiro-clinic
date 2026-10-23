/* Translates the static HTML of a page (index / back / side) once at boot: every text node and placeholder / aria-label /
   title whose trimmed Korean is in the dictionary. Runs right after boot.js (module scripts run after parsing, so the
   whole body is there). Text set later from code goes through t() at the call site. */
import { LANG, t } from "./index.js";

const ATTRS = ["placeholder", "aria-label", "title", "alt"];
const HANGUL = /[가-힣]/;

export function translateTree(root){
  if(LANG === "ko" || !root) return;
  const doc = root.ownerDocument || root;
  const walk = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  const nodes = [];
  for(let n = walk.nextNode(); n; n = walk.nextNode()) if(HANGUL.test(n.nodeValue)) nodes.push(n);
  for(const n of nodes){
    const v = n.nodeValue, s = v.trim(), out = t(s);
    if(out !== s) n.nodeValue = v.replace(s, out);
  }
  const els = root.querySelectorAll ? root.querySelectorAll("*") : [];
  for(const el of els) for(const a of ATTRS){
    const v = el.getAttribute(a);
    if(v && HANGUL.test(v)){ const out = t(v.trim()); if(out !== v.trim()) el.setAttribute(a, out); }
  }
}

if(typeof document !== "undefined" && LANG !== "ko"){
  document.documentElement.lang = LANG;
  document.title = t(document.title);
  translateTree(document.body);
}
