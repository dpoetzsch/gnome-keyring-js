const __LIBRARY__ = {}
define("__LIBRARY__", ["require", "exports", "src/main"], function (require, exports, main_1) {
    "use strict";
    function __export(m) {
        for (var p in m) if (!__LIBRARY__.hasOwnProperty(p)) __LIBRARY__[p] = m[p];
    }
    Object.defineProperty(exports, "__esModule", { value: true });
    __export(main_1);
});

const makeItem = __LIBRARY__.makeItem;
const KeyringConnection = __LIBRARY__.KeyringConnection;
