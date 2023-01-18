return {
  'VonHeikemen/lsp-zero.nvim',

  dependencies = {
    -- LSP Support
    { 'neovim/nvim-lspconfig' },
    { 'williamboman/mason.nvim' },
    { 'williamboman/mason-lspconfig.nvim' },

    -- Autocompletion
    { 'hrsh7th/nvim-cmp' },
    { 'hrsh7th/cmp-buffer' },
    { 'hrsh7th/cmp-path' },
    { 'saadparwaiz1/cmp_luasnip' },
    { 'hrsh7th/cmp-nvim-lsp' },
    { 'hrsh7th/cmp-nvim-lua' },

    -- null-ls for formatters like prettier
    { "jose-elias-alvarez/null-ls.nvim" },
    -- mason-null-ls for the convenience of the NullInstall command
    { "jay-babu/mason-null-ls.nvim" },

    -- Snippets
    { 'L3MON4D3/LuaSnip' },
    -- Snippet Collection (Optional)
    { 'rafamadriz/friendly-snippets' },
  },
  config = function()
    local lsp = require('lsp-zero')
    -- under the hood this is what this does: https://github.com/VonHeikemen/lsp-zero.nvim/wiki/Under-the-hood
    lsp.preset('recommended')

    lsp.ensure_installed {
      'tsserver',
      'eslint',
      'sumneko_lua',
      'emmet_ls',
    }

    -- Fix Undefined global 'vim'
    lsp.configure('sumneko_lua', {
      settings = {
        Lua = {
          diagnostics = {
            globals = { 'vim' }
          }
        }
      }
    })

    local cmp = require('cmp');
    local cmp_select = { behavior = cmp.SelectBehavior.Select }
    local cmp_mappings = lsp.defaults.cmp_mappings({
      ['<C-p>'] = cmp.mapping.select_prev_item(cmp_select),
      ['<C-n>'] = cmp.mapping.select_next_item(cmp_select),
      ['<C-y>'] = cmp.mapping.confirm({ select = true }),
      -- ['<C-Space>'] = cmp.mapping.complete(),
    })

    -- luasnips C-b and C-n to jump back and forward within snippet

    -- disable completion with tab
    -- this helps with copilot setup
    cmp_mappings['<Tab>'] = nil
    cmp_mappings['<S-Tab>'] = nil

    lsp.setup_nvim_cmp({
      mapping = cmp_mappings
    })

    -- lsp.on_attach(function(client, bufnr))
    --   print('on_attach')
    --
    -- end

    ---@diagnostic disable-next-line: unused-local
    lsp.on_attach(function(client, bufnr)

      -- Disable LSP server formatting in cases were null-ls should take over, to prevent formatting twice.
      if client.name == "tsserver" then
        client.server_capabilities.documentFormattingProvider = false

        -- although prettierd doesn't do range formatting anyway... but maybe eslintd does
        -- https://github.com/jose-elias-alvarez/null-ls.nvim/issues/1321
        client.server_capabilities.documentFormattingRangeProvider = false
      end

      local opts = { buffer = bufnr, remap = false }

      vim.keymap.set("n", "gd", function() vim.lsp.buf.definition() end, opts)
      vim.keymap.set("n", "K", function() vim.lsp.buf.hover() end, opts)
      vim.keymap.set("n", "<leader>vws", function() vim.lsp.buf.workspace_symbol() end, opts)
      vim.keymap.set("n", "<leader>vd", function() vim.diagnostic.open_float() end, opts)
      vim.keymap.set("n", "[d", function() vim.diagnostic.goto_next() end, opts)
      vim.keymap.set("n", "]d", function() vim.diagnostic.goto_prev() end, opts)
      vim.keymap.set("n", "<leader>vca", function() vim.lsp.buf.code_action() end, opts)
      vim.keymap.set("n", "<leader>vrr", function() vim.lsp.buf.references() end, opts)
      vim.keymap.set("n", "<leader>vrn", function() vim.lsp.buf.rename() end, opts)
      vim.keymap.set("n", "<leader>F", "<cmd>LspZeroFormat<cr>", opts)
      vim.keymap.set("i", "<C-h>", function() vim.lsp.buf.signature_help() end, opts)
    end)
    lsp.setup()

    local null_ls = require('null-ls')
    local null_opts = lsp.build_options('null-ls', {})

    null_ls.setup({
      on_attach = function(client, bufnr)
        null_opts.on_attach(client, bufnr)
        ---
        -- you can add other stuff here....
        ---
      end,
      sources = {
        -- Replace these with the tools you want to install
        null_ls.builtins.formatting.prettierd,
        -- null_ls.builtins.formatting.eslint_d,
        -- null_ls.builtins.diagnostics.eslint,
        -- null_ls.builtins.formatting.stylua,
      }
    })

    -- See mason-null-ls.nvim's documentation for more details:
    -- https://github.com/jay-babu/mason-null-ls.nvim#setup
    require('mason-null-ls').setup({
      ensure_installed = {
        'prettierd'
      },
      automatic_installation = true,
      automatic_setup = true,
    })


    -- Required when `automatic_setup` is true
    require('mason-null-ls').setup_handlers()

  end
}
