import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { logger, setLogLevel } from "../../src/logger.js";

describe("Logger", () => {
  let spy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    spy = spyOn(console, "error").mockImplementation(() => {});
    setLogLevel("debug");
  });

  afterEach(() => {
    spy.mockRestore();
    setLogLevel("info");
  });

  test("logs at debug level when set to debug", () => {
    logger.debug("test message");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain("[DEBUG] test message");
  });

  test("includes data in log output", () => {
    logger.info("test", { key: "value" });
    expect(spy.mock.calls[0][0]).toContain('"key":"value"');
  });

  test("respects log level filtering", () => {
    setLogLevel("warn");
    logger.debug("hidden");
    logger.info("hidden");
    logger.warn("visible");
    logger.error("visible");
    expect(spy).toHaveBeenCalledTimes(2);
  });

  test("error level always logs", () => {
    setLogLevel("error");
    logger.error("critical");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain("[ERROR]");
  });

  test("includes ISO timestamp", () => {
    logger.info("timestamped");
    const output = spy.mock.calls[0][0] as string;
    expect(output).toMatch(/\[\d{4}-\d{2}-\d{2}T/);
  });
});
