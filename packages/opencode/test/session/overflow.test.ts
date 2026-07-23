import { describe, expect, test } from "bun:test"
import type { Provider } from "@/provider/provider"
import { usable, isOverflow } from "@/session/overflow"
import type { ConfigV1 } from "@opencode-ai/core/v1/config/config"

const cfg = {} as ConfigV1.Info

function model(opts: {
  context: number
  output: number
  input?: number
  recommendedOutput?: number
}): Provider.Model {
  return {
    id: "test-model",
    providerID: "test",
    name: "Test",
    limit: {
      context: opts.context,
      input: opts.input,
      output: opts.output,
      recommendedOutput: opts.recommendedOutput,
    },
    cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
    capabilities: {
      toolcall: true,
      attachment: false,
      reasoning: false,
      temperature: true,
      input: { text: true, image: false, audio: false, video: false },
      output: { text: true, image: false, audio: false, video: false },
    },
    api: { npm: "@ai-sdk/anthropic" },
    options: {},
  } as Provider.Model
}

const tokens = (input: number, output = 0) => ({
  input,
  output,
  reasoning: 0,
  cache: { read: 0, write: 0 },
})

describe("overflow.usable", () => {
  test("subtracts default OUTPUT_TOKEN_MAX when no recommendedOutput set", () => {
    expect(
      usable({ cfg, model: model({ context: 100_000, output: 32_000 }) }),
    ).toBe(68_000)
  })

  test("subtracts recommendedOutput when set", () => {
    expect(
      usable({
        cfg,
        model: model({
          context: 262_144,
          output: 262_144,
          recommendedOutput: 32_768,
        }),
      }),
    ).toBe(229_376)
  })

  test("subtracts variantRecommendedOutput over model recommendedOutput", () => {
    expect(
      usable({
        cfg,
        model: model({
          context: 262_144,
          output: 262_144,
          recommendedOutput: 32_768,
        }),
        variantRecommendedOutput: 100_000,
      }),
    ).toBe(162_144)
  })

  test("subtracts variantRecommendedOutput when model recommendedOutput not set", () => {
    expect(
      usable({
        cfg,
        model: model({ context: 262_144, output: 262_144 }),
        variantRecommendedOutput: 50_000,
      }),
    ).toBe(212_144)
  })

  test("outputTokenMax overrides variantRecommendedOutput", () => {
    expect(
      usable({
        cfg,
        model: model({ context: 262_144, output: 262_144 }),
        outputTokenMax: 64_000,
        variantRecommendedOutput: 100_000,
      }),
    ).toBe(198_144)
  })
})

describe("overflow.isOverflow", () => {
  test("returns true when tokens exceed usable context", () => {
    expect(
      isOverflow({
        cfg,
        model: model({ context: 100_000, output: 32_000 }),
        tokens: tokens(80_000),
      }),
    ).toBe(true)
  })

  test("returns false when tokens within usable context", () => {
    expect(
      isOverflow({
        cfg,
        model: model({ context: 200_000, output: 32_000 }),
        tokens: tokens(100_000),
      }),
    ).toBe(false)
  })

  test("recommendedOutput reduces usable and triggers overflow", () => {
    expect(
      isOverflow({
        cfg,
        model: model({
          context: 262_144,
          output: 262_144,
          recommendedOutput: 32_768,
        }),
        tokens: tokens(230_000),
      }),
    ).toBe(true)
  })

  test("without recommendedOutput, same token count does not overflow", () => {
    expect(
      isOverflow({
        cfg,
        model: model({ context: 262_144, output: 262_144 }),
        tokens: tokens(230_000),
      }),
    ).toBe(false)
  })

  test("variantRecommendedOutput overrides model recommendedOutput in overflow", () => {
    expect(
      isOverflow({
        cfg,
        model: model({
          context: 262_144,
          output: 262_144,
          recommendedOutput: 32_768,
        }),
        tokens: tokens(170_000),
        variantRecommendedOutput: 100_000,
      }),
    ).toBe(true)
  })

  test("variantRecommendedOutput used when model recommendedOutput not set", () => {
    expect(
      isOverflow({
        cfg,
        model: model({ context: 262_144, output: 262_144 }),
        tokens: tokens(220_000),
        variantRecommendedOutput: 50_000,
      }),
    ).toBe(true)
  })

  test("model-switch: 100K fits Kimi with recommendedOutput 32K", () => {
    expect(
      isOverflow({
        cfg,
        model: model({
          context: 262_144,
          output: 262_144,
          recommendedOutput: 32_768,
        }),
        tokens: tokens(100_000),
      }),
    ).toBe(false)
  })

  test("model-switch: 200K with variant recommendedOutput 100K triggers overflow", () => {
    expect(
      isOverflow({
        cfg,
        model: model({ context: 262_144, output: 262_144 }),
        tokens: tokens(200_000),
        variantRecommendedOutput: 100_000,
      }),
    ).toBe(true)
  })
})
