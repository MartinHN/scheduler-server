

////////////////////////
// SERVE
import fs from 'fs';
import path from 'path'
import express from 'express'
import cors from 'cors'
import conf from './config'
import * as appPaths from './filePaths'
import https from 'https'
import http from 'http'
import * as  sys  from './sysUtils';
import * as dbg from './dbg'
const app = express();

app.use(cors())
app.use(express.json())

app.use(function(req, res, next){
  if (req.is('text/*')) {
    req.body = '';
    req.setEncoding('utf8');
    req.on('data', function(chunk){ req.body += chunk });
    req.on('end', next);
  } else {
    next();
  }
});



export function startServer(cb){
  const httpProto = conf.usehttps?https:http
  const server = conf.usehttps? httpProto.createServer(conf.credentials as any,app):httpProto.createServer(app)
  server.listen(conf.serverPort, () =>{
    dbg.log(`Global Server listening on port ${conf.serverPort}!`);
    if(cb){cb(conf);}
   } );
  return server
}

const viewerHTMLBasePath = appPaths.getConf().viewerHTMLBasePath

dbg.log(">>> static files served at ",viewerHTMLBasePath)
fs.readdirSync(viewerHTMLBasePath).forEach(file => {
  dbg.log("    ",file);
});


app.use(express.static("./public/data", {
  etag: false
}))


function getFirstReqArg(req){
  let fn = req.query.n
  if(Array.isArray(fn))fn=fn[0]
  return fn
}

function getFileNameFromQ(req){
  let fn = getFirstReqArg(req)
  if(fn && (!(fn as string).endsWith(".json"))){
    fn = fn+".json"
  }
  return appPaths.getConf().agendasFolder+"/"+fn
}

////////////////////
// DEvice
app.get('/knownDevices',(req,res)=>{
  res.setHeader('Content-Type', 'application/json');
  var readable = fs.createReadStream(appPaths.getConf().knownDevicesFile);
  readable.pipe(res);
})


app.post('/knownDevices',async (req,res)=>{
  await fs.writeFile(appPaths.getConf().knownDevicesFile, JSON.stringify(req.body,null,2), (err) => {
    if (err) throw err;
    dbg.log('The file has been saved!',req.body);
  })
  res.send()
})

app.post("/resetRasps", async(req,res)=>{
  await sys.removeAllRasps();
  res.send();
  
})




////////////////////
// Groups
app.get('/groups',(req,res)=>{
  res.setHeader('Content-Type', 'application/json');
  var readable = fs.createReadStream(appPaths.getConf().groupFile);
  readable.pipe(res);
})


app.post('/groups',async (req,res)=>{
  await fs.writeFile(appPaths.getConf().groupFile, JSON.stringify(req.body,null,2), (err) => {
    if (err) throw err;
    dbg.log('The file has been saved!',req.body);
  })
  res.send()
})



////////////////////
// Agendas
app.get('/agendas',(req,res)=>{
  const fn =getFileNameFromQ(req)
  dbg.log("get agenda",fn)
  if (fs.existsSync(fn)){
  res.setHeader('Content-Type', 'application/json');
  var readable = fs.createReadStream(fn);
  readable.pipe(res);
  }
  else{
    dbg.error("agenda not found")
    res.sendStatus(404)
  }
  
})

app.delete('/agendas',(req,res)=>{
  dbg.log("delete agenda")
  const fn =getFileNameFromQ(req)
  if(fs.existsSync(fn)){
    fs.unlinkSync(fn);
  }
  res.send();
})

app.post('/agendas',async (req,res)=>{
  dbg.log("post agenda")
 const fn =getFileNameFromQ(req)
  dbg.log("creating agenda",fn)
  
  await fs.writeFile(fn, JSON.stringify(req.body,null,2), (err) => {
    if (err) throw err;
    dbg.log('The file has been saved!',req.body);
  })
  res.send()
})

app.get('/agendaNames',(req,res)=>{
  dbg.log("listing agenda dir",appPaths.getConf().agendasFolder)
  const o = new Array<string>()
  fs.readdir(appPaths.getConf().agendasFolder, function (err, files) {
    //handling error
    if (err) {
      return dbg.log('Unable to scan directory: ' + err);
    } 
    //listing all files using forEach
    files.forEach(function (file) {
      // Do whatever you want to do with the file
      if(file.endsWith('.json'))
      o.push(file)
    });
    res.json(o);
  });
  
})

app.post("/resetAgendas", async(req,res)=>{
  await sys.removeAllAgendas();
  
  res.send();
  
})

app.get('/state',(req,res)=>{
  res.setHeader('Content-Type', 'application/json');

  const appFilePaths = appPaths.getConf();
  const knownDevices = (appPaths.getFileObj(appFilePaths.knownDevicesFile) || {} ) as DeviceDic
  const groups = (appPaths.getFileObj(appFilePaths.groupFile) || {} )as Groups
  const agendas =fs.readdirSync(appPaths.getConf().agendasFolder).map(e=>{return {filename:e,data:appPaths.getFileObj(appPaths.getConf().agendasFolder+e)}})
  const state={knownDevices,agendas,groups};
  dbg.warn("getting state",state)
  res.json(state)
})


app.post('/state',async (req,res)=>{
  const state = req.body;
  const appFilePaths = appPaths.getConf();
  if(!state || !state.knownDevices || !state.groups || !state.agendas){
    return false;
  }
  appPaths.writeFileObj(appFilePaths.knownDevicesFile,state.knownDevices);
  appPaths.writeFileObj(appFilePaths.knownDevicesFile,state.knownDevices);
  for(const [k,v] of Object.entries(state.agendas)){
    const fn = appPaths.getConf().agendasFolder+ k;
    appPaths.writeFileObj(fn,v);
  }
  res.send()
})


/// serve Vue

import history from 'connect-history-api-fallback'
import { DeviceDic, Groups } from './types';
app.use(history({}))

app.use(express.static(viewerHTMLBasePath, {
  etag: false
}))
