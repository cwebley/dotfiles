return {
  {
    "craftzdog/solarized-osaka.nvim",
    lazy = false,
    priority = 1000,
    opts = {},
    config = function()
      vim.cmd "colorscheme solarized-osaka"
    end
  },
  { 'echasnovski/mini.nvim', version = '*',
  keys = {
    { "<leader>e", "<cmd>lua MiniFiles.open(vim.api.nvim_buf_get_name(0))<cr>", desc = "Mini FileTree" },
  },
  config = function()
    require('mini.surround').setup()
    require('mini.move').setup()
    require('mini.pairs').setup()
    -- add mini.git and mini.diff to get more features out of this. or just use lualine
    require('mini.statusline').setup()
    require('mini.files').setup()
    -- mini.notify instead of noice. check this out when using lsp
    -- consider mini.cursorword to autohighlight word under cursor all over the page. seems nice.
    -- mini.hipatterns for highlighting TODO NOTE HACK and hex codes colored to hex color
  end,
  }
}
