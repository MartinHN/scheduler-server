/////////////////////:
/// config
import {readFileSync} from 'fs'

const usehttps = false;
const conf =   {
    usehttps,
    credentials : {key:usehttps?readFileSync('../cert/key.pem'):{},cert:usehttps?readFileSync('../cert/cert.pem'):{}},
    groupFile : 'public/data/groups.json',
    zoneFile : 'public/data/zone.json',
    zonesFolder : 'public/data/zones/',
    serverPort:3003
}
// console.log("cer",conf.credentials)
export default conf
