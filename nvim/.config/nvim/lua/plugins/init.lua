-- Any files inside the lua/plugins directory will also
-- automatically be sourced. These plugins are those that
-- do not require any configuration.

return {
  { "folke/neodev.nvim" },
  { "nvim-lua/plenary.nvim" },
  { "rebelot/kanagawa.nvim" }, -- In colors.lua file
  { "junegunn/fzf", build = function() vim.fn["fzf#install"]() end },
  { "tpope/vim-repeat" },
  { "tpope/vim-rhubarb" },
  { "numToStr/Comment.nvim", config = function()
    require("Comment").setup({})
  end,
  },
  { "romainl/vim-cool" },
  { "kyazdani42/nvim-web-devicons", config = function()
    require("nvim-web-devicons").setup()
  end
  },
  { "AndrewRadev/tagalong.vim" },
  { 'djoshea/vim-autoread' },
  { "nvim-telescope/telescope-fzf-native.nvim", build = "make", cond = vim.fn.executable 'make' == 1},
  { "mbbill/undotree" },
  { "kylechui/nvim-surround", tag = "*",     config = function()
    require("nvim-surround").setup({
    })
  end },
}
