local function get_git_head()
  local head = vim.fn.FugitiveHead()
  if head == "" or head == nil then
    return "DETATCHED "
  end
  if string.len(head) > 20 then
    head = ".." .. head:sub(15)
  end
  return " " .. head
end

local function search_result()
  if vim.v.hlsearch == 0 then
    return ''
  end
  local last_search = vim.fn.getreg('/')
  if not last_search or last_search == '' then
    return ''
  end
  local searchcount = vim.fn.searchcount { maxcount = 9999 }
  return last_search .. '(' .. searchcount.current .. '/' .. searchcount.total .. ')'
end

return {
  "nvim-lualine/lualine.nvim",
  requires = { "kyazdani42/nvim-web-devicons", opt = true },
  config = function()
    require("lualine").setup({
      options = {
        component_separators = { right = "" },
        section_separators = { left = "", right = "" },
        theme = "kanagawa",
      },
      sections = {
        lualine_a = { get_git_head },
        lualine_b = { "diff", "diagnostics" },
        lualine_c = {
          {
            "filetype",
            colored = true, -- Displays filetype icon in color if set to true
            icon_only = true, -- Display only an icon for filetype
          },
          {
            "filename",
            file_status = true,
            path = 1,
            symbols = {
              modified = "  ", -- Text to show when the file is modified.
              readonly = "[-]", -- Text to show when the file is non-modifiable or readonly.
              unnamed = "[No Name]", -- Text to show for unnamed buffers.
            },
          },
        },
        lualine_d = {},
        lualine_w = {},
        lualine_x = {},
        lualine_y = { search_result },
        lualine_z = {},
      },
    })
  end
}
