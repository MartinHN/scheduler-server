import WebSocket, { OpenEvent } from 'ws';
let connection !: WebSocket

function msg(m: string) {
  connection.send(JSON.stringify({ i: m }))
}
setInterval(() => {
  if (connection && (connection.readyState === WebSocket.CLOSED)) {
    setConnected(false)
    console.warn('trying to restart ws')
    wrap.start()
  }
}, 3000)

let isConnected = false
let onConChangeCB!: (b: boolean) => void
let messageCB!: (b: any) => void
function setConnected(b: boolean) {
  if (b === isConnected) return
  isConnected = b
  if (onConChangeCB) {
    onConChangeCB(isConnected)
  }
}

const wrap = {
  init(_messageCB: (m: any) => void, _conChangeCB?: (b: boolean) => void): void {
    if (_conChangeCB) onConChangeCB = _conChangeCB
    messageCB = _messageCB
    this.start()
  },
  isConnected(): boolean { return connection && (connection.readyState === WebSocket.OPEN) },
  start(): void {
    if (connection && (connection.readyState !== WebSocket.CLOSED)) { console.error('ws already strarted'); return }
    console.log('Starting connection to WebSocket Server')
    const url = "7.7.7.1" // regie on lumestrio_regie
    const port = "3003"
    const wsAddr = 'ws://' + url + ':' + port
    console.log('tryConnelkjjct ws :', wsAddr)
    connection = new WebSocket(wsAddr)

    connection.onmessage = function (event: WebSocket.MessageEvent) {
      // console.log('new from serv', event.data)
      let payload;
      if (event.type === "message")
        payload = JSON.parse(event.data as any)
      if (!payload) { console.error("invalid payload", event.type, typeof (event.data), event.data); return }
      if (messageCB) messageCB(payload)
    }

    connection.onopen = function (event: OpenEvent) {
      setConnected(true)
      // console.log(event)
      console.log('Successfully connected to the  websocket server...')
      // msg('hello')
      // console.log('sent')
    }
    connection.onclose = (ev: WebSocket.CloseEvent) => {
      console.error('ws close', ev)
      setConnected(false)
      // setTimeout(this.start, 1000)
    }

    connection.onerror = (ev: WebSocket.ErrorEvent) => {
      console.error('ws err', ev)
      setConnected(false)
      // setTimeout(this.start, 1000)
    }
    // return connection
  },
  send(buf: Buffer): void {
    if (connection.readyState !== WebSocket.OPEN) {
      console.error('ws not opened , cant send ')
      return
    }
    connection.send(JSON.stringify({ addr: "loraMsg", args: buf }))
  },
  ws: connection
}

export default wrap
