import GpioM from 'pigpio'
import {isPi} from '../sysUtils'


class RelayWr{
    pimpl?:any
    constructor(){
        if(isPi){
            const Gpio = GpioM.Gpio
            this.pimpl = new Gpio(17, {mode: Gpio.OUTPUT});
        }
    }
    digitalWrite(b:boolean){
        if(this.pimpl){
            this.pimpl.digitalWrite(b?1:0)
        }
        else{
            console.log('Relay should be',b)
        }
    }
}

class Relay{
    rel = new RelayWr()
    activate(b:boolean){
        this.rel.digitalWrite(b)
        
    }
}

export default new Relay()
