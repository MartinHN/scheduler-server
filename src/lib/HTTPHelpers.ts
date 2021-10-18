import * as http from 'http'

export async function postJSON(hostname:string,path:string,port:number,data:string){
    
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
        // console.log(`statusCode: ${res.statusCode}`)
      
        res.on('data', d => {
        //   process.stdout.write(d)
        })
      })
      
      req.on('error', error => {
        console.error(">>>>> http post error",error)
      })
      
      req.write(data)
      await req.end()
}
