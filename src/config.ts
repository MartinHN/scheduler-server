/////////////////////:
/// config
import {readFileSync} from 'fs'

const usehttps = false;
 const conf=  {
    usehttps,
    credentials : {key:usehttps?readFileSync('../cert/key.pem'):{},cert:usehttps?readFileSync('../cert/cert.pem'):{}},
    serverPort:3003,
    endpointPort:3004
}

export default conf
