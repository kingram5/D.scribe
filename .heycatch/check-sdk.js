import { join } from "node:path";
import { pathToFileURL } from "node:url";
const pkg = join(process.cwd(), "node_modules/@heycatch/sdk/dist/index.cjs");
const m = (await import(pathToFileURL(pkg).href)).default;
console.log("SDK_VERSION:", m.SDK_VERSION);
console.log("STAGE:", m.STAGE);
console.log("analytics keys:", Object.keys(m.analytics || {}));
