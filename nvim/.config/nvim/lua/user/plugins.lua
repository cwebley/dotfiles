local fn = vim.fn

-- Automatically install packer
local install_path = fn.stdpath "data" .. "/site/pack/packer/start/packer.nvim"
if fn.empty(fn.glob(install_path)) > 0 then
  PACKER_BOOTSTRAP = fn.system {
    "git",
    "clone",
    "--depth",
    "1",
    "https://github.com/wbthomason/packer.nvim",
    install_path,
  }
  print "Installing packer close and reopen Neovim..."
  vim.cmd [[packadd packer.nvim]]
end

-- Autocommand that reloads neovim whenever you save the plugins.lua file
vim.cmd [[
  augroup packer_user_config
    autocmd!
    autocmd BufWritePost plugins.lua source <afile> | PackerSync
  augroup end
]]

-- Use a protected call so we don't error out on first use
local status_ok, packer = pcall(require, "packer")
if not status_ok then
  return
end

-- Have packer use a popup window
-- packer.init {
--   display = {
--     open_fn = function()
--       return require("packer.util").float { border = "rounded" }
--     end,
--   },
-- }

-- Install your plugins here
return packer.startup(function(use)
  use "wbthomason/packer.nvim" -- Have packer manage itself
  use "nvim-lua/popup.nvim" -- An implementation of the Popup API from vim in Neovim
  use "nvim-lua/plenary.nvim" -- Useful lua functions used ny lots of plugins
  use "windwp/nvim-autopairs" -- Autopairs, integrates with both cmp and treesitter
  use "numToStr/Comment.nvim" -- Easily comment stuff
  use "kyazdani42/nvim-web-devicons"
  use "kyazdani42/nvim-tree.lua" -- TODO update when this PR merges https://github.com/kyazdani42/nvim-tree.lua/pull/1365
  use "ThePrimeagen/harpoon"
  use "tpope/vim-fugitive"
  use "tpope/vim-unimpaired"
  -- use "akinsho/bufferline.nvim"
  -- use "moll/vim-bbye"
  use "nvim-lualine/lualine.nvim"
  use "akinsho/toggleterm.nvim"
  -- use "ahmedkhalf/project.nvim"
  -- use "lewis6991/impatient.nvim"
  -- use "lukas-reineke/indent-blankline.nvim"
  -- use "goolord/alpha-nvim"
  use "antoinemadec/FixCursorHold.nvim" -- This is needed to fix lsp doc highlight
  use "folke/which-key.nvim"
  use "andymass/vim-matchup"
  use "RRethy/vim-illuminate"
  -- TODO rework this into a vimwiki config file at some point
  -- also try out taskwiki to see if it integrates with macOS in future release
  use {
    'vimwiki/vimwiki',
    config = function()
      vim.g.vimwiki_list = {
        {
          path = '~/src/vimwiki',
          syntax = 'markdown',
          ext = '.md',
        }
      }
      -- TODO not sure if this is needed anymore--from my old config and not working in lua
      -- vim.g.vimwiki_markdown_ext2syntax = {
      --   {
      --     md = 'markdown',
      --     markdown = 'markdown',
      --     mdown = 'markdown',
      --   }
      -- }
    end
  }
  -- TODO rework this into a sandwich config file at some point
  use {
    'machakann/vim-sandwich',
    config = function()

      -- remove default key binding of `s`
      vim.g.sandwich_no_default_key_mappings = 1

      -- Use m instead of s
      vim.cmd([[
       silent! nmap <unique><silent> md <Plug>(operator-sandwich-delete)<Plug>(operator-sandwich-release-count)<Plug>(textobj-sandwich-query-a)
       silent! nmap <unique><silent> md <Plug>(operator-sandwich-delete)<Plug>(operator-sandwich-release-count)<Plug>(textobj-sandwich-query-a)
       silent! nmap <unique><silent> mr <Plug>(operator-sandwich-replace)<Plug>(operator-sandwich-release-count)<Plug>(textobj-sandwich-query-a)
       silent! nmap <unique><silent> mdb <Plug>(operator-sandwich-delete)<Plug>(operator-sandwich-release-count)<Plug>(textobj-sandwich-auto-a)
       silent! nmap <unique><silent> mrb <Plug>(operator-sandwich-replace)<Plug>(operator-sandwich-release-count)<Plug>(textobj-sandwich-auto-a)
       let g:operator_sandwich_no_default_key_mappings = 1
       " add
       silent! map <unique> ma <Plug>(operator-sandwich-add)
       " delete
       silent! xmap <unique> md <Plug>(operator-sandwich-delete)
       " replace
       silent! xmap <unique> mr <Plug>(operator-sandwich-replace)
      ]])
    end
  }
  -- TODO move this to its own file and implement a table mode contextual override
  -- as suggested in the vim-table-mode readmode
  -- also need to integrate these key presses into whichkey
  -- mappings can be remapped :h table-mode :h table-mode-disable-mappings (set equal to 1)
  -- then easy to wrap things like <cmd>TableModeEnable<cr> to binds within whichkey
  use "dhruvasagar/vim-table-mode"

  -- Colorschemes
  -- use "lunarvim/colorschemes" -- A bunch of colorschemes you can try out
  use "lunarvim/darkplus.nvim"

  -- cmp plugins
  use "hrsh7th/nvim-cmp" -- The completion plugin
  use "hrsh7th/cmp-buffer" -- buffer completions
  use "hrsh7th/cmp-path" -- path completions
  use "hrsh7th/cmp-cmdline" -- cmdline completions
  use "saadparwaiz1/cmp_luasnip" -- snippet completions
  use "hrsh7th/cmp-nvim-lsp"
  use "hrsh7th/cmp-nvim-lua"

  -- snippets
  use "L3MON4D3/LuaSnip" --snippet engine
  use "rafamadriz/friendly-snippets" -- a bunch of snippets to use

  -- LSP
  use "neovim/nvim-lspconfig" -- enable LSP
  use "williamboman/nvim-lsp-installer" -- simple to use language server installer
  use "tamago324/nlsp-settings.nvim" -- language server settings defined in json for
  use "jose-elias-alvarez/null-ls.nvim" -- for formatters and linters

  -- Telescope
  use "nvim-telescope/telescope.nvim"

  -- Treesitter
  use {
    "nvim-treesitter/nvim-treesitter",
    run = ":TSUpdate",
  }
  use "JoosepAlviste/nvim-ts-context-commentstring"

  -- Git
  use "lewis6991/gitsigns.nvim"

  -- automatically set up your configuration after cloning packer.nvim
  -- Put this at the end after all plugins
  if PACKER_BOOTSTRAP then
    require("packer").sync()
  end
end)
