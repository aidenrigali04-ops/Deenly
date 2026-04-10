/**
 * npm often dedupes @expo/log-box to the project root while Metro or tooling
 * still opens expo/node_modules/@expo/log-box/... (ENOENT). Link nested path to hoisted package.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const hoisted = path.join(root, "node_modules", "@expo", "log-box");
const nestedDir = path.join(root, "node_modules", "expo", "node_modules", "@expo");
const nestedLink = path.join(nestedDir, "log-box");

function main() {
  if (!fs.existsSync(hoisted)) {
    return;
  }
  fs.mkdirSync(nestedDir, { recursive: true });
  if (fs.existsSync(nestedLink)) {
    try {
      const st = fs.lstatSync(nestedLink);
      if (st.isSymbolicLink()) {
        const resolved = fs.realpathSync(nestedLink);
        if (resolved === fs.realpathSync(hoisted)) {
          return;
        }
      }
      if (st.isDirectory() && !st.isSymbolicLink()) {
        return;
      }
    } catch {
      return;
    }
    try {
      fs.unlinkSync(nestedLink);
    } catch {
      return;
    }
  }
  const rel = path.relative(nestedDir, hoisted);
  try {
    if (process.platform === "win32") {
      fs.symlinkSync(path.resolve(hoisted), nestedLink, "junction");
    } else {
      fs.symlinkSync(rel, nestedLink);
    }
  } catch (e) {
    if (e && e.code === "EEXIST") {
      return;
    }
    console.warn("[ensure-expo-log-box-symlink]", e.message);
  }
}

main();
