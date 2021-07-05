import  WebSocket from  'ws';

export interface WSSimple extends WebSocket{
    msg(s:string):void;
  }



export interface SrvSimple extends WebSocket.Server{
  broadcast(msg:any):void
  sendTo(w:WebSocket,msg:any):void
}

function buildI  (_w:WebSocket){
  const w = _w as WSSimple
  w.msg =(s:string)=>{
    w.send(JSON.stringify({i:s}));
    }
   
  return w
}

function buildS(_s:WebSocket.Server)
{
  const s = _s as SrvSimple
  s.broadcast = function (msg:any){
    s.clients.forEach(c=>s.sendTo(c,msg))
  }
  s.sendTo = function(w,msg){
   w.send(JSON.stringify(msg))
  }
  return s;
}
  
  function handleClientMessage(ws:WSSimple,message:any){
    console.log('Received Message: ' + message);
    ws.msg("ok")
  }

  
export function startWS(server){
    const wsServer = buildS(new WebSocket.Server({
        server
        // autoAcceptConnectio  ns: true
    }));
    wsServer.on('connection', function(_ws) {
        console.log((new Date()) + ' Connection accepted.');
        const ws =  buildI(_ws) 
        
        ws.on('message', function(message) {
            let str = message.toString()
            // if(str)
            handleClientMessage(ws,JSON.parse(str))
        });
        ws.on('close', function(reasonCode, description) {
            console.log((new Date()) + ' Peer ' + ws.url + ' disconnected.');
        });
        ws.on('error', function(reasonCode, description) {
            console.log((new Date()) + ' Peer ' + ws.url + ' disconnected.');
        });
    });
    
    return wsServer;
}
