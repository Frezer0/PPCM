const fs = require("node:fs");
const crypto = require("node:crypto");
const { version } = require("./package.json");
const filename = `PPCM-Setup-${version}-x64.exe`;
const file = fs.readFileSync(`release/${filename}`);
const result = {
  version,
  filename,
  size: file.length,
  sha256: crypto.createHash("sha256").update(file).digest("hex"),
  architecture: "x64",
  signed: Boolean(process.env.CSC_LINK),
  defaultUrl: require("./default-server.json").url,
};
fs.writeFileSync(
  "release/client-manifest.json",
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
