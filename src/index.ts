
import { startServer } from './server'
import { startDNS } from './dns'
import {startWS} from './wsServer'
import { startSchedule} from './schedule'
const server = startServer()
const wsServer = startWS(server)

wsServer.on("connection",(w)=>{
  wsServer.sendTo(w,{type:"deviceList",data:Array.from(Object.keys(pis.availableRPI))})
})
const pis = startDNS()


pis.on("open",(pi)=>{
  console.log("newPI",pi)
  wsServer.broadcast({type:"deviceList",data:Array.from(Object.keys(pis.availableRPI))})
})
pis.on("close",(pi)=>{
  console.log("no more pi",pi)
  wsServer.broadcast({type:"deviceList",data:Array.from(Object.keys(pis.availableRPI))})
})


startSchedule((state)=>{
  console.log("scheduling State is",state?"on":"off")
})
