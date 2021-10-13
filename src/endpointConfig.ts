import * as uconf from './userConf'

export function setEndpointName(n:string){
    uconf.setVariable("endpointName",n);
}

export function getEndpointName(n:string){
    return uconf.getVariable("endpointName") || "no endpoint name"
}


export const conf = {
    agendaFile : 'public/data/endpoint/agenda.json',
}
