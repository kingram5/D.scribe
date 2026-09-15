const path = require("path");
const pkg = require("path").join(process.cwd(), "node_modules/@heycatch/sdk/dist/index.cjs");
const m = require(pkg);
console.log("SDK_VERSION:", m.SDK_VERSION);
console.log("STAGE:", m.STAGE);
console.log("analytics keys:", Object.keys(m.analytics || {}));
