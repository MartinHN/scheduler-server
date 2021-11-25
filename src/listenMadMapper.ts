import {OSCServerModule} from './lib/OSCServerModule'

const mmPort = 12000;
const qlcPort = 7700;

let lastTime = 0;


/// describe basic functionality of endpoints
function handleMsg(msg,time,info: {address:string,port:number}){
  if((msg.address === "/time") && msg.args.length>0){
    const newTime = parseFloat( msg.args[0])
    const dt = Math.abs(newTime - lastTime);
    const isInf = newTime < lastTime;
    if(newTime-lastTime>.01){console.log("newTime",newTime);}
    lastTime = newTime;
    if(isInf && dt >.1){
      go();
    }
  }
  
}

const mmOSC= new OSCServerModule((msg,time,info)=>{
  handleMsg(msg,time,info)
});


function go() {
  mmOSC.send("/stop", [1], "0.0.0.0", qlcPort);
  setTimeout(()=>{
    mmOSC.send("/go", [1], "0.0.0.0", qlcPort);
  },100)
}


mmOSC.connect("0.0.0.0",mmPort);
