import fs from 'fs'
import { execSync, execFileSync } from "child_process"
import { getConfigFileParsingDiagnostics } from 'typescript';
import * as dbg from './dbg'
import conf from './config'

const proc =  execSync("uname -a").toString()
export const isPi = proc.includes("armv")

export function getHostName(){
    return fs.readFileSync("/etc/hostname").toString().trim();  
}


export function setHostName(newhost:string){
    const hostn = getHostName();
    execSync(`sudo sed -i "s/${hostn}/${newhost}/g" /etc/hosts`);
    execSync(`sudo sed -i "s/${hostn}/${newhost}/g" /etc/hostname`);
}


export function getRSSI(){
    let res = 0
    try{ 
        res = parseInt(execSync("cat /proc/net/wireless | awk 'END { print $4 }' | sed 's/\.$//'").toString())
    // res=parseInt( execSync('iwlist wlan0 scanning | grep  -Eo "....dBm"').toString());
    }
    catch(e){
        dbg.error("rssi failed")
    }
    return res;
}


export function reboot(){
    if(isPi)
       execSync('sudo reboot')
    else
       dbg.warn("should reboot")
}


export async function  removeAllRasps(){
    const paths =[conf.knownDevicesFile,conf.groupFile]
    console.warn("clearing all files",paths);
    for(const p of paths){
        await fs.writeFileSync(p,'{}',{ encoding: 'utf-8' })
    }
}
