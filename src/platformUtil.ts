import { execSync, execFileSync } from "child_process"
import * as fs from 'fs'
const proc = execSync("uname -a").toString()
export const isAndroid = fs.existsSync("/storage/emulated/0/Android")
export const isPi = !isAndroid && (process.env["PI_XCOMP"] || proc.includes("armv") || proc.includes("aarch64"))
export const isOSX = proc.includes("Darwin")
