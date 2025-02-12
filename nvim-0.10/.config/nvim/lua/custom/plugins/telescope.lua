return {
  "nvim-telescope/telescope.nvim",
   dependencies = {
    'nvim-lua/plenary.nvim',
    {'nvim-telescope/telescope-fzf-native.nvim', build ="make"},
    "folke/todo-comments.nvim",
  },
  config = function()
    require "custom.telescope"
  end,
}
