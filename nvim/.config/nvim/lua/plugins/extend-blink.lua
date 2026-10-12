return {
  "saghen/blink.cmp",
  opts = {
    keymap = {
      -- lazyvim sets this to "Enter"
      -- and the CR accept funcationlity is frustrating
      preset = "default",
    },
    -- compact signature help: one line, no doc body.
    -- blink defaults to show_documentation = false / max_height = 10,
    -- so this stays the same size regardless of how long the doc comment is.
    -- lazyvim leaves this commented out in extras/coding/blink.lua.
    signature = { enabled = true },
  },
}
