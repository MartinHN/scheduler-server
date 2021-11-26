import  osc from 'osc';
import * as dbg from '../dbg'
const audioPlayerIp = "0.0.0.0"
const audioPlayerPort = 9009


class AudioPlayer{
    udpPort:any;
    init(){
            this.udpPort=new osc.UDPPort({
            localAddress: "0.0.0.0",
            localPort: 0,// 7777,//this.msgCb ? port : undefined,
            // multicast,
            // multicastMembership: membership,
            remoteAddress: audioPlayerIp,
            remotePort:audioPlayerPort// this.msgCb ? undefined : port
        });
       this.udpPort.open();
        
    }
        
    sendOSC(address:string,...args:any){
    const msg = {address,args:args===undefined?[]:args}
    this.udpPort.send(msg,audioPlayerIp,audioPlayerPort);
    }
    
    activate(b:boolean){
        dbg.log("act",b)
        if(b){
            this.sendOSC("/loop")
        }
        else
        {this.sendOSC("/stop")}
    }

}
export default new AudioPlayer() 
