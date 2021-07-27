
import { startServer } from './server'
import { listenDNS,advertiseDNS } from './dns'
import {startWS} from './wsServer'
import { startSchedule} from './schedule'
import * as uConf from './userConf'
import { startEndpointServer } from './endpointServer'

const isMainServer = true;//uConf.getVariable("isMainServer");


if(isMainServer){
  const server = startServer()
  const wsServer = startWS(server)
  
  wsServer.on("connection",(w)=>{
    wsServer.sendTo(w,{type:"deviceList",data:Array.from(Object.keys(pis.availableRPI))})
  })
  const pis = listenDNS()
  
  pis.on("open",(pi)=>{
    console.log("newPI",pi)
    wsServer.broadcast({type:"deviceList",data:Array.from(Object.keys(pis.availableRPI))})
  })
  pis.on("close",(pi)=>{
    console.log("no more pi",pi)
    wsServer.broadcast({type:"deviceList",data:Array.from(Object.keys(pis.availableRPI))})
  })
}
startEndpointServer()

advertiseDNS();
startSchedule((state)=>{
  console.log("scheduling State is",state?"on":"off")
})
