import { readFileSync } from "node:fs";
const payload = JSON.parse(readFileSync("c:/Users/15bit/Desktop/project/Om/deploy-payload.json", "utf8"));
process.stdout.write(JSON.stringify(payload));
