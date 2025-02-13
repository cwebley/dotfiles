-- custom config for treesitter because of a work network install issue.
-- the jsonc parser is hosted on gitlab and is blocked resulting in error messages on startup.
-- hopefully this isn't hard to maintain...
return {
  "nvim-treesitter/nvim-treesitter",
  opts = function(_, opts)
    opts.ensure_installed = {
      "bash",
      "c",
      "diff",
      "html",
      "javascript",
      "jsdoc",
      "json",
      -- removed jsonc here
      "lua",
      "luadoc",
      "luap",
      "markdown",
      "markdown_inline",
      "printf",
      "python",
      "query",
      "regex",
      "toml",
      "tsx",
      "typescript",
      "vim",
      "vimdoc",
      "xml",
      "yaml",
    }
  end,
}
