

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

if(!fs.existsSync(conf.groupFolder))
  fs.mkdirSync(conf.groupFolder)

export function startServer(){
  const httpProto = conf.usehttps?https:http
  const server = conf.usehttps? httpProto.createServer(conf.credentials as any,app):httpProto.createServer(app)
  server.listen(conf.serverPort, () =>
  console.log(`Example app listening on port ${conf.serverPort}!`));
  return server
}

app.use(express.static("../view-dist", {
  etag: false
}))

app.get('/zones',(req,res)=>{
  res.setHeader('Content-Type', 'application/json');
  var readable = fs.createReadStream(conf.zonesFile);
  readable.pipe(res);
})


app.post('/zones',async (req,res)=>{
  await fs.writeFile(conf.zonesFile, JSON.stringify(req.body,null,2), (err) => {
    if (err) throw err;
    console.log('The file has been saved!',req.body);
  })
  res.send()
})


app.get('/group/:n',(req,res)=>{
  res.setHeader('Content-Type', 'application/json');
  var readable = fs.createReadStream(conf.groupFolder+"/"+req.params.n);
  readable.pipe(res);
  
})

app.post('/group/:n',async (req,res)=>{
  console.log("posted")
  let fn = req.params.n
  if(Array.isArray(fn))fn=fn[0]
  if(!(fn as string).endsWith(".json")){
    fn = fn+".json"
  }
  console.log("creating group",fn)
  
  await fs.writeFile(conf.groupFolder+"/"+fn, JSON.stringify(req.body,null,2), (err) => {
    if (err) throw err;
    console.log('The file has been saved!',req.body);
  })
  res.send()
})

app.get('/groups',(req,res)=>{
  console.log("listing group dir")
  const o = new Array<string>()
  fs.readdir(conf.groupFolder, function (err, files) {
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
  });
  res.json(o);
  
})
