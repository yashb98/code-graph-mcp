export interface Serializable {
  serialize(): string;
}

export class BaseModel implements Serializable {
  constructor(public id: string) {}

  serialize(): string {
    return JSON.stringify({ id: this.id });
  }
}

export function createId(): string {
  return Math.random().toString(36).slice(2);
}
