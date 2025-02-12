return {
	{
		"nvim-treesitter/nvim-treesitter",
		build = ":TSUpdate",
		config = function()
			local config = require("nvim-treesitter.configs")

			config.setup({
				-- note astro needs astro, tsx, css
				ensure_installed = { "lua", "vim", "vimdoc", "query", "astro", "tsx", "css", "javascript", "typescript", "html" },
				auto_install = true,
				highlight = { enable = true },
				indent = { enable = true },

				-- Modules and its options go here
				-- incremental_selection = { enable = true },
				-- textobjects = {
				--   select = {
				--     enable = true,
				--     lookahead = true, -- Automatically jump forward to textobj, similar to targets.vim
				--     keymaps = {
				--       -- You can use the capture groups defined in textobjects.scm
				--       ["aa"] = "@parameter.outer",
				--       ["ia"] = "@parameter.inner",
				--       ["af"] = "@function.outer",
				--       ["if"] = "@function.inner",
				--       ["ac"] = "@class.outer",
				--       ["ic"] = "@class.inner",
				--     },
				--   },
				--   move = {
				--     enable = true,
				--     set_jumps = true, -- whether to set jumps in the jumplist
				--     goto_next_start = {
				--       ["]m"] = "@function.outer",
				--       ["]]"] = "@class.outer",
				--     },
				--     goto_next_end = {
				--       ["]M"] = "@function.outer",
				--       ["]["] = "@class.outer",
				--     },
				--     goto_previous_start = {
				--       ["[m"] = "@function.outer",
				--       ["[["] = "@class.outer",
				--     },
				--     goto_previous_end = {
				--       ["[M"] = "@function.outer",
				--       ["[]"] = "@class.outer",
				--     },
				--   },
				-- },
			})
		end,
	},
	{ "nvim-treesitter/nvim-treesitter-context" },
}
