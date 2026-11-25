-- Run from the repo root: nvim --headless -u NONE -l scripts/tests/nvim-trailmix.lua
local path = "nvim/.config/nvim/lua/plugins/trailmix.lua"
local function load_spec(present)
  local chunk = assert(loadfile(path))
  setfenv(chunk, {
    vim = {
      fn = {
        expand = function(value)
          return (value:gsub("^~", "/test-home"))
        end,
        isdirectory = function(dir)
          assert(dir == "/test-home/src/trailmix")
          return present and 1 or 0
        end,
      },
    },
  })
  return chunk()
end

assert(next(load_spec(false)) == nil, "missing checkout must not register a plugin")
local spec = load_spec(true)
assert(#spec == 1)
assert(spec[1].dir == "/test-home/src/trailmix")
assert(spec[1].name == "trailmix")
assert(spec[1].lazy == false)
assert(spec[1].opts.cli == "/test-home/.local/bin/trailmix")
assert(spec[1].opts.mapping == "<leader>mt")
print("PASS: optional TrailMix plugin, absent and present checkout")
