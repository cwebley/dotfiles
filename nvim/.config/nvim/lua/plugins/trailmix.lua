-- TrailMix is an optional local checkout, not part of a fresh Mac install.
local dir = vim.fn.expand("~/src/trailmix")
if vim.fn.isdirectory(dir) == 0 then
  return {}
end

return {
  {
    dir = dir,
    name = "trailmix",
    lazy = false,
    opts = {
      cli = vim.fn.expand("~/.local/bin/trailmix"),
      mapping = "<leader>mt",
    },
  },
}
