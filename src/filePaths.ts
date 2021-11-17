/////////////////////:
/// config
import fs from 'fs'
let hasValidFolders = false;
let baseAppPath = '';
let viewerHTMLBasePath = "../view-dist";


let conf = getConf(true)
const usehttps = false;
export function getConf(ignoreInvalid = false) {
    if(!ignoreInvalid && !hasValidFolders){
        console.error("base path not valid",baseAppPath)
    }
return {
    viewerHTMLBasePath ,
    groupFile : baseAppPath+'public/data/groups.json',
    knownDevicesFile : baseAppPath+'public/data/knownDevices.json',
    agendasFolder : baseAppPath+'public/data/agendas/',
   }
}


export function setViewerHTMLBasePath(n:string){
    console.log("setting base html path ",n)
    viewerHTMLBasePath = n;
    conf = getConf(true);
}
export function setRWBasePath(n:string){
    if(!n.endsWith('/'))
        n=n+'/'
    baseAppPath = n;
    conf = getConf(true);
    initFolders();
    rwPathIsSet = true;
}

function initFolders(){
     try{
        if(!fs.existsSync(conf.agendasFolder))
            fs.mkdirSync(conf.agendasFolder, { recursive: true })
        
        if(!fs.existsSync(conf.groupFile))
            fs.writeFileSync(conf.groupFile,'{}',{ encoding: 'utf-8' })
        if(!fs.existsSync(conf.knownDevicesFile))
            fs.writeFileSync(conf.knownDevicesFile,'{}',{ encoding: 'utf-8' })
        hasValidFolders = true;
     }
     catch (e){
         console.error("can't init files for base path" , baseAppPath,e)
     }
  
}

initFolders();

let rwPathIsSet  =false;



// console.log("cer",conf.credentials)
