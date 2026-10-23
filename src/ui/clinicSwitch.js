import { t } from "../i18n/index.js";
// Shared "다른 클리닉" switch for all four modes: the 클리닉 chip menu on the play HUD and the chip row on cards.
// Switching reloads the page (drops in-flight timers and stages); the target's start card then needs one tap (iOS sensor permission).
export const CLINICS = [
  { id: "crack", label: "목꺾기", href: "./index.html?mode=crack" },
  { id: "towel", label: "목뽑기", href: "./index.html?mode=towel" },
  { id: "back", label: "허리펴기", href: "./back.html" },
  { id: "side", label: "허리비틀기", href: "./side.html" }
];
export const clinicLinks = current => CLINICS.map(c => ({ ...c, current: c.id === current }));

// list: a .clinic-switch row or a .clinic-menu; the current mode is a pressed chip, not a link
export function renderClinicLinks(list, current){
  list.textContent = "";
  clinicLinks(current).forEach(c => {
    const a = list.ownerDocument.createElement("a");
    a.className = "chip"; a.textContent = t(c.label);
    if(c.current) a.setAttribute("aria-current", "page"); else a.href = c.href;
    list.append(a);
  });
}

// chip: the HUD 클리닉 chip, menu: its .clinic-menu popover. The mode stops while it is open (onOpen / onClose).
export function mountClinicMenu({ chip, menu, current, onOpen = () => {}, onClose = () => {} }){
  const doc = chip.ownerDocument;
  function open(){
    if(!menu.hidden) return;
    renderClinicLinks(menu, current()); menu.hidden = false; chip.setAttribute("aria-expanded", "true"); onOpen();
  }
  function close(){
    if(menu.hidden) return;
    menu.hidden = true; chip.setAttribute("aria-expanded", "false"); onClose();
  }
  chip.addEventListener("click", e => { e.stopPropagation(); menu.hidden ? open() : close(); });
  // a tap anywhere outside closes it; the tap that closes does not reach the game (capture + stop)
  doc.addEventListener("pointerdown", e => {
    if(menu.hidden || menu.contains(e.target) || chip.contains(e.target)) return;
    e.stopPropagation(); e.preventDefault(); close();
  }, true);
  return { open, close, isOpen: () => !menu.hidden };
}
