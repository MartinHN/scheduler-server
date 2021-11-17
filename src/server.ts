

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
const app = express();

app.use(cors())
app.use(express.json())





export function startServer(cb){
  const httpProto = conf.usehttps?https:http
  const server = conf.usehttps? httpProto.createServer(conf.credentials as any,app):httpProto.createServer(app)
  server.listen(conf.serverPort, () =>{
    console.log(`Global Server listening on port ${conf.serverPort}!`);
    if(cb){cb(conf);}
   } );
  return server
}

const viewerHTMLBasePath = appPaths.getConf().viewerHTMLBasePath

console.log(">>> static files served at ",viewerHTMLBasePath)
fs.readdirSync(viewerHTMLBasePath).forEach(file => {
  console.log("    ",file);
});

app.use(express.static(viewerHTMLBasePath, {
  etag: false
}))

app.use(express.static("./public/data", {
  etag: false
}))


function getFileNameFromQ(req){

  let fn = req.query.n
  
  if(Array.isArray(fn))fn=fn[0]
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
    console.log('The file has been saved!',req.body);
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
    console.log('The file has been saved!',req.body);
  })
  res.send()
})


////////////////////
// Agendas
app.get('/agendas',(req,res)=>{
  const fn =getFileNameFromQ(req)
  console.log("get agenda",fn)
  if (fs.existsSync(fn)){
  res.setHeader('Content-Type', 'application/json');
  var readable = fs.createReadStream(fn);
  readable.pipe(res);
  }
  else{
    console.error("agenda not found")
    res.sendStatus(404)
  }
  
})

app.delete('/agendas',(req,res)=>{
  console.log("delete agenda")
  const fn =getFileNameFromQ(req)
  if(fs.existsSync(fn)){
    fs.unlinkSync(fn);
  }
})

app.post('/agendas',async (req,res)=>{
  console.log("post agenda")
 const fn =getFileNameFromQ(req)
  console.log("creating agenda",fn)
  
  await fs.writeFile(fn, JSON.stringify(req.body,null,2), (err) => {
    if (err) throw err;
    console.log('The file has been saved!',req.body);
  })
  res.send()
})

app.get('/agendaNames',(req,res)=>{
  console.log("listing agenda dir",appPaths.getConf().agendasFolder)
  const o = new Array<string>()
  fs.readdir(appPaths.getConf().agendasFolder, function (err, files) {
    //handling error
    if (err) {
      return console.log('Unable to scan directory: ' + err);
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
