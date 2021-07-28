/////////////////////:
/// config
import {readFileSync} from 'fs'

const usehttps = false;
const conf =   {
    usehttps,
    credentials : {key:usehttps?readFileSync('../cert/key.pem'):{},cert:usehttps?readFileSync('../cert/cert.pem'):{}},
    groupFile : 'public/data/groups.json',
    knownDevicesFile : 'public/data/knownDevices.json',
    agendasFolder : 'public/data/agendas/',
    agendaFile : 'public/data/endpoint/agenda.json',
    serverPort:3003,
    endpointPort:3004
}
// console.log("cer",conf.credentials)
export default conf
