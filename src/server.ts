

////////////////////////
// SERVE
import fs from 'fs';
import express from 'express'
import cors from 'cors'
import conf from './config'
const app = express();

app.use(cors())
app.use(express.json())

export function startServer(){
  

app.listen(3003, () =>
console.log(`Example app listening on port ${conf.PORT}!`),
);
}

app.get('/zones',(req,res)=>{
  res.setHeader('Content-Type', 'application/json');
  var readable = fs.createReadStream(conf.filePath);
  readable.pipe(res);
})


app.post('/zones',async (req,res)=>{
  
  await fs.writeFile(conf.filePath, JSON.stringify(req.body,null,2), (err) => {
    if (err) throw err;
    console.log('The file has been saved!',req.body);
  })
  res.send()
})
