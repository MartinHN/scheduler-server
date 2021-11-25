import {OSCServerModule} from './lib/OSCServerModule'

const mmPort = 12000;
const qlcPort = 9009;

let lastTime = 0;


/// describe basic functionality of endpoints
function handleMsg(msg,time,info: {address:string,port:number}){
  console.log("madmap rcvd",info.address,info.port,msg.address)
  if((msg.address === "/time") && msg.args.length>0){
    const newTime = parseFloat( msg.args[0])
const dt = Math.abs(newTime - lastTime);
const isInf = newTime < lastTime;
lastTime = newTime;
if(isInf && dt >0.5){
  go();
}
  }
 
}

const mmOSC= new OSCServerModule((msg,time,info)=>{
  handleMsg(msg,time,info)
});


function go(){
  mmOSC.send("/go",[1],"0.0.0.0",qlcPort)
}


mmOSC.connect("0.0.0.0",mmPort);
