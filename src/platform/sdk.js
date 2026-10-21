/* The Apps-in-Toss SDK chunk, loaded once and only in the Toss build (`npm run build:toss`, __TOSS__). Shared by
   toss.js (ads, purchase) and analytics.js (logs, review) so neither imports the other. */
let sdkP = null;
export const sdk = () => __TOSS__ ? (sdkP ||= import("@apps-in-toss/web-framework")) : Promise.reject(new Error("not toss"));
export const supported = fn => { try{ return !!fn && fn.isSupported(); }catch(e){ return false; } };
