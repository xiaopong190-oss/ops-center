import fs from "fs";

const logistics = fs.readFileSync("D:/Projects/ops-center/src/LogisticsModule.jsx", "utf8");
const logisticsBrowser = logistics
  .replace(/^import \{ useState \} from "react";\r?\n/, "const { useState } = React;\n")
  .replace(/^\/\/ Paste into App\.jsx.*\r?\n/, "")
  .replace(/^export function LogisticsPanel/, "function LogisticsPanel");

fs.writeFileSync("D:/Projects/ops-center/src/LogisticsModule.browser.jsx", logisticsBrowser);

const app = fs.readFileSync("D:/Projects/ops-center/src/App.jsx", "utf8");
const appBrowser = app
  .replace(/^import \{ useState \} from "react";\r?\n/, "const { useState } = React;\n")
  .replace(/^import \{ LogisticsPanel \} from "\.\/LogisticsModule\.jsx";\r?\n/, "")
  .replace(/^export default function App/, "function App")
  + "\n\nconst root = ReactDOM.createRoot(document.getElementById('root'));\nroot.render(<App />);\n";

// Remove LogisticsModule import - LogisticsPanel comes from separate script
const combined = appBrowser;

// Split: we'll use two script tags - logistics first, then app without import
const appOnly = app
  .replace(/^import \{ useState \} from "react";\r?\n/, "const { useState } = React;\n")
  .replace(/^import \{ LogisticsPanel \} from "\.\/LogisticsModule\.jsx";\r?\n/, "");

const appBrowserFinal = appOnly.replace(/^export default function App/, "function App")
  + "\n\nconst root = ReactDOM.createRoot(document.getElementById('root'));\nroot.render(<App />);\n";

fs.writeFileSync("D:/Projects/ops-center/src/App.browser.jsx", appBrowserFinal);
console.log("Built LogisticsModule.browser.jsx and App.browser.jsx");
