console.log("arggggs",process.argv)

import { startEndpointServer } from './endpointServer'


function hasArg(n:string){
  return process.argv.includes(n)
}

async function importModule(moduleName: string):Promise<any>{
  console.log("importing ", moduleName);
  const importedModule = 'l';
/*   const importedModule = await */ import(moduleName);
  console.log("\timported ...");
  return importedModule;
}


const isMainServer = hasArg('--srv');//uConf.getVariable("isMainServer");
const startClient = hasArg('-c');
const lastEl = process.argv[process.argv.length-1]
let endpointName = "nodeCli";
if(!lastEl.startsWith('-')){
  endpointName = lastEl;
} 

if(isMainServer){
  import('./mainServer').then(mod=>
    mod.startMainServer(()=>{
    }))
 
}


if(startClient){
  import('./endpointServer').then(mod=>
    mod. startEndpointServer({endpointName}))
 
}
