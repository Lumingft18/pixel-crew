// Copies the shared browser library into the extension before packaging.
const { copyFileSync } = require("fs");
const { join } = require("path");
copyFileSync(join(__dirname, "..", "..", "src", "pixel-crew.js"), join(__dirname, "..", "media", "pixel-crew.js"));
