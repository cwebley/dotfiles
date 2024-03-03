return {
	{
		"tpope/vim-sleuth", -- Detect tabstop and shiftwidth automatically
	},
	{
		"kylechui/nvim-surround",
		version = "*", -- Use for stability; omit to use `main` branch for the latest features
		event = "VeryLazy",
		config = function()
			require("nvim-surround").setup({})
		end,
	},
	{
		"windwp/nvim-autopairs",
		config = function()
			require("nvim-autopairs").setup()
		end,
	},
	{
		"numToStr/Comment.nvim",
		opts = {},
	},

	-- TODO this seems great, haven't tried
	-- { -- Autoformat
	--    'stevearc/conform.nvim',
	--    opts = {
	--      notify_on_error = false,
	--      format_on_save = {
	--        timeout_ms = 500,
	--        lsp_fallback = true,
	--      },
	--      formatters_by_ft = {
	--        lua = { 'stylua' },
	--        -- Conform can also run multiple formatters sequentially
	--        -- python = { "isort", "black" },
	--        --
	--        -- You can use a sub-list to tell conform to run *until* a formatter
	--        -- is found.
	--        -- javascript = { { "prettierd", "prettier" } },
	--      },
	--    },
	-- },
	{
		"folke/todo-comments.nvim",
		event = "VimEnter",
		dependencies = { "nvim-lua/plenary.nvim" },
		opts = { signs = false },
	},
	{ -- Collection of various small independent plugins/modules
		"echasnovski/mini.nvim",
		config = function()
			-- Better Around/Inside textobjects
			--
			-- Examples:
			--  - va)  - [V]isually select [A]round [)]paren
			--  - yinq - [Y]ank [I]nside [N]ext [']quote
			--  - ci'  - [C]hange [I]nside [']quote
			require("mini.ai").setup({ n_lines = 500 })

			-- Add/delete/replace surroundings (brackets, quotes, etc.)
			--
			-- - saiw) - [S]urround [A]dd [I]nner [W]ord [)]Paren
			-- - sd'   - [S]urround [D]elete [']quotes
			-- - sr)'  - [S]urround [R]eplace [)] [']
			require("mini.surround").setup()

			-- Simple and easy statusline.
			--  You could remove this setup call if you don't like it,
			--  and try some other statusline plugin
			local statusline = require("mini.statusline")
			statusline.setup()

			-- You can configure sections in the statusline by overriding their
			-- default behavior. For example, here we disable the section for
			-- cursor information because line numbers are already enabled
			---@diagnostic disable-next-line: duplicate-set-field
			statusline.section_location = function()
				return ""
			end

			-- ... and there is more!
			--  Check out: https://github.com/echasnovski/mini.nvim
		end,
	},
}
