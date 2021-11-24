import * as sys from './sysUtils';


function hasArg(n:string){
  return process.argv.includes(n)
}



const isMainServer = hasArg('--srv');//uConf.getVariable("isMainServer");
const startClient = hasArg('-c');
const lastEl = process.argv[process.argv.length-1]
let endpointName = sys.getHostName() || "nodeCli";
if(!lastEl.startsWith('-')){
  endpointName = lastEl;
} 


if(isMainServer){
  import('./mainServer').then(mod=>
    mod.startMainServer(()=>{
    }))
 
}


if(startClient){
  let targetPort = 0;
  if(endpointName.includes(":")){
    const spl = endpointName.split(":")
    targetPort = parseInt(spl[1])
    endpointName = spl[0]
  }

  import('./endpointServer').then(mod=>

    mod. startEndpointServer({endpointName,endpointPort:targetPort}))
 
}
