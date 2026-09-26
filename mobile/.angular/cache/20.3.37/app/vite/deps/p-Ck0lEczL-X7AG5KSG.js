import {
  c,
  l
} from "./chunk-VJ5ZRBGX.js";
import {
  t
} from "./chunk-X7PV7XCU.js";
import {
  H,
  P
} from "./chunk-5ZNTDABU.js";
import {
  __async
} from "./chunk-WDMUDEB6.js";

// node_modules/@ionic/core/components/p-Ck0lEczL.js
var n = () => {
  const n2 = window;
  n2.addEventListener("statusTap", (() => {
    H((() => {
      const o = document.elementFromPoint(n2.innerWidth / 2, n2.innerHeight / 2);
      if (!o) return;
      const i = l(o);
      i && new Promise(((o2) => t(i, o2))).then((() => {
        P((() => __async(null, null, function* () {
          i.style.setProperty("--overflow", "hidden"), yield c(i, 300), i.style.removeProperty("--overflow");
        })));
      }));
    }));
  }));
};
export {
  n as startStatusTap
};
//# sourceMappingURL=p-Ck0lEczL-X7AG5KSG.js.map
