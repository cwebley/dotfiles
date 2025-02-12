return {
  -- "ThePrimeagen/harpoon",
  -- branch = "harpoon2",
  -- dependencies = { "nvim-lua/plenary.nvim" },
  "nvim-treesitter/nvim-treesitter",
  -- event = { "BufReadPre", "BufNewFile" },
  build = ":TSUpdate",
  dependencies = {
    "windwp/nvim-ts-autotag",
    "nvim-treesitter/nvim-treesitter-context",
  },
  config = function()
    require "custom.treesitter"
  end,
}
