import { execSync, execFileSync } from "child_process"
const proc = execSync("uname -a").toString()
export const isPi = proc.includes("armv") || proc.includes("aarch64")
export const isOSX = proc.includes("Darwin")
