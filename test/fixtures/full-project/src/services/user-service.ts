import { logger } from "../utils/logger";
import type { User } from "../types";

export class UserService {
  getUser(id: string): User {
    logger.info(`Getting user ${id}`);
    return { id, name: "Test" };
  }
}
