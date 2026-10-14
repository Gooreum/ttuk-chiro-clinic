import { store } from "./lib/store.js";

/* Tuning panel values, saved in localStorage "chiroTune". One key per slider/checkbox. */
export const DEFAULTS = {sens:1.5, bend:1.0, heavy:0.6, tol:1, flick:200, jerk:10, breath:true, tick:true, sound:true, flip:false, portrait:false};
// T is mutated in place (modules hold a reference to it), so "기본값으로" uses resetT() instead of reassigning.
export const T = Object.assign({}, DEFAULTS, store.get("chiroTune", {}));
export const saveT = () => store.set("chiroTune", T);
export const resetT = () => { Object.assign(T, DEFAULTS); };
