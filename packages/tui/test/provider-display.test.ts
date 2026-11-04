import { describe, expect, test } from "bun:test"
import { providerDisplayName } from "../src/util/provider-display"

describe("providerDisplayName", () => {
  test("drops the default workspace prefix", () => {
    expect(providerDisplayName("Default / OpenCode")).toBe("OpenCode")
    expect(providerDisplayName("Default / DeepSeek")).toBe("DeepSeek")
  })

  test("keeps other workspaces and plain names", () => {
    expect(providerDisplayName("Work / OpenCode")).toBe("Work / OpenCode")
    expect(providerDisplayName("OpenRouter")).toBe("OpenRouter")
  })
})
