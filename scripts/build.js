// Copies the web app into ./www (used for GitHub Pages and the Android APK).
const fs = require("fs");
const path = require("path");

const out = "www";
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const item of ["index.html", "manifest.webmanifest", "sw.js", "icon.svg", "css", "js"]) {
  fs.cpSync(item, path.join(out, item), { recursive: true });
}
console.log("Built web app into ./www");
