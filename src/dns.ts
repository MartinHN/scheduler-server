
///////////////////
// mdns
import { hostname } from 'os';
import * as dbg from './dbg'
import conf from './config'
import bonjourM, { RemoteService, Service }  from 'bonjour'
import {EventEmitter} from 'events' 
import { servicesVersion } from 'typescript';

export interface PiConInfo{
  deviceName:string;
  ip:string;
  port:number;
} 

interface ServiceEP{service:RemoteService,lastT:Date}
class Model extends EventEmitter{
  availableRPI = {} as {[key:string]:ServiceEP}
  getAvailablePis() : PiConInfo[]{
    const  res :PiConInfo[]= []
    for(const [k,v] of Object.entries(this.availableRPI)){
      res.push(this.piFromServiceEP(v));
    }
    return res;
  }

  getPiForUUID(n:string){
    const serviceEP = Object.values(this.availableRPI).find(p=>{return this.piFromServiceEP(p).deviceName===n})
    if(serviceEP){
      return this.piFromServiceEP(serviceEP);
    }
    console.error(">>>>>>>>> no service found for uuid",n)
  }

  getPiForIP(ip:string){
    const serviceEP = Object.values(this.availableRPI).find(p=>{return p.service.addresses.includes(ip)})
    if(serviceEP){
      return this.piFromServiceEP(serviceEP);
    }
    console.error(">>>>>>>>> no service found for ip ",ip)
  }
  piFromServiceEP(v:ServiceEP):PiConInfo{
    return {deviceName:v.service.host,ip:v.service.addresses[0],port:v.service.port}
  }
}
const model = new Model()
const bonjour = bonjourM()

export function advertiseDNS(){
  
  // advertise an HTTP server 
  bonjour.publish({ name: hostname(), type: 'rspstrio',protocol:'udp', port: conf.endpointPort,txt:{lala:"lala"} })
  
}

export function  listenDNS():Model{
  // browse for all http services
  
  const pingInterval = 2000;
  
  const query =    bonjour.find({ type: 'rspstrio' ,protocol:'udp'}, function (service) {
    const uuid = [service.host,service.name,service.port].join('_')
    if(!model.availableRPI[uuid]){
      model.availableRPI[uuid] = {service,lastT:new Date()}
      dbg.warn('Found a Raspestrio endpoint:',JSON.stringify(model.getPiForUUID(service.host)))

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
