
///////////////////
// mdns
import { hostname } from 'os';
import * as dbg from './dbg'
import conf from './config'
import bonjourM, { RemoteService, Service }  from 'bonjour'
import {EventEmitter} from 'events' 
import jdiff from 'json-diff';
export interface PiConInfo{
  uuid:string;
  deviceName:string;
  ip:string;
  port:number;
  caps:string[]
} 


interface ServiceEP{service:RemoteService,lastT:Date,uuid:string}

function piFromService(uuid:string,service:RemoteService):PiConInfo{
  return {uuid,deviceName:service.host,ip:service.addresses[0],port:service.port,caps:(service.txt["caps"] || "").split(",")}
}

class Model extends EventEmitter{
  availableRPI = {} as {[key:string]:ServiceEP}
  getAvailablePis() : PiConInfo[]{
    const  res :PiConInfo[]= []
    for(const [k,v] of Object.entries(this.availableRPI)){
      res.push(piFromService(k,v.service));
    }
    return res;
  }
  
  getPiForUUID(uuid:string):PiConInfo | undefined{
    const serviceEP = Object.values(this.availableRPI).find(p=>{return p.uuid===uuid})
    if(serviceEP){
      return piFromService(serviceEP.uuid,serviceEP.service);
    }
    dbg.error(">>>>>>>>> no service found for uuid",uuid)
  }
  
  getPiForIP(ip:string){
    const serviceEP = Object.values(this.availableRPI).find(p=>{return p.service.addresses.includes(ip)})
    if(serviceEP){
      return piFromService(serviceEP.uuid,serviceEP.service);
    }
    dbg.error(">>>>>>>>> no service found for ip ",ip)
  }

}
const model = new Model()
const bonjour = bonjourM()

export function advertiseServerDNS(){
  

  // advertise an HTTP server 
  bonjour.publish({ name: hostname(), host:'tinmar.local',type: 'http',protocol:'tcp', port: conf.serverPort })
  bonjour.publish({ name: hostname(), /* host:'tinmar.local', */type: 'lumestrioMaster',protocol:'tcp', port: conf.serverPort })
  
}

export function  listenDNS():Model{
  // browse for all http services
  
  const pingInterval = 1000;
  
  
  //   setInterval(()=>{
  //     bonjour.find({ type: 'http'}, function (service){
  //       dbg.log('service',service)
  //     })
  // },3000);
  
  const query =    bonjour.find({ type: 'rspstrio' ,protocol:'udp'},  (service)=> {
    
    let uuid = service.txt["uuid"];
    
    if(uuid === undefined){
      dbg.error("no uuid present in MDNS")
      uuid = [service.name,service.port].join('_');
    }
    if(!model.availableRPI[uuid]){
      model.availableRPI[uuid] = {service,lastT:new Date(),uuid}
      dbg.warn('Found a Raspestrio endpoint:', uuid)
      dbg.log(JSON.stringify(service))
      dbg.log(JSON.stringify(model.getPiForUUID(uuid)))
      model.emit("open",uuid)
    }
    else{

      model.availableRPI[uuid].lastT = new Date()
      
      
      const regPi = piFromService(uuid,model.availableRPI[uuid].service)
      const announcedPi = piFromService(uuid,service)
      if( jdiff.diff(regPi,announcedPi)){
        dbg.warn("service updated", jdiff.diffString(regPi,announcedPi))
        model.emit("close",uuid)
        model.availableRPI[uuid].service = service;
        model.emit("open",uuid)

      }
      // dbg.log('Pingfor :',uuid)

      
    }
    
  })
  
  
  
  setInterval(()=>{
    const curD = new Date();
    for(const [k,v] of Object.entries(model.availableRPI)){
      if((curD.getTime() - v.lastT.getTime()) >= pingInterval+3000 ){
        dbg.warn('disconnected',k,(curD.getTime() - v.lastT.getTime()) )
        const old = model.availableRPI[k];
        delete model.availableRPI[k]
        model.emit("close",old)
      }
    }

    // dbg.log("updateMDNS")
    // force callback
    for(const s of Object.values(model.availableRPI)){
      (query as any)._removeService(s.service.fqdn);
    }
    query.update();
    
  },pingInterval)
  
  return model
}
