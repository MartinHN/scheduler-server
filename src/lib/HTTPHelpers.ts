import * as http from 'http'
import * as dbg from '../dbg'

export async function postJSON(hostname:string,path:string,port:number,odata:any){
    
  const data = JSON.stringify(odata)
    const options = {
        hostname,
        port,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': data.length
        }
      }
      
      const req = http.request(options, res => {
        // dbg.log(`statusCode: ${res.statusCode}`)
      
        res.on('data', d => {
        //   process.stdout.write(d)
        dbg.log(">>>>> http post data",d)
        })
      })
      
      req.on('error', error => {
        dbg.error(">>>>> http post error",error)
      })
      
      await req.write(data)
      await req.end()
}


// export async function getJSON(hostname:string,path:string,port:number){
//   return new Promise((resolve,reject)=>{
  
//     const options = {
//         hostname,
//         port,
//         path,
//         method: 'GET',
//         // headers: {
//         //   'Content-Type': 'application/json',
//         //   'Content-Length': data.length
//         // }
//       }

//             const req = http.request(options, res => {
//         dbg.log(`statusCode: ${res.statusCode}`)
      

//         const bodyChunks = [];
//         res.on('data', function(chunk) {
//           // You can process streamed parts here...
//           bodyChunks.push(chunk);
//         }).on('end', async function() {
//           const remoteData = Buffer.concat(bodyChunks).toString();
//           resolve(remoteData)
//       }).on('error', error => {
//         dbg.error(">>>>> http post error",error)1
//         reject(error);
//       })
//     })
      
//       // await req.write(data)
//       req.end()
//   })

// }
