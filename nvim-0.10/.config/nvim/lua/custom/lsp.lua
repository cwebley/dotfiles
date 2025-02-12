local lspconfig = require("lspconfig")
local mason_lspconfig = require("mason-lspconfig")
local cmp_nvim_lsp = require("cmp_nvim_lsp")
local keymap = vim.keymap

vim.api.nvim_create_autocmd("LspAttach", {
  group = vim.api.nvim_create_augroup("UsrLspConfig", {}),
  callback = function(ev)
    local opts = { buffer = ev.buf, silent = true }

    opts.desc = "Show LSP references"
    keymap.set("n", "gR", "<cmd>Telescope lsp_references<CR>", opts)

    opts.desc = "Go to declaration"
    keymap.set("n", "gD", "<cmd>Telescope lsp_definitions<CR>", opts)

   opts.desc = "Show LSP implementations"
    keymap.set("n", "gi", "<cmd>Telescope lsp_implementations<CR>", opts)

    opts.desc = "Show LSP type definitions"
    keymap.set("n", "gt", "<cmd>Telescope lsp_type_definitions<CR>", opts)

    opts.desc = "See available code actions"
    keymap.set({ "n", "v" }, "<leader>ca", vim.lsp.buf.code_action, opts)

    opts.desc = "Smart rename"
    keymap.set("n", "<leader>rn", vim.lsp.buf.rename, opts)

    opts.desc = "Show buffer diagnostics"
    keymap.set("n", "<leader>D", "<cmd>Telescope diagnostics bufnr=0<CR>", opts)

    opts.desc = "Show line diagnostics"
    keymap.set("n", "<leader>d", vim.diagnostic.open_float, opts)

    -- defaults as of neovim 0.10
    -- opts.desc = "Go to previous diagnostic"
    -- keymap.set("n", "[d", vim.diagnostic.goto_prev, opts)
    -- opts.desc = "Go to next diagnostic"
    -- keymap.set("n", "]d", vim.diagnostic.goto_prev, opts)
    -- opts.desc = "Show documentation for thing under cursor"
    -- keymap.set("n", "K", vim.lsp.buf.hover, opts)
  end,
})

-- TODO: is this something I actually need bound? Prob not
-- opts.desc = "Restart LSP"
-- keymap.set("n", "<leader>rs", ":LspRestart<CR>", opts)

local capabilities = cmp_nvim_lsp.default_capabilities()

-- TODO: diagnostic symbols for the sign column?

mason_lspconfig.setup_handlers({
  function(server_name)
    lspconfig[server_name].setup({
      capabilities = capabilities
    })
  end,
  -- any custom configurations here for servers. multiple filetypes? etc
})
