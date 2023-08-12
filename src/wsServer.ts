import WebSocket from 'ws';
import * as dbg from './dbg'
export interface WSSimple extends WebSocket {
  msg(s: string): void;
}



export interface SrvSimple extends WebSocket.Server {
  broadcast(msg: any): void
  broadcastBut(msg: any, sock: WebSocket): void
  sendTo(w: WebSocket, msg: any): void
  onMessage(w: WebSocket, msg: any): void
}

function buildI(_w: WebSocket) {
  const w = _w as WSSimple
  w.msg = (s: string) => {
    w.send(JSON.stringify({ i: s }));
  }

  return w
}

function buildS(_s: WebSocket.Server) {
  const s = _s as SrvSimple
  s.broadcast = function (msg: any) {
    s.clients.forEach(c => s.sendTo(c, msg))
  }
  s.broadcastBut = function (msg: any, butMe: WebSocket) {
    let hadSkipped = false;
    s.clients.forEach(c => {
      if (c != butMe) {
        s.sendTo(c, msg);
      }
      else hadSkipped = true;
    })
    if (!hadSkipped)
      console.warn('broadcastBut did not skip')
  }
  s.sendTo = function (w, msg) {
    if (w.readyState !== WebSocket.OPEN) {
      console.warn("can't send, socket was closed")
      return
    }
    w.send(JSON.stringify(msg))
  }
  return s;
}




export function startWS(server) {
  const wsServer = buildS(new WebSocket.Server({
    server
    // autoAcceptConnectio  ns: true
  }));
  wsServer.on('connection', function (_ws) {
    // dbg.log((new Date()) + ' Connection accepted.');
    const ws = buildI(_ws)

    ws.on('message', function (message) {
      let str = message.toString()
      // dbg.log('Received Message: ' + message);
      // if(str)
      if (wsServer.onMessage) { wsServer.onMessage(ws, JSON.parse(str)) }
      else { throw new Error("no cb given") }

      // ws.msg("ok")
    });

    ws.on('close', function (reasonCode, description) {
      // dbg.log((new Date()) + ' ws Peer ' + ws.url + ' disconnected.');
    });

    ws.on('error', function (reasonCode, description) {
      dbg.error((new Date()) + 'ws Peer ' + ws.url + ' disconnected.');
    });
  });

  return wsServer;
}
