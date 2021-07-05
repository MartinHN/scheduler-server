
///////////////////
// mdns
import { hostname } from 'os';
import * as dbg from './dbg'
import conf from './config'
import bonjourM, { RemoteService, Service }  from 'bonjour'
import {EventEmitter} from 'events' 
class Model extends EventEmitter{
  availableRPI = {} as {[key:string]:{service:RemoteService,lastT:Date}}
}
const model = new Model()


export function  startDNS():Model{
  const bonjour = bonjourM()
  
  // advertise an HTTP server 
  bonjour.publish({ name: hostname(), type: 'rspstrio', port: conf.serverPort,txt:{lala:"lala"} })
  
  
  // browse for all http services
  
  const pingInterval = 2000;
  
  const query =    bonjour.find({ type: 'rspstrio' }, function (service) {
    const uuid = [service.name,service.host,service.port].join('_')
    if(!model.availableRPI[uuid]){
      dbg.warn('Found an Raspestrio server:',uuid)
      model.availableRPI[uuid] = {service,lastT:new Date()}
      model.emit("open",uuid)
    }
    else{
      // console.log('Pingfor :',uuid)
      model.availableRPI[uuid].lastT = new Date();
      
    }
    
  })
  
  
  
  setInterval(()=>{
    const curD = new Date();
    for(const [k,v] of Object.entries(model.availableRPI)){
      if((curD.getTime() - v.lastT.getTime()) >= 1.5*pingInterval ){
        dbg.warn('disconnected',k,(curD.getTime() - v.lastT.getTime()) )
        const old = model.availableRPI[k];
        delete model.availableRPI[k]
        model.emit("close",old)
      }
    }
    // force callback
    for(const s of Object.values(model.availableRPI)){
      (query as any)._removeService(s.service.fqdn);
    }
    query.update();
    
  },pingInterval)

  return model
}
