import fs from "fs";
const head = fs.readFileSync("D:/Projects/ops-center/src/App.jsx", "utf8").split("\n").slice(0, 153).join("\n");
const log = fs.readFileSync("D:/Projects/ops-center/src/LogisticsModule.jsx", "utf8").split("\n").slice(1).join("\n");
const tail = fs.readFileSync("D:/Projects/ops-center/src/App.jsx", "utf8").split("\n").slice(347).join("\n");
fs.writeFileSync("D:/Projects/ops-center/src/App.jsx", head + "\n" + log + "\n" + tail, "utf8");
console.log("merged ok");
