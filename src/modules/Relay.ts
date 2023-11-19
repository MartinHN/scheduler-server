import GpioM from 'pigpio'
import { isPi } from '../platformUtil'
import * as dbg from '../dbg'

class RelayWr {
    pimpl?: any
    constructor(public pin: number) {
        if (isPi) {
            const Gpio = GpioM.Gpio
            this.pimpl = new Gpio(pin, { mode: Gpio.OUTPUT });
        }
    }
    digitalWrite(b: boolean) {
        if (this.pimpl) {
            dbg.log('Relay is ', b)
            this.pimpl.digitalWrite(b ? 1 : 0)
        }
        else {
            // dbg.log('Relay should be', b)
        }
    }
}

class Relay {
    pinNums = [25]
    rels: RelayWr[]
    constructor() {
        this.rels = []
        this.pinNums.forEach(n => this.rels.push(new RelayWr(n)))
    }

    activate(b: boolean) {
        dbg.log("gpio :", b)
        this.rels.map(r => r.digitalWrite(b))

    }
}

export default new Relay()
