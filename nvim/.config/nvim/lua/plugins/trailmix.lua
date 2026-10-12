return {
  {
    dir = vim.fn.expand("~/src/trailmix"),
    name = "trailmix",
    lazy = false,
    opts = {
      cli = vim.fn.expand("~/.local/bin/trailmix"),
      mapping = "<leader>mt",
    },
  },
}
