import { OSCCap, OSCTrigMessage } from '@/types/CapTypes';
import osc from 'osc'
import * as dbg from '../dbg'

import ConfFileWatcher from '../ConfFileWatcher';

function isNumeric(str) {
    if (typeof str != "string") return false // we only process strings!  
    return !isNaN(str as any) && // use type coercion to parse the _entirety_ of the string (`parseFloat` alone does not do this)...
        !isNaN(parseFloat(str)) // ...and ensure strings of whitespace fail
}

class VermuthModule {
    udpPort: any;

    constructor() {

    }

    init() {
        try {
            this.udpPort = new osc.UDPPort({
                localAddress: "0.0.0.0",
                localPort: 0,// 7777,//this.msgCb ? port : undefined,
                // multicast,
                // multicastMembership: membership,
                remoteAddress: "0.0.0.0",
                remotePort: 11000// this.msgCb ? undefined : port

            });
            this.udpPort.open();

        }
        catch (e) {
            dbg.error("[Vermuth] conf failed", e)
        }
    }

    sendMessage(msg: { address: string, args: any }) {
        try {
            dbg.log('[Vermuth] sending msg', JSON.stringify(msg));
            this.udpPort.send(msg);
        }
        catch (e) {
            dbg.error("[Vermuth] cant send osc", e)
        }
    }
    activate(b: boolean) {

        const msg = b ? {
            address: '/sequencePlayer/startLoop', args: []
        } :
            {
                address: '/sequencePlayer/stopIfPlaying', args: [true]
            }
        this.sendMessage(msg)
    }
}

export default new VermuthModule()
