import LoraModule from './modules/LoraModule';
import { isAndroid } from './platformUtil';
import * as sys from './sysUtils';
import { dateToStr } from './types';


function hasArg(n: string) {
  return process.argv.includes(n)
}

const shutDownFunctions = []
function signalHandler(signal: NodeJS.Signals) {
  // do some stuff here
  console.log("handling sign", signal)
  // shutDownFunctions.map(e => e())
  process.exit(0);
}


process.on('SIGINT', signalHandler)
process.on('SIGTERM', signalHandler)



const isMainServer = hasArg('--srv');//uConf.getVariable("isMainServer");
const startClient = hasArg('-c');
const lastEl = process.argv[process.argv.length - 1]
let endpointName = sys.getHostName() || "nodeCli";
if (!lastEl.startsWith('-')) {
  endpointName = lastEl;
}

LoraModule.isEndpoint = startClient;
LoraModule.isServer = isMainServer || isAndroid;




if (startClient) {
  let targetPort = 0;
  if (endpointName.includes(":")) {
    const spl = endpointName.split(":")
    targetPort = parseInt(spl[1])
    endpointName = spl[0]
  }

  import('./endpointServer').then(mod =>
  {
    shutDownFunctions.push(mod.cleanShutdown)
    console.warn("endpoint startting with hostname ", endpointName)
    mod.startEndpointServer({ endpointName, endpointPort: targetPort })
  })

}

// important to start after so that main server can override LoraModuleCallbacks

if (isMainServer) {
  import('./mainServer').then(mod => {
    shutDownFunctions.push(mod.cleanShutdown)
    mod.startMainServer(() => {
    })
  })

}
