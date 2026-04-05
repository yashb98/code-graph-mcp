import { UserService } from "./services/user-service";
import { logger } from "./utils/logger";

export async function main(): Promise<void> {
  const service = new UserService();
  logger.info("Starting app");
}
