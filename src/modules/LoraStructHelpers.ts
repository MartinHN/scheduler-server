export class PingableList {
    records: { [i: string]: number } = {}

    keepAliveMs = 10000
    setPingable(uuid: string, b: boolean) {
        if (!b)
            console.log("stop pinging", uuid, b)
        if (!b) {
            this.remove(uuid)
            return;
        }
        const isFirst = Object.keys(this.records).length = 0
        this.records[uuid] = Date.now()
        return isFirst
    }

    remove(uuid: string) {
        delete this.records[uuid]
    }

    getKeys() {
        return Object.keys(this.records)
    }

    removeOldOnes() {
        const now = Date.now()
        this.records = Object.fromEntries(Object.entries(this.records).filter(([_, d]) => now - d > this.keepAliveMs))
    }
}



export class FileRcvT {
    parts = new Array<Buffer>()
    expectedMsg = -1;

    isValidState() {
        if (this.expectedMsg != this.parts.length) {
            console.error("expect mismatches", this.expectedMsg, this.parts.length)
            return false;
        }
        if (this.expectedMsg == 0) {
            console.error("nothing expected")
            return false;
        }

        return true;
    }
    start(numMsg: number) {
        this.parts = new Array<Buffer>()
        this.parts.length = numMsg
        this.expectedMsg = numMsg
    }
    ignore() {
        this.expectedMsg = 0;
    }
    isIgnoring() {
        return this.expectedMsg == 0;
    }

    hasAll() {
        if (!this.isValidState())
            return false;
        for (const o of this.parts)
            if (!o || o.length == 0)
                return false;
        return true;
    }
    collect() {
        if (!this.isValidState())
            return false;
        let resStr = "";
        for (const o of this.parts) {
            if (!o || o.length == 0) {
                console.error("invalid when collecting");
                return;
            }
            resStr += o.toString('utf-8');
        }
        resStr.trim()
        return resStr;
    }

    addPart(n: number, buf: Buffer, offset: number) {
        if (!this.isValidState())
            return;
        this.parts[n] = buf.slice(offset);
        if (this.hasAll())
            return this.collect()
    }

    getMissingIds() {
        const res = []
        if (!this.isValidState())
            return res;
        let i = 0;
        for (const o of this.parts) {
            if (!o || o.length == 0) {
                res.push(i)
            }
            i++
        }
        return res;
    }

    cleanUp() {
        this.expectedMsg = 0
    }



}
