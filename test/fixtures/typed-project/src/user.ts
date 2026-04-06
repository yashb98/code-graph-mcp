import { BaseModel, createId } from "./base";

export class User extends BaseModel {
  constructor(public name: string, public email: string) {
    super(createId());
  }

  greet(): string {
    return `Hello, ${this.name}!`;
  }
}

export function findUser(users: User[], name: string): User | undefined {
  return users.find(u => u.name === name);
}
