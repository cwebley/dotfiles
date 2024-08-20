local lint = require("lint")

local lint_augroup = vim.api.nvim_create_augroup("lint", { clear = true })
local eslint = lint.linters.eslint_d

lint.linters_by_ft = {
  javascript = { "eslint" },
  typescript = { "eslint" },
  javascriptreact = { "eslint" },
  typescriptreact = { "eslint" },
  svelte = { "eslint" },
}

eslint.args = {
  "--no-warn-ignored",
  "--format",
  "json",
  "--stdin",
  "--stdin-filename",
  function()
    return vim.api.nvim_buf_get_name(0)
  end,
}

vim.api.nvim_create_autocmd({ "BufEnter", "BufWritePost", "InsertLeave" }, {
  group = lint_augroup,
  callback = function()
    lint.try_lint()
  end,
})

vim.keymap.set("n", "<leader>L", function()
  lint.try_lint()
end, { desc = "Trigger linting for current file" })
