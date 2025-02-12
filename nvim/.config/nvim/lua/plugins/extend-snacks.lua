return {
  "snacks.nvim",
  keys = {
    { "<leader>e", false },
    { "<leader>E", false },
  },
  opts = function(_, opts)
    opts.explorer.enabled = false
    opts.picker = { explorer = { enabled = false } }
  end,
}
