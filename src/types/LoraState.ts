
export interface LoraState {
  isActive: boolean
  isMasterClock: boolean
  fec: boolean
}

export class DefaultLoraState implements LoraState {
  public isActive = false;
  public isMasterClock = false;
  public fec = true;
}

