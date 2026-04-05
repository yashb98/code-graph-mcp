import { helper } from "./utils";
import type { Config } from "./types";
import "./styles.css";

export async function main(config: Config): Promise<void> {
  const result = helper(config.value);
  const mod = await import("./lazy-module");
  console.log(result, mod);
}

/** @deprecated Use AppServiceV2 instead */
export class AppService {
  run(): void {}
}

export default main;
