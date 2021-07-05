/////////////////////:
/// config
import {readFileSync} from 'fs'

const usehttps = false;
const conf =   {
    usehttps,
    credentials : {key:usehttps?readFileSync('../cert/key.pem'):{},cert:usehttps?readFileSync('../cert/cert.pem'):{}},
    zonesFile : 'public/time.json',
    groupFolder : 'public/group/',
    serverPort:3003
}
// console.log("cer",conf.credentials)
export default conf
