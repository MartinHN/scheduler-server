

////////////////////////
// SERVE
import * as dbg from './dbg'
import fs from 'fs';
import express from 'express'
import cors from 'cors'
import conf from './config'
import * as uConf from "./userConf"
import path from 'path'
import https from 'https'
import http from 'http'
import * as sys from './sysUtils'

const app = express();

const endpointDir = path.dirname(conf.agendaFile)
uConf.setRW(true)
if(!fs.existsSync(endpointDir))
fs.mkdirSync(endpointDir)

if(!fs.existsSync(conf.agendaFile))
fs.writeFileSync(conf.agendaFile,'{}',{ encoding: 'utf-8' })
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
  var readable = fs.createReadStream(conf.agendaFile);
  readable.pipe(res);
})


app.post('/agendaFile',async (req,res)=>{
  await fs.writeFile(conf.agendaFile, JSON.stringify(req.body,null,2), (err) => {
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


import audioPlayer from './modules/AudioPlayer'

app.post("/go",(req,res)=>{
  try{
    audioPlayer.go();
    
  }
  catch(e){
    console.error("go error", e);
    res.send(e);
  }
  res.send();
})
