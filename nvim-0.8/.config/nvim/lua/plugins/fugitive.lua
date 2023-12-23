-- local git_push = function()
--
--   local async_job, job = pcall(require, 'plenary.job')
--   if not async_job then
--     require("notify")("Plenary is not installed!", "error")
--   end
--
--   local push_job = job:new({
--     command = 'git',
--     args = { 'push' },
--     on_exit = function(_, exit_code)
--       if exit_code ~= 0 then
--         require("notify")("Could not push!", "error")
--         return
--       end
--       require("notify")("Pushed.", vim.log.levels.INFO)
--     end,
--   })
--
--   local isSubmodule = vim.fn.trim(vim.fn.system("git rev-parse --show-superproject-working-tree"))
--   if isSubmodule == "" then
--     push_job:start()
--   else
--     vim.fn.confirm("Push to origin/main branch for submodule?")
--     push_job:start()
--   end
-- end

return { "tpope/vim-fugitive",
  config = function()
    local map_opts = { noremap = true, silent = true, nowait = true, buffer = false }
    -- vim.keymap.set("n", "<leader>gs", toggle_status, map_opts)
    -- vim.keymap.set("n", "<leader>gP", git_push, map_opts)
  end,
  dependencies = { "nvim-lua/plenary.nvim" },
}
