import { writeFileSync } from "node:fs";
import { generateThemeCss } from "../src/css";

const target = new URL("../theme.gen.css", import.meta.url);
writeFileSync(target, generateThemeCss());
console.log(`Wrote ${target.pathname}`);
