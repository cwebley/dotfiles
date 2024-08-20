-- Case-insensitive searching UNLESS \C or capital in search
vim.opt.ignorecase = true
vim.opt.smartcase = true
vim.opt.number = true
vim.opt.relativenumber = true
vim.opt.signcolumn = "yes"
vim.opt.hlsearch = true
vim.opt.expandtab = true
vim.opt.inccommand = "split"

-- TODO: need some way to prevent cursor from reaching bottom of a long page without scrolling
-- must be some basic option i had setup on older configs

-- wrapped lines indent to the same level as first line
vim.opt.breakindent = true


-- commented out for now bc this could be lang specific. tabs in golang should stay tabs, right?
-- vim.opt.expandtab = true

vim.opt.undofile = true
vim.opt.shada = { "'10", "<0", "s10", "h" }

-- trial run to use the `+` register more deliberately
-- vim.opt.clipboard = "unnamedplus"


