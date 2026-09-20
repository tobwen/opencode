import { describe, expect, test } from "bun:test"
import { displayCharAt, displaySlice, mentionTriggerIndex, parseMentionQuery } from "../../src/prompt/display"

describe("prompt display", () => {
  test("uses display-width offsets for mentions", () => {
    expect(mentionTriggerIndex("@")).toBe(0)
    expect(mentionTriggerIndex("test @")).toBe(5)
    expect(mentionTriggerIndex("中文 @")).toBe(5)
    expect(mentionTriggerIndex("こんにちは @")).toBe(11)
    expect(mentionTriggerIndex("한국어 @")).toBe(7)
    expect(mentionTriggerIndex("🙂 @")).toBe(3)
    expect(mentionTriggerIndex("中文 @src file", Bun.stringWidth("中文 @src"))).toBe(5)
    expect(displayCharAt("中文 @src", Bun.stringWidth("中文 @"))).toBe("s")
    expect(displaySlice("中文 @src", 5, Bun.stringWidth("中文 @src"))).toBe("@src")
    expect(displaySlice("中文 @src", 6, Bun.stringWidth("中文 @src"))).toBe("src")
    expect(mentionTriggerIndex("👨‍👩‍👧‍👦 @src", Bun.stringWidth("👨‍👩‍👧‍👦 @src"))).toBe(3)
    expect(displayCharAt("👨‍👩‍👧‍👦 @src", Bun.stringWidth("👨‍👩‍👧‍👦 @"))).toBe("s")
    expect(displaySlice("👨‍👩‍👧‍👦 @src", 3, Bun.stringWidth("👨‍👩‍👧‍👦 @src"))).toBe("@src")
    expect(mentionTriggerIndex("@file1\n@file2", 13)).toBe(7)
    expect(displayCharAt("@file1\n@file2", 6)).toBe("\n")
    expect(displaySlice("@file1\n@file2", 8, 13)).toBe("file2")
    expect(mentionTriggerIndex("@file1\nfoo @file2", 17)).toBe(11)
    expect(mentionTriggerIndex("中文 @one\n@two", 14)).toBe(10)
    expect(displaySlice("中文 @one\n@two", 11, 14)).toBe("two")
    expect(mentionTriggerIndex("中文@")).toBeUndefined()
    expect(mentionTriggerIndex("こんにちは@")).toBeUndefined()
    expect(mentionTriggerIndex("한국어@")).toBeUndefined()
    expect(mentionTriggerIndex("🙂@")).toBeUndefined()
    expect(mentionTriggerIndex("hello@")).toBeUndefined()
    expect(mentionTriggerIndex("foo@bar.com")).toBeUndefined()
    expect(mentionTriggerIndex("中文 @src file")).toBeUndefined()
  })
})

describe("parseMentionQuery", () => {
  test("splits the mention trigger tiers", () => {
    const cases = [
      ["", { extraAts: 0, afterAts: "", literal: false, text: "" }],
      ["src", { extraAts: 0, afterAts: "src", literal: false, text: "src" }],
      ["@", { extraAts: 1, afterAts: "", literal: false, text: "" }],
      ["@@", { extraAts: 2, afterAts: "", literal: false, text: "" }],
      ["@src", { extraAts: 1, afterAts: "src", literal: false, text: "src" }],
      ["@@src", { extraAts: 2, afterAts: "src", literal: false, text: "src" }],
      ["!src", { extraAts: 0, afterAts: "!src", literal: true, text: "src" }],
      ["@!src", { extraAts: 1, afterAts: "!src", literal: true, text: "src" }],
      ["@@!src", { extraAts: 2, afterAts: "!src", literal: true, text: "src" }],
      ["!!src", { extraAts: 0, afterAts: "!!src", literal: true, text: "!src" }],
      ["@@src#12-20", { extraAts: 2, afterAts: "src#12-20", literal: false, text: "src#12-20" }],
      ["@@!src#12", { extraAts: 2, afterAts: "!src#12", literal: true, text: "src#12" }],
      ["@@日本語", { extraAts: 2, afterAts: "日本語", literal: false, text: "日本語" }],
    ] as const
    for (const [input, expected] of cases) {
      expect(parseMentionQuery(input)).toEqual(expected)
    }
  })
})
