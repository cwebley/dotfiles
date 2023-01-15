
-- press jk fast to enter normal mode
vim.keymap.set("i", "jk", "<ESC>")

-- Splits
--vim.keymap.set("n", "ss", ":split<Return><C-w>w")
--vim.keymap.set("n", "sv", ":vsplit<Return><C-w>w")
--vim.keymap.set("n", "sh", "<C-w>h")
--vim.keymap.set("n", "sj", "<C-w>j")
--vim.keymap.set("n", "sk", "<C-w>k")
--vim.keymap.set("n", "sl", "<C-w>l")
--vim.keymap.set("n", "sq", "<C-w>q")

-- Using a simple plugin to provide better forward/backward surfing
--vim.keymap.set("n", "<C-t>", "<C-^>")
--vim.keymap.set("n", "<C-x>", ":bp <bar> bd#<CR>")

-- Neovim
--vim.keymap.set("n", "<leader>vv", ":e $MYVIMRC<cr>")

-- Miscellaneous
vim.keymap.set("v", "<leader>y", '"+y') -- Copy to clipboard
--vim.keymap.set("n", "H", ":w<CR>") -- Quick save
--vim.keymap.set("i", "<C-h>", "<Lseft>") -- Move left in insert
--vim.keymap.set("i", "<C-l>", "<Right>") -- Move right in insert
vim.keymap.set("x", "<leader>p", '"_dP') -- Keep paste register after paste

-- Move text up and down
-- this has some problems with alacritty--need a alacritty.yml change
vim.keymap.set("n", "<A-j>", "<Esc>:m .+1<CR>==")
vim.keymap.set("n", "<A-k>", "<Esc>:m .-2<CR>==")

-- Visual Block --
-- Move text up and down
vim.keymap.set("x", "J", ":move '>+1<CR>gv-gv")
vim.keymap.set("x", "K", ":move '<-2<CR>gv-gv")
vim.keymap.set("x", "<A-j>", ":move '>+1<CR>gv-gv")
vim.keymap.set("x", "<a-k>", ":move '<-2<cr>gv-gv")


-- Center the view after jumping up/down
vim.keymap.set("n", "<C-u>", "<C-u>zz")
vim.keymap.set("n", "<C-d>", "<C-d>zz")

-- Navigate buffers
--keymap("n", "<S-l>", ":bnext<CR>", opts)
--keymap("n", "<S-h>", ":bprevious<CR>", opts)

-- Better window navigation
--keymap("n", "<C-h>", "<C-w>h", opts)
--keymap("n", "<C-j>", "<C-w>j", opts)
--keymap("n", "<C-k>", "<C-w>k", opts)
--keymap("n", "<C-l>", "<C-w>l", opts)

-- remove search highlighting by pressing Enter again
vim.keymap.set("n", "<CR>", ":noh<CR>")

--tmux-sessionizer
vim.keymap.set("n", "<C-f>", "<cmd>silent !tmux neww tmux-sessionizer<cr>")

