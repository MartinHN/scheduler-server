import { OSCCap, OSCTrigMessage } from '@/types/CapTypes';
import osc from 'osc'
import * as dbg from '../dbg'

import ConfFileWatcher from '../ConfFileWatcher';

function isNumeric(str) {
    if (typeof str != "string") return false // we only process strings!  
    return !isNaN(str as any) && // use type coercion to parse the _entirety_ of the string (`parseFloat` alone does not do this)...
        !isNaN(parseFloat(str)) // ...and ensure strings of whitespace fail
}

export default class OSCSenderModule {
    confWatcher: ConfFileWatcher;
    udpPort: any;
    confData: OSCCap
    _timeouts = {} as { [id: string]: any }
    _looper: any;
    constructor(public confFile: string) {
        this.confWatcher = new ConfFileWatcher(confFile, obj => { this.parseConf(obj) }, {});
    }


    parseConf(o: OSCCap) {
        if (o.loopTime !== undefined) {
            o.loopTime = parseInt('' + o.loopTime);
        }
        this.confData = o
        try {
            this.udpPort = new osc.UDPPort({
                localAddress: "0.0.0.0",
                localPort: 0,// 7777,//this.msgCb ? port : undefined,
                // multicast,
                // multicastMembership: membership,
                remoteAddress: o.ip,
                remotePort: o.port// this.msgCb ? undefined : port
                , metadata: true
            });
            this.udpPort.open();

        }
        catch (e) {
            dbg.error("osc conf failed", e)
        }
    }

    sendMessages(messL: OSCTrigMessage[]) {
        try {
            if (this.udpPort) {
                const ip = this.confData.ip;
                const port = this.confData.port;
                messL.map(m => {
                    const spl = m.address.split(':')
                    const args = this.parseArgList(m.args)
                    if (spl && spl.length === 2) {
                        const trueAddr = spl[1]
                        const timeDelMs = parseFloat(spl[0]) * 1000.0
                        dbg.log("deffering message", timeDelMs)
                        if (this._timeouts[trueAddr]) {
                            clearTimeout(this._timeouts[trueAddr])
                        }
                        this._timeouts[trueAddr] = setTimeout(() => { this.sendMessages([{ address: trueAddr, args }]) }, timeDelMs)
                        return;
                    }
                    else {
                        const msg = { address: m.address, args }
                        dbg.log('[oscSender] sending msg', JSON.stringify(msg));
                        this.udpPort.send(msg, ip, port);
                    }
                })
            }
        }
        catch (e) {
            dbg.error("[oscSender] cant send osc", e)
        }
    }
    parseArgList(l) {
        if (!l) return []
        let res = JSON.parse(JSON.stringify(l))

        res = res.map(e => {
            if (typeof e === "string") {
                if (e.startsWith('f::')) { return { type: 'f', value: parseFloat(e.substring(3)) } }
                else if (e.startsWith('i::')) { return { type: 'i', value: parseInt(e.substring(3)) } }
                else if (isNumeric(e)) {
                    if (e.includes('.')) {
                        return { type: 'f', value: parseFloat(e) }
                    }
                    else {
                        return { type: 'i', value: parseInt(e) }
                    }
                }

            } return e;
        })
        res = osc.annotateArguments(res);

        return res;
    }

    clearPendingMsgs() {
        for (const t of Object.values(this._timeouts)) {
            clearTimeout(t)
        }
        this._timeouts = {}
    }


    activate(b: boolean) {
        if (this._looper) {
            clearInterval(this._looper);
        }

        if (b && (this.confData.loopTime > 0)) {
            this._looper = setInterval(() => {
                this.sendMessages(this.confData.onMessages || [])
            }
                , this.confData.loopTime * 1000)
        }
        this.clearPendingMsgs();
        this.sendMessages((b ? this.confData.onMessages : this.confData.offMessages) || [])
    }
}
