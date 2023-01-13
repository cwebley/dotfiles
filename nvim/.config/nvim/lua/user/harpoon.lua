local status_ok, harpoon = pcall(require, "harpoon")
if not status_ok then
  return
end
local wk_status_ok, whichKey = pcall(require, "which-key")
if not wk_status_ok then
  return
end

harpoon.setup({
  global_settings = {
    -- sets the marks upon calling `toggle` on the ui, instead of require `:w`.
    save_on_toggle = false,

    -- saves the harpoon file upon every change. disabling is unrecommended.
    save_on_change = true,

    -- sets harpoon to run the command immediately as it's passed to the terminal when calling `sendCommand`.
    enter_on_sendcmd = false,

    -- closes any tmux windows harpoon that harpoon creates when you close Neovim.
    tmux_autoclose_windows = false,

    -- filetypes that you want to prevent from adding to the harpoon list menu.
    excluded_filetypes = { "harpoon" },

    -- set marks specific to each git branch inside git repository
    mark_branch = false,
  }
})

local nOpts = {
  mode = "n",
  prefix = "<leader>",
}
local nMappings = {
  ["s"] = { "<cmd> lua require('harpoon.mark').add_file()<cr>", "Harpoon Add"},
  ["d"] = { "<cmd> lua require('harpoon.ui').toggle_quick_menu()<cr>", "Harpoon Menu"},
  ["D"] = { "<cmd> lua require('harpoon.cmd-ui').toggle_quick_menu()<cr>", "Harpoon Cmd Menu"},
  ["j"] = { "<cmd> lua require('harpoon.ui').nav_file(1)<cr>", "Harpoon File 1" },
  ["k"] = { "<cmd> lua require('harpoon.ui').nav_file(2)<cr>", "Harpoon File 2" },
  ["l"] = { "<cmd> lua require('harpoon.ui').nav_file(3)<cr>", "Harpoon File 3" },
  [";"] = { "<cmd> lua require('harpoon.ui').nav_file(4)<cr>", "Harpoon File 4" },

  -- l = {
  --   name = "LSP",
  --   a = { "<cmd>lua vim.lsp.buf.code_action()<cr>", "Code Action" },
  --   d = {
  --     "<cmd>Telescope lsp_document_diagnostics<cr>",
  --     "Document Diagnostics",
  --   },
  --   i = { "<cmd>LspInfo<cr>", "Info" },
  --   I = { "<cmd>LspInstallInfo<cr>", "Installer Info" },
  --   l = { "<cmd>lua vim.lsp.codelens.run()<cr>", "CodeLens Action" },
  --   r = { "<cmd>lua vim.lsp.buf.rename()<cr>", "Rename" },
  --   s = { "<cmd>Telescope lsp_document_symbols<cr>", "Document Symbols" },
  --   S = {
  --     "<cmd>Telescope lsp_dynamic_workspace_symbols<cr>",
  --     "Workspace Symbols",
  --   },
  --   w = {
  --     "<cmd>Telescope lsp_workspace_diagnostics<cr>",
  --     "Workspace Diagnostics",
  --   },
  --   q = { "<cmd>lua vim.diagnostic.setloclist()<cr>", "Quickfix" },
  -- }
}
whichKey.register(nMappings, nOpts)
