

function hasArg(n:string){
  return process.argv.includes(n)
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
