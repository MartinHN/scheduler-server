import fs from 'fs'
import * as uConf from './userConf'
import * as dbg from './dbg'
import path from 'path'
export default class ConfFileWatcher {
    constructor(public confFile: string, public cb: (confObj: any) => void, public defaultConf = ({} as any)) {

        if (!fs.existsSync(this.confFile)) {
            dbg.warn("generating default conf", confFile)
            fs.mkdirSync(path.dirname(this.confFile), { recursive: true })
            this.writeConf(defaultConf);
        }
        this.loadConf('init')
        fs.watch(confFile, { encoding: 'utf-8' }, () => { this.loadConf('change') });
    }


    writeConf(data: any) {
        let sData = data
        if (typeof data !== "string") {
            sData = JSON.stringify(data);
        }
        uConf.setRW(true)
        fs.writeFileSync(this.confFile, sData, { encoding: 'utf-8' })
        uConf.setRW(false)
    }

    async loadConf(hint = "change") {
        dbg.log('loadinf conf', this.confFile);
        let data;
        let content;
        try {
            if (!fs.existsSync(this.confFile))
                throw new Error("no file for conf")
            content = fs.readFileSync(this.confFile).toString()
            data = JSON.parse(content)
        }
        catch (e) {
            dbg.error("error opening conf set default instead\n", this.confFile, content, e)
            data = this.defaultConf
        }
        try {
            this.cb(data)
        }
        catch (e) {
            dbg.error("error parsing conf", this.confFile, e)
        }
    }
}
