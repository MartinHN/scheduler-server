

////////////////////////
// SERVE
import * as dbg from './dbg'
import fs from 'fs';
import express from 'express'
import cors from 'cors'
import conf from './config'
import  * as endp from './endpointConfig'
import * as uConf from "./userConf"
import path from 'path'
import https from 'https'
import http from 'http'
import * as sys from './sysUtils'


const app = express();

const endpointDir = path.dirname(endp.conf.agendaFile)
uConf.setRW(true)
if(!fs.existsSync(endpointDir))
fs.mkdirSync(endpointDir)

if(!fs.existsSync(endp.conf.agendaFile))
fs.writeFileSync(endp.conf.agendaFile,'{}',{ encoding: 'utf-8' })
uConf.setRW(false)


/*
endpoint caps
nickName
hostname
isMainServer
reboot
on/off
MiniMadIp
MiniMadCtl
...
active dmx
active sound


*/

function restGetSet(confName:string,getF:()=>any,setF:(any)=>void,typeV:string="string"){
  app.get("/"+confName,(req,res)=>{
    res.setHeader('Content-Type', 'application/json');
    res.json({value:getF()});
  })
  app.post("/"+confName,async (req,res)=>{
    const v = req.body.value
    if((v!==undefined) || typeof(v)!==typeV){
      setF(v);
    }
    else{
      dbg.error("undefined conf var",confName,typeof(v));
    }
    res.send()
  })
}

function restGetSetConf(confName:string){
  restGetSet(confName,()=>uConf.getVariable(confName),(v)=>uConf.setVariable(confName,v));
}

app.use(cors())
app.use(express.json())



export function startEndpointServer(){
  const httpProto = conf.usehttps?https:http
  const server = conf.usehttps? httpProto.createServer(conf.credentials as any,app):httpProto.createServer(app)
  server.listen(conf.endpointPort, () =>
  console.log(`Endpoint listening on port ${conf.endpointPort}!`));
  return server
}


app.use(express.static(endpointDir, {
  etag: false
}))


app.get('/agendaFile',(req,res)=>{
  res.setHeader('Content-Type', 'application/json');
  var readable = fs.createReadStream(endp.conf.agendaFile);
  readable.pipe(res);
})


app.post('/agendaFile',async (req,res)=>{
  await fs.writeFile(endp.conf.agendaFile, JSON.stringify(req.body,null,2), (err) => {
    if (err) throw err;
    console.log('The file has been saved!',req.body);
  })
  res.send()
})

restGetSetConf("nickName");
restGetSet("hostName",sys.getHostName,sys.setHostName);

app.get("/rssi",(req,res)=>{
  res.setHeader('Content-Type', 'application/json');
  res.json({value:sys.getRSSI()});
})

///////////
// Event

import audioPlayer from './modules/AudioPlayer'
import relay from'./modules/Relay'

app.post("/event",(req,res)=>{
  try{
    console.warn('new Event',req.body)
    if(req.body.type==="activate"){
    const active = req.body.value;
    audioPlayer.activate(active);
    relay.activate(active)
  }
    
  }
  catch(e){
    console.error("event error", e);
    res.send(e);
  }
  res.send();
})
