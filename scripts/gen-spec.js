// Generates docs/SPECS.md (system-specific specifications) from the roster in js/defaults.js.
const fs = require("fs");
const path = require("path");
global.window = global;
require(path.join(__dirname, "..", "js", "defaults.js"));
const Specs = require(path.join(__dirname, "..", "js", "specs.js"));

const total = DEFAULT_SYSTEMS.reduce((n, s) => n + s.agents.length, 0);
if (total !== 56) { console.error(`Roster has ${total} agents, expected 56.`); process.exit(1); }
fs.mkdirSync(path.join(__dirname, "..", "docs"), { recursive: true });
fs.writeFileSync(path.join(__dirname, "..", "docs", "SPECS.md"), Specs.markdown(DEFAULT_SYSTEMS, GROUP_META));
console.log(`docs/SPECS.md written (${total} agents).`);
