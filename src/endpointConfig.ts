
// export function setEndpointName(n:string){
//     uconf.setVariable("endpointName",n);
// }

// export function getEndpointName(n:string){
//     return uconf.getVariable("endpointName") || "no endpoint name"
// }

export const epBasePath = 'public/endpoint/'

export const conf = {
    agendaFile : epBasePath  + 'agenda.json',
    infoFile : epBasePath+'info.json',
}
