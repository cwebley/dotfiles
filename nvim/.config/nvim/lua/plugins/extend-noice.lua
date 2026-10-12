-- noice ships with lazyvim by default and auto-opens signature help on LSP
-- trigger characters, rendering it through its `hover` view (max_height = 20).
-- for verbose stdlib docs (json.Unmarshal is 89 lines) that fills the screen.
-- blink handles the always-on signature line instead; noice still serves the
-- full docs on demand via <C-k> (insert) and gK (normal).
return {
  "folke/noice.nvim",
  opts = {
    lsp = {
      signature = {
        auto_open = { enabled = false },
      },
    },
  },
}
