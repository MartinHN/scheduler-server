

////////////////////////
// SERVE
import fs from 'fs';
import express from 'express'
import cors from 'cors'
import conf from './config'

import https from 'https'
import http from 'http'
const app = express();

app.use(cors())
app.use(express.json())

if(!fs.existsSync(conf.agendasFolder))
  fs.mkdirSync(conf.agendasFolder)

if(!fs.existsSync(conf.groupFile))
  fs.writeFileSync(conf.groupFile,'{}',{ encoding: 'utf-8' })

export function startServer(){
  const httpProto = conf.usehttps?https:http
  const server = conf.usehttps? httpProto.createServer(conf.credentials as any,app):httpProto.createServer(app)
  server.listen(conf.serverPort, () =>
  console.log(`Global Server listening on port ${conf.serverPort}!`));
  return server
}

app.use(express.static("../view-dist", {
  etag: false
}))

app.use(express.static("./public/data", {
  etag: false
}))


function getFileNameFromQ(req){
  let fn = req.query.n
  if(Array.isArray(fn))fn=fn[0]
  if(!(fn as string).endsWith(".json")){
    fn = fn+".json"
  }
  return conf.agendasFolder+"/"+fn
}

app.get('/groups',(req,res)=>{
  res.setHeader('Content-Type', 'application/json');
  var readable = fs.createReadStream(conf.groupFile);
  readable.pipe(res);
})


app.post('/groups',async (req,res)=>{
  await fs.writeFile(conf.groupFile, JSON.stringify(req.body,null,2), (err) => {
    if (err) throw err;
    console.log('The file has been saved!',req.body);
  })
  res.send()
})



app.get('/agendas',(req,res)=>{
  console.log("get agenda")
  const fn =getFileNameFromQ(req)
  res.setHeader('Content-Type', 'application/json');
  var readable = fs.createReadStream(fn);
  readable.pipe(res);
  
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
  console.log("listing agenda dir",conf.agendasFolder)
  const o = new Array<string>()
  fs.readdir(conf.agendasFolder, function (err, files) {
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
