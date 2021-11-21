import  os  from 'os';
import  osc from 'osc';
import * as dbg from "../dbg"

export const getIPAddresses = () => {
  const interfaces = os.networkInterfaces();
  const ipAddresses = new Array();
  
  for (const ifName of Object.keys(interfaces)) {
    const addresses = interfaces[ifName];
    for (const addressInfo of addresses) {
      if (addressInfo.family === 'IPv4' && !addressInfo.internal ) {
        ipAddresses.push(addressInfo.address);
      }
    }
  }
  dbg.log({ipAddresses})
  return ipAddresses;
};


export class OSCServerModule {
  udpPort;
  timeout;
  disconnected = false;

  private lastMsgInfo?:any;
  private msgCb?:(...args:any)=>void;
  
  constructor(msgCb = undefined) {
    this.msgCb = msgCb
  }

  networkIsAccessible(){
    return !!getIPAddresses().length
  }
  // static getMulticastIp() {
  //   return '230.1.1.1'
  // }
  connect(ip?:string, port?:number) {
    let multicast = false;
    if (ip && ip.startsWith('230')) {
      multicast = true;
    }
    
    const localIp = '0.0.0.0';
    
    const membership = multicast ?
    getIPAddresses().map(intIp => {
      return {
        address: ip, interface: intIp
      }
    }) :
    undefined  //[{address: ip, interface: localIp}] : undefined
    dbg.log(membership)
    
    const udpPort = new osc.UDPPort({
      localAddress: localIp,  // broadcast//0.0.0.0",
      localPort: this.msgCb ? port : undefined,
      multicast,
      multicastMembership: membership,
      remoteAddress: ip,
      remotePort: this.msgCb ? undefined : port,
    });
    
    this.udpPort = udpPort;
    udpPort.on('ready', () => {
      clearTimeout(udpPort.timeout)
      const ipAddresses = getIPAddresses();
      if(!ipAddresses.length){
        throw new Error("no interface to bind to...")
      }
      udpPort.isConnected = true;
      dbg.log('Listening for OSC over UDP.');
      ipAddresses.forEach((address) => {
        dbg.log(' Host:', address + ', Port:', udpPort.options.localPort);
      });
      dbg.log('SendingTo');
      
      dbg.log(' Host:', udpPort.options.remoteAddress + ', Port:',udpPort.options.remotePort);
    });
    udpPort.on('bundle', this.processBundle.bind(this));
    udpPort.on('message', this.processMsg.bind(this));
    
    udpPort.on('error', (err) => {
      udpPort.isConnected = false;
      dbg.error('[OSC Module] connection error', err);
      this.defferReconnect(udpPort)
    });
    
    this.tryReConnect(udpPort,true)
  }
    
    close(){
      if(this.udpPort){
        dbg.log("closing udpPort")
        this.udpPort.isConnected = false;
        this.udpPort.close();
      }
      else{
        dbg.error("can't close")
      }
    }
    disconnect(){
      if(this.udpPort){
        dbg.error("disconnect",this.udpPort);
        clearTimeout(this.udpPort.timeout);
        this.disconnected = true;
      }
      else{
        dbg.error("can't disconnect");
      }
    }
    defferReconnect(port) {
      if(this.disconnected){
        return;
      }
      clearTimeout(port.timeout)
      port.timeout = setTimeout(this.tryReConnect.bind(this, port), 1000);
    }
    tryReConnect(port,firstAttempt) {
      if (port.isConnected) {
        dbg.log("already connected")
        clearTimeout(this.timeout)
        return;
      }
      if(!firstAttempt)
      dbg.warn('try connect',port.options.localAddress,port.options.localPort)
      try {
        
        port.open();
      } catch (e) {
        dbg.error('can\'t connect to ', port.localAddress, port.localPort,e)
        if(this.msgCb){
          this.defferReconnect(port)
        }
      }
    }
    processMsg(msg, time, info) {
      if(info ){
        this.lastMsgInfo = {address:info.address,port:info.port};
      }
      if (this.msgCb) {
        this.msgCb(msg, time, info);
      }
    }
    
    processBundle(b, time, info) {
      for (const i of Object.keys(b.packets)) {
        const p = b.packets[i];
        if (p.packets) {
          this.processBundle(p, time, info);
        } else {
          this.processMsg(p, time, info);
        }
      }
    }
    
    send(address, args,remoteAddr,remotePort) {
      if (this.udpPort.isConnected) {
        if(address!="/rssi" ){
         dbg.log('sending msg',{address, args},' to',remoteAddr ,remotePort)
        }
        this.udpPort.send({address, args},remoteAddr,remotePort)
      }
      else{
        dbg.warn("[oscServer] not connected")
      }
    }

    get localPort(){
      return this.udpPort && this.udpPort.options.localPort
    }
  }
