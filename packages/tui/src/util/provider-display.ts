// Console names providers after the workspace, for example "Default / OpenCode".
// The default workspace carries no information, so provider labels drop it.
const DEFAULT_WORKSPACE = "Default / "

export function providerDisplayName(name: string) {
  return name.startsWith(DEFAULT_WORKSPACE) ? name.slice(DEFAULT_WORKSPACE.length) : name
}
