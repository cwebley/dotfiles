local status_ok, telescope = pcall(require, "telescope")
if not status_ok then
  return
end

local h_status_ok, harpoon = pcall(require, "harpoon")
if not h_status_ok then
  return
end
-- TODO: bind this? will I ever use this extension?
-- telescope.load_extension "harpoon"


-- these are all defaults
harpoon.setup({
  global_settings = {
    -- sets the marks upon calling `toggle` on the ui, instead of require `:w`.
    save_on_toggle = false,

    -- saves the harpoon file upon every change. disabling is unrecommended.
    save_on_change = true,

    -- sets harpoon to run the command immediately as it's passed to the terminal when calling `sendCommand`.
    enter_on_sendcmd = false,

    -- closes any tmux windows harpoon that harpoon creates when you close Neovim.
    tmux_autoclose_windows = false,

    -- filetypes that you want to prevent from adding to the harpoon list menu.
    excluded_filetypes = { "harpoon" },

    -- set marks specific to each git branch inside git repository
    mark_branch = false,
  }
})
