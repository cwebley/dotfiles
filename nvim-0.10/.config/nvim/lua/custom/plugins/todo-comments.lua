return {
  "folke/todo-comments.nvim",
  event = { "BufReadPre ", "BufNewFile" },
  dependencies = { "nvim-lua/plenary.nvim" },
  config = function()
    require "custom.todo-comments"
  end,
}
