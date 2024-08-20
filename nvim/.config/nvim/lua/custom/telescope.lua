local data = assert(vim.fn.stdpath "data") --[[@as string]]

require("telescope").setup {
  extensions = {
    wrap_results = true,
    pickers = {
      find_files = {
        -- hidden = true,
        -- apparently this makes it slow...
        -- file_ignore_patterns = { "node_modules", ".git", ".venv" },
      }
    },

    fzf = {},
    -- history = {
    --   path = vim.fs.joinpath(data, "telescope_history.sqlite3"),
    --   limit = 100,
    -- },
    ["ui-select"] = {
      require("telescope.themes").get_dropdown {},
    },
  },
}

pcall(require("telescope").load_extension, "fzf")
-- pcall(require("telescope").load_extension, "smart_history")
pcall(require("telescope").load_extension, "ui-select")

local builtin = require "telescope.builtin"

vim.keymap.set("n", "<leader>fd", builtin.find_files)
-- vim.keymap.set("n", "<leader>ft", builtin.git_files)
vim.keymap.set("n", "<leader>fh", builtin.help_tags)
vim.keymap.set("n", "<leader>fg", builtin.live_grep)
vim.keymap.set("n", "<leader>/", builtin.current_buffer_fuzzy_find)
vim.keymap.set("n", "<leader>gw", builtin.grep_string)
vim.keymap.set("n", "<leader>ft", "<cmd>TodoTelescope<cr>", {desc = "Find todos" })

-- vim.keymap.set("n", "<space>fa", function()
--   ---@diagnostic disable-next-line: param-type-mismatch
--   builtin.find_files { cwd = vim.fs.joinpath(vim.fn.stdpath "data", "lazy") }
-- end)
--
-- vim.keymap.set("n", "<leader>en", function()
--   builtin.find_files { cwd = vim.fn.stdpath "config" }
-- end)
--
-- vim.keymap.set("n", "<leader>eo", function()
--   builtin.find_files { cwd = "~/.config/nvim-backup/" }
-- end)

-- does this work? is it useful?
vim.keymap.set("n", "<leader>fp", function()
  builtin.find_files { cwd = "~/plugins/" }
end)
