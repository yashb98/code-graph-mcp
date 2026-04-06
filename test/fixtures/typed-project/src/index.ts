import { User, findUser } from "./user";

const users = [
  new User("Alice", "alice@example.com"),
  new User("Bob", "bob@example.com"),
];

export function main(): void {
  const found = findUser(users, "Alice");
  if (found) {
    console.log(found.greet());
    console.log(found.serialize());
  }
}

main();
