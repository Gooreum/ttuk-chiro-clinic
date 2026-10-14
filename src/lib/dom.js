export const $ = s => document.querySelector(s);
export const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
