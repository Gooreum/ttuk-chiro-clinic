/* First import of every page (index / back / side): analytics starts before any other module runs, so an error while
   the game boots is logged and shows the 다시 시도 card (platform/analytics.js, ui/loadFail.js). */
import { initAnalytics } from "./platform/analytics.js";
import { showLoadFail } from "./ui/loadFail.js";

const page = location.pathname.split("/").pop();
const mode = page.startsWith("back") ? "back" : page.startsWith("side") ? "side"
  : new URLSearchParams(location.search).get("mode") === "towel" ? "towel" : "crack";
initAnalytics({ mode, onBootFail: showLoadFail });
