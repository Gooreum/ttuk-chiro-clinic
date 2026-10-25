import { mats } from "./materials.js";
import { hairShort, hairBald, hairLong, hairSpikes, glasses, torso } from "./patientModel.js";
import { applyProps } from "./castProps.js";
import { setRealHands, setRealPatient, restorePrimitiveHead } from "./realAssets.js";
import { S } from "../game/state.js";

/* Per-patient hair, skin, gown, glasses and build. */
export function applyLook(p){
  restorePrimitiveHead();
  const L = p.look;
  mats.hair.color.setHex(L.hairCol);
  [mats.skin, mats.neck, mats.headSkin].forEach(m => m.color.setHex(L.skin));
  mats.gown.color.setHex(L.gown);
  hairShort.visible = L.hair === "short" || L.hair === "messy" || L.hair === "long";
  hairBald.visible = L.hair === "bald";
  hairLong.visible = L.hair === "long";
  hairSpikes.visible = L.hair === "messy";
  glasses.visible = !!L.glasses;
  applyProps(L.props);
  torso.scale.set(L.hair === "bald" ? 1.62 : 1.5, 1, 0.7);
  setRealHands(!!L.model);
  // clinicModel: an image-to-3D body for the neck modes (no towel-stage copy: 목뽑기 uses the clinic GLBs, realAssets
  // NO_STAGE); the MPFB model stays for the cast who borrow the build (cast.js)
  setRealPatient(((S.game === "clinic" || S.game === "towel") && L.clinicModel) || L.model || null, L);
}
