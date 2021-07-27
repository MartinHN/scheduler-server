import  osc from 'osc';
const audioPlayerIp = "0.0.0.0"
const audioPlayerPort = 9009

const udpPort = new osc.UDPPort({
    localAddress: "0.0.0.0",
    localPort: 7777,//this.msgCb ? port : undefined,
    // multicast,
    // multicastMembership: membership,
    remoteAddress: audioPlayerIp,
    remotePort:audioPlayerPort// this.msgCb ? undefined : port
});
udpPort.open();

function sendOSC(address:string,...args:any){
    const msg = {address,args:args===undefined?[]:args}
    udpPort.send(msg,audioPlayerIp,audioPlayerPort);
}

class AudioPlayer{
    go(fromTime?:number){
            sendOSC("/play")
        }
}
export default new AudioPlayer() 
