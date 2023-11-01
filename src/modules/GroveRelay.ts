// import { GrovePi } from 'node-grovepi'
import * as i2c from 'i2c-bus'
import * as fs from 'fs'
import { isPi } from '../platformUtil'
import * as dbg from '../dbg'


const commands = {
    //Command Format
    // digitalRead() command format header
    dRead: [1]
    // digitalWrite() command format header
    , dWrite: [2]
    // analogRead() command format header
    , aRead: [3]
    // analogWrite() command format header
    , aWrite: [4]
    // pinMode() command format header
    , pMode: [5]
    // Ultrasonic read
    , uRead: [7]
    // Get firmware version
    , version: [8]
    // Accelerometer (+/- 1.5g) read
    , acc_xyz: [20]
    // RTC get time
    , rtc_getTime: [30]
    // DHT Pro sensor temperature
    , dht_temp: [40]

    // Grove LED Bar commands
    // Initialise
    , ledBarInit: [50]
    // Set orientation
    , ledBarOrient: [51]
    // Set level
    , ledBarLevel: [52]
    // Set single LED
    , ledBarSetOne: [53]
    // Toggle single LED
    , ledBarToggleOne: [54]
    // Set all LEDs
    , ledBarSet: [55]
    // Get current state
    , ledBarGet: [56]

    // Grove 4 Digit Display commands
    // Initialise
    , fourDigitInit: [70]
    // Set brightness, not visible until next cmd
    , fourDigitBrightness: [71]
    // Set numeric value without leading zeros
    , fourDigitValue: [72]
    // Set numeric value with leading zeros
    , fourDigitValueZeros: [73]
    // Set individual digit
    , fourDigitIndividualDigit: [74]
    // Set individual leds of a segment
    , fourDigitIndividualLeds: [75]
    // Set left and right values with colon
    , fourDigitScore: [76]
    // Analog read for n seconds
    , fourDigitAnalogRead: [77]
    // Entire display on
    , fourDigitAllOn: [78]
    // Entire display off
    , fourDigitAllOff: [79]

    // Grove Chainable RGB LED commands
    // Store color for later use
    , storeColor: [90]
    // Initialise
    , chainableRgbLedInit: [91]
    // Initialise and test with a simple color
    , chainableRgbLedTest: [92]
    // Set one or more leds to the stored color by pattern
    , chainableRgbLedSetPattern: [93]
    // Set one or more leds to the stored color by modulo
    , chainableRgbLedSetModulo: [94]
    // Sets leds similar to a bar graph, reversible
    , chainableRgbLedSetLevel: [95]

    // Grove IR sensor
    // Read the button from IR sensor
    , irRead: [21]
    // Set pin for the IR reciever
    , irRecvPin: [22]

    // Grove Dust sensor
    , dustSensorRead: [10]
    , dustSensorEn: [14]
    , dustSensorDis: [15]

    // Encoder
    , encoderRead: [11]
    , encoderEn: [16]
    , encoderDis: [17]

    // Grove Flow sensor
    , flowRead: [12]
    , flowEn: [18]
    , flowDis: [13]

    // This allows us to be more specific about which commands contain unused bytes
    , unused: 0
};

// var I2CCMD = 1
// var debugMode = false
var i2c0Path = '/dev/i2c-0'
var i2c1Path = '/dev/i2c-1'
var bus = undefined
var busNumber

// var initWait = 1     // in seconds

// var isInit = false
// var isBusy = false
var isHalt = false

var ADDRESS = 0x04

var onError, onInit
class Board {
    BYTESLEN = 4
    INPUT = 'input'
    OUTPUT = 'output'

    constructor() {
        this.init();
    }
    init() {
        if (fs.existsSync(i2c0Path)) {
            isHalt = false
            busNumber = 0
        } else if (fs.existsSync(i2c1Path)) {
            isHalt = false
            busNumber = 1
        } else {
            var err = new Error(' could not determine your i2c device')
            isHalt = true
            if (typeof onError == 'function')
                onError(err)
            console.error(err)
        }

        if (!bus) {
            console.warn(">>>>>>>>>opening bus", busNumber)
            bus = i2c.openSync(busNumber)
        }
    }

    checkStatus() { return bus !== undefined; }
    writeBytes(bytes) {
        var isOperative = this.checkStatus()
        if (!isOperative) { console.error("i2c not operative"); return false }

        var buffer = Buffer.from(bytes)
        var ret = false
        try {
            // console.warn(">>>i2C", ADDRESS, buffer);
            var val = bus.i2cWriteSync(ADDRESS, buffer.length, buffer)
            ret = val > 0 ? true : false
        } catch (err) {
            console.error("can't write i2c", err)
            ret = false
        } finally {
            return ret
        }
    }
    pinMode(pin, mode) {
        var isOperative = this.checkStatus()
        if (!isOperative) { console.error("i2c not operative"); return false }

        if (mode == this.OUTPUT) {
            return this.writeBytes(commands.pMode.concat([pin, 1, commands.unused]))
        } else if (mode == this.INPUT) {
            return this.writeBytes(commands.pMode.concat([pin, 0, commands.unused]))
        } else {
            console.log('Unknown pin mode')
        }
    }

    // checkStatus() {
    //     if (!isInit || isHalt) {
    //         if (!isHalt) {
    //             console.log('GrovePi needs to be initialized.')
    //         } else {
    //             console.log('GrovePi is not operative because halted')
    //         }
    //         return false
    //     }
    //     return true
    // }
    //   GrovePi.prototype.debug = function(msg) {
    //     if (this.debugMode)
    //       log.info('GrovePi.board', msg)
    //   }
    //   GrovePi.prototype.wait = function(ms) {
    //     sleep.usleep(1000 * ms)
    //   }

    // GrovePi functions
}

const board = new Board()


class RelayWr {
    pimpl?: any
    constructor(public pin: number) {
        if (isPi) {
            board.pinMode(pin, board.OUTPUT)
            this.pimpl = true;
        }
    }
    digitalWrite(b: boolean) {
        if (this.pimpl) {
            dbg.log('Relay is ', b)

            return board.writeBytes(commands.dWrite.concat([this.pin, !!b ? 1 : 0, commands.unused]))
        }
        else {
            // dbg.log('Relay should be', b)
        }
    }
}

class GroveRelay {
    pinNums = [2]
    rels: RelayWr[]
    constructor() {
        this.rels = []
        this.pinNums.forEach(n => this.rels.push(new RelayWr(n)))
    }

    activate(b: boolean) {
        // dbg.log("grove gpio :", b)
        this.rels.map(r => r.digitalWrite(b))

    }
}

export default new GroveRelay()
