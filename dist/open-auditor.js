import { exec } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const htmlPath = path.resolve(__dirname, "../auditor/index.html");
console.log(`Opening PayBox MCP Security Auditor in your browser:\nfile://${htmlPath}`);
// Windows default browser opener
const cmd = process.platform === "win32" ? `start "" "${htmlPath}"` : `open "${htmlPath}"`;
exec(cmd, (err) => {
    if (err) {
        console.error("Could not automatically launch browser. Please open the file manually:", htmlPath);
    }
    else {
        console.log("Auditor UI launched successfully!");
    }
});
//# sourceMappingURL=open-auditor.js.map