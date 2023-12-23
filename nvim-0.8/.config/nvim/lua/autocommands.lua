---- highlight yanked region. maybe this belongs in an autocmd file as more get added
--vim.api.nvim_create_autocmd("TextYankPost", {
--  callback = function()
--    vim.highlight.on_yank { higroup = (
--        vim.fn['hlexists']('HighlightedyankRegion') > 0 and 'HighlightedyankRegion' or 'IncSearch'), timeout = 200 }
--  end
--})
--


-- These are non-language specific autocommands
vim.api.nvim_create_autocmd("TextYankPost", {
  pattern = "*",
  callback = function()
    vim.highlight.on_yank({ higroup = "IncSearch", timeout = 300 })
  end,
  desc = "Highlights the yanked text",
})
