
///////////////////
// mdns
import { hostname } from 'os';
import * as dbg from './dbg'

import bonjourM, { RemoteService, Service }  from 'bonjour'
export function  startDNS(){
const bonjour = bonjourM()
 
// advertise an HTTP server on port 3000
bonjour.publish({ name: hostname(), type: 'rspstrio', port: 3000,txt:{lala:"lala"} })

 
// browse for all http services
const availableRPI = {} as {[key:string]:{service:RemoteService,lastT:Date}}
const pingInterval = 2000;

const query =    bonjour.find({ type: 'rspstrio' }, function (service) {
  const uuid = [service.name,service.host,service.port].join('_')
  if(!availableRPI[uuid]){
    dbg.warn('Found an Raspestrio server:',uuid)
    availableRPI[uuid] = {service,lastT:new Date()}
  }
  else{
    // console.log('Pingfor :',uuid)
    availableRPI[uuid].lastT = new Date();
  }
})



setInterval(()=>{
  const curD = new Date();
  for(const [k,v] of Object.entries(availableRPI)){
    if((curD.getTime() - v.lastT.getTime()) >= 1.5*pingInterval ){
      dbg.warn('disconnected',k,(curD.getTime() - v.lastT.getTime()) )
      delete availableRPI[k]
    }
  }
  // force callback
  for(const s of Object.values(availableRPI)){
    (query as any)._removeService(s.service.fqdn);
  }
  query.update();

},pingInterval)
}
