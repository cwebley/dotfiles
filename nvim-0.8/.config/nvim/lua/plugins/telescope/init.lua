return {
  "nvim-telescope/telescope.nvim",
  dependencies = { "nvim-lua/plenary.nvim" },
  config = function()
    local telescope = require("telescope")
    local actions = require("telescope.actions")

    telescope.setup({
      defaults = {
        layout_strategy = "horizontal",
        file_ignore_patterns = { "node_modules", "package%-lock.json" },
        mappings = {
          i = {
            ["<C-n>"] = actions.cycle_history_next,
            ["<C-p>"] = actions.cycle_history_prev,

            ["<C-j>"] = actions.move_selection_next,
            ["<C-k>"] = actions.move_selection_previous,

            ["<C-c>"] = actions.close,

            ["<Down>"] = actions.move_selection_next,
            ["<Up>"] = actions.move_selection_previous,

            ["<CR>"] = actions.select_default,
            ["<C-x>"] = actions.select_horizontal,
            ["<C-v>"] = actions.select_vertical,
            ["<C-t>"] = actions.select_tab,

            ["<C-u>"] = actions.preview_scrolling_up,
            ["<C-d>"] = actions.preview_scrolling_down,

            ["<PageUp>"] = actions.results_scrolling_up,
            ["<PageDown>"] = actions.results_scrolling_down,

            ["<Tab>"] = actions.toggle_selection + actions.move_selection_worse,
            ["<S-Tab>"] = actions.toggle_selection + actions.move_selection_better,
            -- ["<C-q>"] = actions.send_to_qflist + actions.open_qflist,
            ["<M-q>"] = actions.send_selected_to_qflist + actions.open_qflist,
            ["<C-l>"] = actions.complete_tag,
          },
          n = {
            ["<esc>"] = actions.close,
            ["<C-c>"] = actions.close,
            ["<CR>"] = actions.select_default,
            ["<C-x>"] = actions.select_horizontal,
            ["<C-v>"] = actions.select_vertical,
            ["<C-t>"] = actions.select_tab,

            ["<Tab>"] = actions.toggle_selection + actions.move_selection_worse,
            ["<S-Tab>"] = actions.toggle_selection + actions.move_selection_better,
            ["<C-q>"] = actions.send_to_qflist + actions.open_qflist,
            ["<M-q>"] = actions.send_selected_to_qflist + actions.open_qflist,

            ["j"] = actions.move_selection_next,
            ["k"] = actions.move_selection_previous,
            ["H"] = actions.move_to_top,
            ["M"] = actions.move_to_middle,
            ["L"] = actions.move_to_bottom,

            ["<Down>"] = actions.move_selection_next,
            ["<Up>"] = actions.move_selection_previous,
            ["gg"] = actions.move_to_top,
            ["G"] = actions.move_to_bottom,

            ["<C-u>"] = actions.preview_scrolling_up,
            ["<C-d>"] = actions.preview_scrolling_down,

            ["<PageUp>"] = actions.results_scrolling_up,
            ["<PageDown>"] = actions.results_scrolling_down,

      },
        },
      },
      pickers = {
        live_grep = {
          layout_strategy = "vertical",
          layout_config = {
            preview_height = .35,
          },
          use_regex = false,
          only_sort_text = true,
          prompt_prefix = " ",
          mappings = {
            i = {
              -- ["<C-y>"] = CopyTextFromPreview,
              -- ["<C-h>"] = OpenInFileBrowser,
            },
          },
        },
        git_files = {
          layout_strategy = "horizontal",
          layout_config = {
            preview_width = .60,
          },
          show_untracked = true,
          mappings = {
            i = {
              -- ["<C-h>"] = OpenInFileBrowser,
            },
          },
        },
        git_branches = {
          layout_strategy = "vertical",
          -- layout_config = {
          --   preview_width = .60,
          -- },
          prompt_prefix = " ",
          mappings = {
            i = {
              -- ["<C-o>"] = CheckoutAndRestore,
              -- ["<Enter>"] = CheckoutAndRestore,
            },
          },
        },
        current_buffer_fuzzy_find = {
          previewer = false,
          sorting_strategy = "ascending",
          prompt_prefix = " ",
        },
        buffers = {
          hidden = true,
        },
        git_commits = {
          layout_strategy = "horizontal",
          layout_config = {
            preview_width = .60,
          },
          prompt_prefix = " ",
          mappings = {
            i = {
              -- ["<C-o>"] = SeeCommitChangesInDiffview,
              -- ["<C-y>"] = CopyCommitHash,
              -- ["<C-d><C-f>"] = CompareWithCurrentBranchInDiffview,
            },
          },
        },
      },
    })


    vim.keymap.set('n', '<leader>?', require('telescope.builtin').oldfiles, { desc = '[?] Find recently opened files' })
    vim.keymap.set('n', '<leader><space>', require('telescope.builtin').buffers, { desc = '[ ] Find existing buffers' })
    vim.keymap.set('n', '<leader>/', function()
      -- You can pass additional configuration to telescope to change theme, layout, etc.
      require('telescope.builtin').current_buffer_fuzzy_find(require('telescope.themes').get_dropdown {
        winblend = 10,
        previewer = false,
      })
    end, { desc = '[/] Fuzzily search in current buffer]' })

    vim.keymap.set('n', '<leader>sf', require('telescope.builtin').find_files, { desc = '[S]earch [F]iles' })
    vim.keymap.set('n', '<leader>sh', require('telescope.builtin').help_tags, { desc = '[S]earch [H]elp' })
    vim.keymap.set('n', '<leader>sw', require('telescope.builtin').grep_string, { desc = '[S]earch current [W]ord' })
    vim.keymap.set('n', '<leader>sg', require('telescope.builtin').live_grep, { desc = '[S]earch by [G]rep' })
    vim.keymap.set('n', '<leader>sd', require('telescope.builtin').diagnostics, { desc = '[S]earch [D]iagnostics' })

    -- vim.keymap.set("n", "<C-f>", live_grep, {})
    -- vim.keymap.set("n", "<C-c>", current_buffer_fuzzy_find, {})
    -- vim.keymap.set("n", "<C-j>", git_files, {})
    -- vim.keymap.set("n", "<C-m>", telescope.extensions.file_browser.file_browser, { silent = true, noremap = true })
    -- vim.keymap.set("n", "<leader>tgc", git_commits, {})
    -- vim.keymap.set("n", "<leader>tgb", git_branches, {})
    -- vim.keymap.set("n", "<leader>tf", grep_string, {})
    -- vim.keymap.set("v", "<leader>tf", grep_string_visual, {})
    -- vim.keymap.set("n", "<C-h>", OpenFileInFileBrowser)
    --
    telescope.load_extension("fzf")

  end
}
